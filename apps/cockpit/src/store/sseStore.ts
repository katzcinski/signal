import { create } from 'zustand';
import type { SSEEvent, CheckResult } from '@/types';

interface LiveRun {
  run_id: string;
  dataset: string;
  results: CheckResult[];
  finished: boolean;
}

interface SSEState {
  liveRuns: Record<string, LiveRun>;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
}

let es: EventSource | null = null;

export const useSseStore = create<SSEState>((set, get) => ({
  liveRuns: {},
  connected: false,

  connect() {
    if (es) return;
    es = new EventSource('/api/stream');

    es.addEventListener('message', (ev) => {
      try {
        const event: SSEEvent = JSON.parse(ev.data);
        set(state => {
          const runs = { ...state.liveRuns };
          if (event.type === 'run_started') {
            runs[event.run_id] = { run_id: event.run_id, dataset: event.dataset, results: [], finished: false };
          } else if (event.type === 'check_result') {
            const run = runs[event.run_id];
            if (run) runs[event.run_id] = { ...run, results: [...run.results, event.result] };
          } else if (event.type === 'run_finished') {
            const run = runs[event.run_id];
            if (run) runs[event.run_id] = { ...run, finished: true };
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
