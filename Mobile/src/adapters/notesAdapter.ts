import type { AppItem, ItemAdapter } from "@domain/items/types";
import type { ID, Note } from "@models/types";
import { useNotesStore } from "@store/useNotesStore";
import { deleteNote, reorderNotes, updateNote } from "@services/notesService";
import { togglePinnedItem } from "@services/appMetaService";
import { Share } from "react-native";

const toItem = (note: Note): AppItem => ({
  kind: "note",
  id: note.id,
  parentId: note.folderId ?? null
});

export const notesAdapter: ItemAdapter = {
  kind: "note",
  getItems: () => Object.values(useNotesStore.getState().notes).map(toItem),
  update: async (item: Note) => {
    const updated = await updateNote(item);
    useNotesStore.getState().upsertNote(updated);
  },
  delete: async (id: string) => {
    await deleteNote(id);
    useNotesStore.getState().removeNote(id);
  },
  move: async (id: string, parentId: string | null) => {
    const current = useNotesStore.getState().notes[id as ID];
    if (!current) return;
    const updated = await updateNote({ ...current, folderId: parentId as ID | null });
    useNotesStore.getState().upsertNote(updated);
  },
  reorder: async (ids: string[], parentId: string | null) => {
    await reorderNotes(parentId as ID | null, ids as ID[]);
    const notesMap = useNotesStore.getState().notes;
    const orderedSet = new Set(ids);
    const remainder = Object.values(notesMap)
      .filter((note) => (note.folderId ?? null) === (parentId ?? null) && !orderedSet.has(note.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((note) => note.id);
    const merged = [...ids, ...remainder];
    const base = Date.now();
    merged.forEach((id, index) => {
      const current = notesMap[id as ID];
      if (!current) return;
      useNotesStore.getState().upsertNote({ ...current, updatedAt: base + (merged.length - index) });
    });
  },
  pin: async (id: string) => {
    await togglePinnedItem("note", id);
  },
  share: async (id: string) => {
    const current = useNotesStore.getState().notes[id as ID];
    if (!current) return;
    await Share.share({ title: current.title, message: current.content || current.title });
  }
};
