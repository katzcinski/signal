import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Density = 'comfortable' | 'compact';
export type Theme = 'classic' | 'signal' | 'blueprint' | 'daylight' | 'amber';
export const THEMES: Theme[] = ['classic', 'signal', 'blueprint', 'daylight', 'amber'];

interface UIState {
  density: Density;
  setDensity: (d: Density) => void;
  toggleDensity: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
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
      recents: [],
      pushRecent: (path) =>
        set((s) => ({ recents: [path, ...s.recents.filter((p) => p !== path)].slice(0, 6) })),
    }),
    { name: 'signal-ui' },
  ),
);
