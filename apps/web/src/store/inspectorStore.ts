import { create } from 'zustand';

export type InspectorObjectType =
  | 'claim'
  | 'evidence'
  | 'critique'
  | 'review'
  | 'decision'
  | 'idea_version'
  | null;

interface InspectorState {
  selectedObjectType: InspectorObjectType;
  selectedObjectId: string | null;
  inspectorOpen: boolean;

  openInspector: (type: InspectorObjectType, id: string) => void;
  closeInspector: () => void;
}

export const useInspectorStore = create<InspectorState>((set) => ({
  selectedObjectType: null,
  selectedObjectId: null,
  inspectorOpen: false,

  openInspector: (type, id) => set({ selectedObjectType: type, selectedObjectId: id, inspectorOpen: true }),
  closeInspector: () => set({ selectedObjectType: null, selectedObjectId: null, inspectorOpen: false }),
}));
