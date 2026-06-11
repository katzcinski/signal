import { create } from 'zustand';
import type { SSEEvent, OverallStatus, RunEvent } from '@/types';

interface LiveRun {
  run_id: string;
  dataset: string;
  lines: RunEvent[];
  status: 'running' | 'finished' | 'error';
  overall_status?: OverallStatus;
  error?: string;
}

interface SSEState {
  liveRuns: Record<string, LiveRun>;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
}

let es: EventSource | null = null;

export const useSseStore = create<SSEState>((set) => ({
  liveRuns: {},
  connected: false,

  connect() {
    if (es) return;
    es = new EventSource('/api/stream');

    es.addEventListener('message', (ev) => {
      try {
        const event: SSEEvent = JSON.parse(ev.data);
        if (event.type === 'connected') {
          set({ connected: true });
          return;
        }
        set(state => {
          const runs = { ...state.liveRuns };
          if (event.type === 'run_started') {
            runs[event.run_id] = { run_id: event.run_id, dataset: event.dataset, lines: [], status: 'running' };
          } else if (event.type === 'progress') {
            const run = runs[event.run_id];
            if (run) runs[event.run_id] = { ...run, lines: [...run.lines, { ts: event.ts, line: event.line }] };
          } else if (event.type === 'run_finished') {
            const run = runs[event.run_id];
            if (run) runs[event.run_id] = { ...run, status: 'finished', overall_status: event.overall_status };
          } else if (event.type === 'run_error') {
            const run = runs[event.run_id];
            if (run) runs[event.run_id] = { ...run, status: 'error', error: event.error };
          }
          return { liveRuns: runs };
        });
      } catch { /* ignore parse errors */ }
    });

    es.addEventListener('open', () => set({ connected: true }));
    es.addEventListener('error', () => set({ connected: false }));
  },

  disconnect() {
    es?.close();
    es = null;
    set({ connected: false });
  },
}));
