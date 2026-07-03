import { create } from 'zustand';

interface UIState {
  isRunInProgress: boolean;
  setRunInProgress: (inProgress: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isRunInProgress: false,
  setRunInProgress: (inProgress) => set({ isRunInProgress: inProgress }),
}));
