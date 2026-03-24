import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Note, ID } from "@models/types";

interface NotesState {
  notes: Record<ID, Note>;
}

interface NotesActions {
  setNotes: (list: Note[]) => void;
  upsertNote: (note: Note) => void;
  removeNote: (noteId: ID) => void;
}

export const useNotesStore = create<NotesState & NotesActions>()(
  immer((set) => ({
    notes: {},

    setNotes: (list) =>
      set((state) => {
        state.notes = {};
        for (const note of list) {
          state.notes[note.id] = note;
        }
      }),

    upsertNote: (note) =>
      set((state) => {
        state.notes[note.id] = note;
      }),

    removeNote: (noteId) =>
      set((state) => {
        delete state.notes[noteId];
      })
  }))
);

