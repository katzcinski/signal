// Standalone theme-preview generator. Renders a representative cockpit screen
// (sidebar, topbar, KPIs, hero chart, object table) under several candidate
// themes and screenshots each one for design selection. Not part of the app.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../../docs/theme-previews');
mkdirSync(OUT, { recursive: true });

// ── Candidate themes — each is just a token set (+ a couple of texture hooks) ──
const THEMES = {
  blueprint: {
    name: 'Blueprint',
    tag: 'Cyanotype · technische Zeichnung',
    vars: {
      '--bg-0': '#071726', '--bg-1': '#0B2034', '--bg-2': '#112B43', '--bg-3': '#173651',
      '--line': '#1E3F5C', '--line-2': '#2C5478',
      '--fg': '#DCEBF7', '--fg-2': '#90B4CF', '--fg-3': '#5F86A2',
      '--accent': '#5BC8F0', '--accent-bright': '#8FE0FF', '--accent-dim': 'rgba(91,200,240,0.14)',
      '--obs': '#F2A93B', '--qual': '#36D6BD', '--cont': '#6AA8FF',
      '--ok': '#3FB07A', '--warn': '#E0B23E', '--fail': '#E2783C', '--crit': '#E5484D',
      '--grid': 'linear-gradient(rgba(91,200,240,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(91,200,240,0.05) 1px, transparent 1px)',
      '--grid-size': '26px 26px',
    },
    scanline: false,
  },
  daylight: {
    name: 'Daylight',
    tag: 'Swiss-Editorial · Papier & Tinte',
    vars: {
      '--bg-0': '#E9E4DA', '--bg-1': '#F7F4EE', '--bg-2': '#FFFFFF', '--bg-3': '#EDE7DB',
      '--line': '#D8D0C1', '--line-2': '#C3B9A6',
      '--fg': '#211D17', '--fg-2': '#574F44', '--fg-3': '#897F70',
      '--accent': '#C0492B', '--accent-bright': '#9C2F18', '--accent-dim': 'rgba(192,73,43,0.10)',
      '--obs': '#B5760F', '--qual': '#0F8A74', '--cont': '#3F5BB0',
      '--ok': '#2F7D4F', '--warn': '#B07A14', '--fail': '#C0492B', '--crit': '#A21B1B',
      '--grid': 'none', '--grid-size': '24px 24px',
    },
    scanline: false,
  },
  amber: {
    name: 'Amber CRT',
    tag: 'Phosphor-Terminal · monochrom',
    vars: {
      '--bg-0': '#0A0805', '--bg-1': '#110C06', '--bg-2': '#1A1309', '--bg-3': '#251A0D',
      '--line': '#3A2A14', '--line-2': '#553B1B',
      '--fg': '#F4C77B', '--fg-2': '#C0913F', '--fg-3': '#8A6A33',
      '--accent': '#FFB643', '--accent-bright': '#FFD884', '--accent-dim': 'rgba(255,182,67,0.14)',
      '--obs': '#FFB643', '--qual': '#8FB63A', '--cont': '#E9A23B',
      '--ok': '#8FB63A', '--warn': '#E9A23B', '--fail': '#E5552E', '--crit': '#E5384D',
      '--grid': 'radial-gradient(rgba(255,182,67,0.05) 1px, transparent 1px)',
      '--grid-size': '22px 22px',
    },
    scanline: true,
  },
};

// Simple procedural area-chart path so the hero panel looks real.
function chart(w, h, seed) {
  const n = 28; let v = 0.5; const pts = [];
  for (let i = 0; i < n; i++) {
    v += (Math.sin(i * 0.7 + seed) + Math.cos(i * 0.31 + seed * 2)) * 0.06;
    v = Math.max(0.12, Math.min(0.92, v));
    pts.push([(i / (n - 1)) * w, h - v * h]);
  }
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  return { line, area };
}

function navIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`;
}

const NAV = ['Meine Arbeit','Cockpit','Objekte','Contracts','Lineage','Incidents','Proposals','Governance','Library'];
const ROWS = [
  ['SALES.ORDERS', 'Bestellkopf', 'pass', '99.8%', 'Freshness · Volumen'],
  ['SALES.ORDER_ITEMS', 'Bestellpositionen', 'pass', '99.2%', 'Schema · Keys'],
  ['FIN.GL_BALANCES', 'Hauptbuch-Salden', 'warn', '96.4%', 'Vollständigkeit'],
  ['MDM.CUSTOMER', 'Kundenstamm', 'pass', '99.9%', 'Keys · Unique'],
  ['INV.STOCK_LEVELS', 'Bestandshöhen', 'fail', '88.1%', 'Freshness'],
  ['HR.EMPLOYEE', 'Mitarbeiterstamm', 'pass', '100%', 'Schema'],
];

function statusColor(s) {
  return { pass: 'var(--ok)', warn: 'var(--warn)', fail: 'var(--fail)', crit: 'var(--crit)' }[s];
}
function statusLabel(s) {
  return { pass: 'PASS', warn: 'WARN', fail: 'FAIL', crit: 'CRIT' }[s];
}

function html(theme) {
  const t = THEMES[theme];
  const c = chart(560, 150, theme.length);
  const varBlock = Object.entries(t.vars).map(([k, v]) => `${k}:${v};`).join('');
  const kpis = [
    ['Überwachte Objekte', '142', 'var(--cont)', '+6 diese Woche'],
    ['Pass-Rate (24h)', '97.3%', 'var(--ok)', '▲ 0.8 pp'],
    ['Offene Incidents', '3', 'var(--fail)', '1 SLA-kritisch'],
    ['Contract-Coverage', '81%', 'var(--qual)', '115 / 142'],
  ];
  const sideList = [
    ['INV.STOCK_LEVELS', 'Freshness > 6h', 'fail'],
    ['FIN.GL_BALANCES', 'Vollständigkeit 96.4%', 'warn'],
    ['SALES.RETURNS', 'Volumen-Anomalie', 'warn'],
  ];

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{${varBlock}
    --r:6px;--mono:ui-monospace,'SFMono-Regular',Menlo,monospace;
    --ui:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;}
  body{width:1440px;height:900px;background:var(--bg-0);color:var(--fg);
    font-family:var(--ui);font-size:13px;line-height:1.5;-webkit-font-smoothing:antialiased;
    font-variant-numeric:tabular-nums;overflow:hidden}
  .shell{height:900px;display:flex;flex-direction:column;
    background-image:var(--grid);background-size:var(--grid-size);background-color:var(--bg-0)}
  .health{height:3px;display:flex}
  .health i{display:block}
  .row{flex:1;display:flex;min-height:0}
  aside{width:212px;background:var(--bg-1);border-right:1px solid var(--line);display:flex;flex-direction:column;flex-shrink:0}
  .brand{display:flex;align-items:center;gap:9px;padding:15px 16px;border-bottom:1px solid var(--line)}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--accent-dim)}
  .word{font-family:var(--mono);font-weight:600;font-size:13px;letter-spacing:.22em;text-transform:uppercase}
  nav{padding:8px 0;flex:1}
  .nav{display:flex;align-items:center;gap:10px;padding:8px 14px;margin:1px 7px;border-radius:var(--r);color:var(--fg-2)}
  .nav.active{background:var(--bg-2);color:var(--fg);box-shadow:inset 2px 0 0 var(--accent)}
  .nav.active svg{color:var(--accent)}
  .nav svg{flex-shrink:0}
  .col{flex:1;display:flex;flex-direction:column;min-width:0}
  header.top{height:46px;background:var(--bg-1);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;padding:0 16px;flex-shrink:0}
  .menu{color:var(--fg-2)}
  .search{display:flex;align-items:center;gap:30px;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--r);padding:5px 8px 5px 12px;color:var(--fg-3);font-size:12px}
  .kbd{font-family:var(--mono);font-size:10px;background:var(--bg-0);border:1px solid var(--line-2);border-radius:3px;padding:1px 5px;color:var(--fg-3)}
  .spacer{flex:1}
  .pill{display:inline-flex;align-items:center;gap:7px;background:var(--bg-2);border:1px solid var(--line-2);border-radius:var(--r);padding:5px 11px;font-size:12px;color:var(--fg-2)}
  .pill .dot{width:8px;height:8px}
  .roleSel{background:var(--accent-dim);border:1px solid var(--accent);color:var(--accent);border-radius:var(--r);padding:4px 10px;font-size:11px;font-weight:600}
  main{flex:1;overflow:hidden;padding:22px 26px}
  .eyebrow{font-family:var(--mono);text-transform:uppercase;letter-spacing:.14em;font-size:10px;color:var(--fg-3)}
  h1{font-size:24px;font-weight:600;letter-spacing:-.01em;margin:6px 0 2px}
  .sub{color:var(--fg-2);font-size:13px;margin-bottom:20px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:18px}
  .card{background:var(--bg-1);border:1px solid var(--line);border-radius:var(--r)}
  .kpi{padding:15px 16px;position:relative;overflow:hidden}
  .kpi .lab{font-size:11px;color:var(--fg-2);text-transform:uppercase;letter-spacing:.04em}
  .kpi .val{font-size:30px;font-weight:600;margin-top:8px;font-variant-numeric:tabular-nums}
  .kpi .meta{font-size:11px;color:var(--fg-3);margin-top:4px}
  .kpi .bar{position:absolute;left:0;top:0;bottom:0;width:3px}
  .hero{display:grid;grid-template-columns:1.85fr 1fr;gap:16px;margin-bottom:18px}
  .ph{padding:16px 18px}
  .ph .hd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px}
  .ph .ti{font-size:14px;font-weight:600}
  .legend{font-family:var(--mono);font-size:10px;color:var(--fg-3);letter-spacing:.08em}
  .sideitem{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}
  .sideitem:last-child{border-bottom:none}
  .sq{width:7px;height:24px;border-radius:2px;flex-shrink:0}
  .sideitem .nm{font-family:var(--mono);font-size:12px}
  .sideitem .ds{font-size:11px;color:var(--fg-2)}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;font-family:var(--mono);font-weight:500;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--fg-3);padding:0 12px 9px;border-bottom:1px solid var(--line)}
  td{padding:9px 12px;border-bottom:1px solid var(--line);font-size:12.5px}
  tr:last-child td{border-bottom:none}
  .obj{font-family:var(--mono);font-size:12px}
  .stat{display:inline-flex;align-items:center;gap:6px;font-family:var(--mono);font-size:10px;letter-spacing:.06em;padding:2px 8px;border-radius:99px}
  .gco{font-family:var(--mono);font-size:11px;color:var(--fg-2)}
  .scan{position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(transparent 0 2px, rgba(0,0,0,.18) 2px 3px)}
  </style></head><body><div class="shell">
    <div class="health">
      <i style="width:74%;background:var(--ok)"></i>
      <i style="width:14%;background:var(--warn)"></i>
      <i style="width:7%;background:var(--crit)"></i>
      <i style="flex:1;background:var(--line-2)"></i>
    </div>
    <div class="row">
      <aside>
        <div class="brand"><span class="dot"></span><span class="word">Signal</span></div>
        <nav>${NAV.map((n,i)=>`<div class="nav${i===1?' active':''}">${navIcon()}<span>${n}</span></div>`).join('')}</nav>
      </aside>
      <div class="col">
        <header class="top">
          <span class="menu">${navIcon()}</span>
          <span class="search"><span>Objekte, Contracts, Seiten suchen…</span><span class="kbd">⌘K</span></span>
          <span class="spacer"></span>
          <span class="pill"><span class="dot"></span>${t.name}</span>
          <span class="pill">↕ Komfortabel</span>
          <span class="roleSel">ROLLE · STEWARD ▾</span>
        </header>
        <main>
          <div class="eyebrow">Übersicht · Cockpit</div>
          <h1>Daten-Qualität &amp; Observability</h1>
          <div class="sub">SAP Datasphere · Plattform-Domäne <b>Vertrieb &amp; Finanzen</b> · Stand 14:20</div>
          <div class="kpis">
            ${kpis.map(([l,v,col,m])=>`<div class="card kpi"><span class="bar" style="background:${col}"></span><div class="lab">${l}</div><div class="val" style="color:${col}">${v}</div><div class="meta">${m}</div></div>`).join('')}
          </div>
          <div class="hero">
            <div class="card ph">
              <div class="hd"><span class="ti">Pass-Rate · 14 Tage</span><span class="legend">FRESHNESS · VOLUMEN · SCHEMA</span></div>
              <svg width="100%" viewBox="0 0 560 150" preserveAspectRatio="none" style="display:block">
                <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stop-color="var(--accent)" stop-opacity="0.34"/>
                  <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
                <path d="${c.area}" fill="url(#g)"/>
                <path d="${c.line}" fill="none" stroke="var(--accent)" stroke-width="2"/>
              </svg>
            </div>
            <div class="card ph">
              <div class="hd"><span class="ti">Braucht Aufmerksamkeit</span><span class="legend">3</span></div>
              ${sideList.map(([n,d,s])=>`<div class="sideitem"><span class="sq" style="background:${statusColor(s)}"></span><div><div class="nm">${n}</div><div class="ds">${d}</div></div></div>`).join('')}
            </div>
          </div>
          <div class="card ph" style="padding:16px 0 4px">
            <div class="hd" style="padding:0 16px"><span class="ti">Objekt-Status</span><span class="legend">142 OBJEKTE · 6 GEZEIGT</span></div>
            <table>
              <thead><tr><th>Objekt</th><th>Bezeichnung</th><th>Status</th><th>Pass-Rate</th><th>Garantie-Familien</th></tr></thead>
              <tbody>${ROWS.map(([o,d,s,p,g])=>`<tr><td class="obj">${o}</td><td>${d}</td><td><span class="stat" style="color:${statusColor(s)};background:var(--accent-dim);background:${statusColor(s)}22">${statusLabel(s)}</span></td><td class="gco">${p}</td><td style="color:var(--fg-2)">${g}</td></tr>`).join('')}</tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
    ${t.scanline ? '<div class="scan"></div>' : ''}
  </div></body></html>`;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
for (const key of Object.keys(THEMES)) {
  await page.setContent(html(key), { waitUntil: 'networkidle' });
  const file = resolve(OUT, `theme-${key}.png`);
  await page.screenshot({ path: file });
  console.log('wrote', file);
}
await browser.close();
