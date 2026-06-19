import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Density = 'comfortable' | 'compact';

// Visual identity. 'classic' is the original blue-graphite cockpit; 'signal'
// is the instrument-grade phosphor theme. Both are pure token sets driven by a
// data-theme attribute on <html> (applied in Shell).
export type Theme = 'classic' | 'signal';

interface UIState {
  density: Density;
  setDensity: (d: Density) => void;
  toggleDensity: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  // R6-5: Cmd-K recents (most-recent-first, capped).
  recents: string[];
  pushRecent: (path: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      density: 'comfortable',
      setDensity: (density) => set({ density }),
      toggleDensity: () => set((s) => ({ density: s.density === 'compact' ? 'comfortable' : 'compact' })),
      theme: 'classic',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'signal' ? 'classic' : 'signal' })),
      recents: [],
      pushRecent: (path) =>
        set((s) => ({ recents: [path, ...s.recents.filter((p) => p !== path)].slice(0, 6) })),
    }),
    { name: 'signal-ui' },
  ),
);
