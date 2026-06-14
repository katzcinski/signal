import { useState } from 'react';
import { Panel } from '@/components/ui/Panel';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ReadOnlyBanner } from '@/components/ui/ReadOnlyBanner';
import {
  useNotificationConfig, useCreateChannel, usePatchChannel, useDeleteChannel,
  useCreateRule, useDeleteRule, useCreateMute, useDeleteMute,
} from '@/api/notifications';
import { t } from '@/i18n/de';
import type { NotificationChannel, NotificationRule, NotificationMute } from '@/types';

const input: React.CSSProperties = {
  background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 5,
  padding: '5px 8px', color: 'var(--fg)', fontSize: 12,
};
const primaryBtn: React.CSSProperties = {
  background: 'var(--cont)', color: '#fff', border: 'none', borderRadius: 5,
  padding: '6px 14px', fontSize: 12, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--line-2)', borderRadius: 5,
  padding: '4px 10px', fontSize: 11, color: 'var(--fg-3)', cursor: 'pointer',
};
const label: React.CSSProperties = { fontSize: 10, color: 'var(--fg-3)', display: 'block', marginBottom: 3 };

function muteState(m: NotificationMute): 'active' | 'scheduled' | 'expired' {
  const now = Date.now();
  const s = new Date(m.starts_at).getTime();
  const e = new Date(m.ends_at).getTime();
  if (now < s) return 'scheduled';
  if (now > e) return 'expired';
  return 'active';
}

const STATE_COLOR: Record<string, string> = {
  active: 'var(--status-warn)', scheduled: 'var(--cont)', expired: 'var(--fg-3)',
};

// --- Channels ---
function ChannelsSection({ channels, canEdit }: { channels: NotificationChannel[]; canEdit: boolean }) {
  const create = useCreateChannel();
  const patch = usePatchChannel();
  const del = useDeleteChannel();
  const [name, setName] = useState('');
  const [type, setType] = useState('slack');
  const [url, setUrl] = useState('');

  const submit = () => {
    if (!name.trim() || !url.trim()) return;
    create.mutate({ name: name.trim(), type, url: url.trim() }, {
      onSuccess: () => { setName(''); setUrl(''); },
    });
  };

  return (
    <Panel title={`${t.notifications.channelsTitle} (${channels.length})`}>
      <p style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 10 }}>{t.notifications.channelsHint}</p>
      {channels.length === 0 && <p style={{ fontSize: 12, color: 'var(--fg-3)' }}>{t.notifications.noChannels}</p>}
      {channels.map(c => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, minWidth: 120 }}>{c.name}</span>
          <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--cont)', border: '1px solid var(--line-2)', borderRadius: 4, padding: '1px 6px' }}>{c.type}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.url}</span>
          <label style={{ fontSize: 11, color: 'var(--fg-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox" checked={c.enabled} disabled={!canEdit}
              onChange={e => patch.mutate({ id: c.id, enabled: e.target.checked })}
            />
            {c.enabled ? t.notifications.enabled : t.notifications.disabled}
          </label>
          {canEdit && <button style={ghostBtn} onClick={() => del.mutate(c.id)}>{t.notifications.delete}</button>}
        </div>
      ))}
      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 12 }}>
          <div><span style={label}>{t.notifications.name}</span><input style={input} value={name} onChange={e => setName(e.target.value)} /></div>
          <div><span style={label}>{t.notifications.type}</span>
            <select style={input} value={type} onChange={e => setType(e.target.value)}>
              <option value="slack">slack</option>
              <option value="teams">teams</option>
              <option value="webhook">webhook</option>
            </select>
          </div>
          <div style={{ flex: 1 }}><span style={label}>{t.notifications.url}</span><input style={{ ...input, width: '100%' }} placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} /></div>
          <button style={primaryBtn} disabled={create.isPending} onClick={submit}>{t.notifications.addChannel}</button>
        </div>
      )}
    </Panel>
  );
}

