import { create } from 'zustand';

type RunMode = 'real' | 'manual' | 'mixed';
export type LoopMode = 'standard' | 'self_improving' | 'adversarial';

interface ModelSelectionState {
  selectedModelIds: string[];
  maxRounds: number;
  runMode: RunMode;
  loopMode: LoopMode;
  searchProvider: string;

  setSelectedModelIds: (ids: string[]) => void;
  toggleModelId: (id: string) => void;
  setMaxRounds: (rounds: number) => void;
  setRunMode: (mode: RunMode) => void;
  setLoopMode: (mode: LoopMode) => void;
  setSearchProvider: (provider: string) => void;
  reset: () => void;
}

const STORAGE_KEY = 'rw_model_selection';

function loadPersisted(): Partial<ModelSelectionState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const persisted = loadPersisted();

export const useModelSelectionStore = create<ModelSelectionState>((set, get) => ({
  selectedModelIds: persisted.selectedModelIds ?? [],
  maxRounds: persisted.maxRounds ?? 3,
  runMode: persisted.runMode ?? 'real',
  loopMode: persisted.loopMode ?? 'standard',
  searchProvider: persisted.searchProvider ?? '',

  setSelectedModelIds: (ids) => {
    set({ selectedModelIds: ids });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), selectedModelIds: ids }));
  },
  toggleModelId: (id) =>
    set((state) => {
      const selectedModelIds = state.selectedModelIds.includes(id)
        ? state.selectedModelIds.filter((i) => i !== id)
        : [...state.selectedModelIds, id];
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, selectedModelIds }));
      return { selectedModelIds };
    }),
  setMaxRounds: (rounds) => {
    set({ maxRounds: rounds });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), maxRounds: rounds }));
  },
  setRunMode: (mode) => {
    set({ runMode: mode });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), runMode: mode }));
  },
  setLoopMode: (mode) => {
    set({ loopMode: mode });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), loopMode: mode }));
  },
  setSearchProvider: (provider) => {
    set({ searchProvider: provider });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...get(), searchProvider: provider }));
  },
  reset: () => {
    set({ selectedModelIds: [], maxRounds: 3, runMode: 'real', loopMode: 'standard', searchProvider: '' });
    sessionStorage.removeItem(STORAGE_KEY);
  },
}));