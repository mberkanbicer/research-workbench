import { create } from 'zustand';

export type RunConnectionStatus = 'idle' | 'connecting' | 'open' | 'connected' | 'error';

export interface RunEvent {
  id: string;
  type: string;
  payload?: any;
  createdAt?: string;
}

interface RunState {
  activeRunId: string | null;
  eventLog: RunEvent[];
  selectedTimelineItemId: string | null;
  runConnectionStatus: RunConnectionStatus;

  setActiveRunId: (runId: string | null) => void;
  addEvent: (event: RunEvent) => void;
  hydrateEvents: (events: RunEvent[]) => void;
  clearEvents: () => void;
  setSelectedTimelineItemId: (id: string | null) => void;
  setRunConnectionStatus: (status: RunConnectionStatus) => void;
}

export const useRunStore = create<RunState>((set) => ({
  activeRunId: null,
  eventLog: [],
  selectedTimelineItemId: null,
  runConnectionStatus: 'idle',

  setActiveRunId: (runId) => set({ activeRunId: runId, eventLog: [], selectedTimelineItemId: null }),
  addEvent: (event) => set((state) => ({ eventLog: [...state.eventLog, event] })),
  hydrateEvents: (events) => set({ eventLog: events }),
  clearEvents: () => set({ eventLog: [], selectedTimelineItemId: null }),
  setSelectedTimelineItemId: (id) => set({ selectedTimelineItemId: id }),
  setRunConnectionStatus: (status) => set({ runConnectionStatus: status }),
}));