// --- Rules ---
function RulesSection({ rules, channels, canEdit }: { rules: NotificationRule[]; channels: NotificationChannel[]; canEdit: boolean }) {
  const create = useCreateRule();
  const del = useDeleteRule();
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState<number | ''>(channels[0]?.id ?? '');
  const [severity, setSeverity] = useState('');
  const [space, setSpace] = useState('');
  const [product, setProduct] = useState('');

  const channelName = (id: number) => channels.find(c => c.id === id)?.name ?? `#${id}`;
  const facets = (r: NotificationRule) => {
    const parts = [
      r.match_severity && `${t.notifications.severity}=${r.match_severity}`,
      r.match_space && `${t.notifications.space}=${r.match_space}`,
      r.match_product && `${t.notifications.product}=${r.match_product}`,
      r.match_owned_by && `${t.notifications.ownedBy}=${r.match_owned_by}`,
      r.match_owner && `${t.notifications.owner}=${r.match_owner}`,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : t.notifications.any;
  };

  const submit = () => {
    if (!name.trim() || channelId === '') return;
    create.mutate(
      { name: name.trim(), channel_id: Number(channelId), match_severity: severity, match_space: space.trim(), match_product: product.trim() },
      { onSuccess: () => { setName(''); setSpace(''); setProduct(''); setSeverity(''); } },
    );
  };

  return (
    <Panel title={`${t.notifications.rulesTitle} (${rules.length})`}>
      <p style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 10 }}>{t.notifications.rulesHint}</p>
      {rules.length === 0 && <p style={{ fontSize: 12, color: 'var(--fg-3)' }}>{t.notifications.noRules}</p>}
      {rules.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 12, fontWeight: 600, minWidth: 140 }}>{r.name}</span>
          <span style={{ fontSize: 11, color: 'var(--fg-2)', flex: 1 }}>{facets(r)}</span>
          <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{t.notifications.routesTo}</span>
          <span style={{ fontSize: 12, color: 'var(--cont)' }}>{channelName(r.channel_id)}</span>
          {canEdit && <button style={ghostBtn} onClick={() => del.mutate(r.id)}>{t.notifications.delete}</button>}
        </div>
      ))}
      {canEdit && channels.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <div><span style={label}>{t.notifications.name}</span><input style={input} value={name} onChange={e => setName(e.target.value)} /></div>
          <div><span style={label}>{t.notifications.severity}</span>
            <select style={input} value={severity} onChange={e => setSeverity(e.target.value)}>
              <option value="">{t.notifications.any}</option>
              <option value="critical">critical</option>
              <option value="fail">fail</option>
              <option value="warn">warn</option>
            </select>
          </div>
          <div><span style={label}>{t.notifications.space}</span><input style={{ ...input, width: 90 }} value={space} onChange={e => setSpace(e.target.value)} /></div>
          <div><span style={label}>{t.notifications.product}</span><input style={{ ...input, width: 110 }} value={product} onChange={e => setProduct(e.target.value)} /></div>
          <div><span style={label}>{t.notifications.channel}</span>
            <select style={input} value={channelId} onChange={e => setChannelId(Number(e.target.value))}>
              {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button style={primaryBtn} disabled={create.isPending} onClick={submit}>{t.notifications.addRule}</button>
        </div>
      )}
    </Panel>
  );
}

// --- Mute windows ---
function MutesSection({ mutes, canEdit }: { mutes: NotificationMute[]; canEdit: boolean }) {
  const create = useCreateMute();
  const del = useDeleteMute();
  const [reason, setReason] = useState('');
  const [space, setSpace] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const submit = () => {
    if (!from || !to) return;
    create.mutate(
      { reason: reason.trim(), match_space: space.trim(), starts_at: new Date(from).toISOString(), ends_at: new Date(to).toISOString() },
      { onSuccess: () => { setReason(''); setSpace(''); setFrom(''); setTo(''); } },
    );
  };

  return (
    <Panel title={`${t.notifications.mutesTitle} (${mutes.length})`}>
      <p style={{ fontSize: 11, color: 'var(--fg-3)', marginBottom: 10 }}>{t.notifications.mutesHint}</p>
      {mutes.length === 0 && <p style={{ fontSize: 12, color: 'var(--fg-3)' }}>{t.notifications.noMutes}</p>}
      {mutes.map(m => {
        const st = muteState(m);
        return (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: STATE_COLOR[st], border: `1px solid ${STATE_COLOR[st]}`, borderRadius: 4, padding: '1px 6px', minWidth: 64, textAlign: 'center' }}>{t.notifications[st]}</span>
            <span style={{ fontSize: 12, flex: 1 }}>{m.reason || '—'}</span>
            <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{m.match_space || m.match_product || t.notifications.any}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>
              {new Date(m.starts_at).toLocaleString()} – {new Date(m.ends_at).toLocaleString()}
            </span>
            {canEdit && <button style={ghostBtn} onClick={() => del.mutate(m.id)}>{t.notifications.delete}</button>}
          </div>
        );
      })}
      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <div><span style={label}>{t.notifications.reason}</span><input style={input} value={reason} onChange={e => setReason(e.target.value)} /></div>
          <div><span style={label}>{t.notifications.space}</span><input style={{ ...input, width: 90 }} value={space} onChange={e => setSpace(e.target.value)} /></div>
          <div><span style={label}>{t.notifications.from}</span><input type="datetime-local" style={input} value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><span style={label}>{t.notifications.to}</span><input type="datetime-local" style={input} value={to} onChange={e => setTo(e.target.value)} /></div>
          <button style={primaryBtn} disabled={create.isPending} onClick={submit}>{t.notifications.addMute}</button>
        </div>
      )}
    </Panel>
  );
}

export default function Notifications() {
  const { data, isLoading, isError, refetch } = useNotificationConfig();
  const canEdit = data?.can_edit ?? false;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)' }}>{t.notifications.title}</h1>
        <p style={{ color: 'var(--fg-3)', fontSize: 12, marginTop: 4 }}>{t.notifications.subtitle}</p>
      </div>

      {isError && <ErrorBanner onRetry={() => refetch()} />}
      {isLoading && <p style={{ color: 'var(--fg-3)', fontSize: 12 }}>{t.common.loading}</p>}

      {data && (
        <>
          {!canEdit && <ReadOnlyBanner hint={t.notifications.readOnlyHint} />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ChannelsSection channels={data.channels} canEdit={canEdit} />
            <RulesSection rules={data.rules} channels={data.channels} canEdit={canEdit} />
            <MutesSection mutes={data.mutes} canEdit={canEdit} />
          </div>
        </>
      )}
    </div>
  );
}
