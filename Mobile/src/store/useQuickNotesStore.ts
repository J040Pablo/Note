import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { QuickNote, ID } from "@models/types";

interface QuickNotesState {
  quickNotes: Record<ID, QuickNote>;
}

interface QuickNotesActions {
  setQuickNotes: (list: QuickNote[]) => void;
  upsertQuickNote: (note: QuickNote) => void;
  removeQuickNote: (noteId: ID) => void;
}

export const useQuickNotesStore = create<QuickNotesState & QuickNotesActions>()(
  immer((set) => ({
    quickNotes: {},

    setQuickNotes: (list) =>
      set((state) => {
        state.quickNotes = {};
        for (const note of list) {
          state.quickNotes[note.id] = note;
        }
      }),

    upsertQuickNote: (note) =>
      set((state) => {
        state.quickNotes[note.id] = note;
      }),

    removeQuickNote: (noteId) =>
      set((state) => {
        delete state.quickNotes[noteId];
      })
  }))
);
