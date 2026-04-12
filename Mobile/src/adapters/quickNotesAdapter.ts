import type { AppItem, ItemAdapter } from "@domain/items/types";
import type { ID, QuickNote } from "@models/types";
import { useQuickNotesStore } from "@store/useQuickNotesStore";
import { deleteQuickNote, reorderQuickNotes, updateQuickNote } from "@services/notesService";
import { Share } from "react-native";

const toItem = (quickNote: QuickNote): AppItem => ({
  kind: "quick",
  id: quickNote.id,
  parentId: quickNote.folderId ?? null
});

export const quickNotesAdapter: ItemAdapter = {
  kind: "quick",
  getItems: () => Object.values(useQuickNotesStore.getState().quickNotes).map(toItem),
  update: async (item: QuickNote) => {
    await updateQuickNote(item.id, { title: item.title, content: item.content, folderId: item.folderId ?? null });
    useQuickNotesStore.getState().upsertQuickNote({ ...item, folderId: item.folderId ?? null, updatedAt: Date.now() });
  },
  delete: async (id: string) => {
    await deleteQuickNote(id);
    useQuickNotesStore.getState().removeQuickNote(id);
  },
  move: async (id: string, parentId: string | null) => {
    const current = useQuickNotesStore.getState().quickNotes[id as ID];
    if (!current) return;
    const updatedAt = Date.now();
    await updateQuickNote(current.id, {
      title: current.title,
      content: current.content,
      folderId: parentId as ID | null
    });
    useQuickNotesStore.getState().upsertQuickNote({ ...current, folderId: parentId as ID | null, updatedAt });
  },
  reorder: async (ids: string[], parentId: string | null) => {
    await reorderQuickNotes(parentId as ID | null, ids as ID[]);
    const quickMap = useQuickNotesStore.getState().quickNotes;
    const orderedSet = new Set(ids);
    const remainder = Object.values(quickMap)
      .filter((quick) => (quick.folderId ?? null) === (parentId ?? null) && !orderedSet.has(quick.id))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((quick) => quick.id);
    const merged = [...ids, ...remainder];
    const base = Date.now();
    merged.forEach((id, index) => {
      const current = quickMap[id as ID];
      if (!current) return;
      useQuickNotesStore.getState().upsertQuickNote({ ...current, updatedAt: base + (merged.length - index) });
    });
  },
  share: async (id: string) => {
    const current = useQuickNotesStore.getState().quickNotes[id as ID];
    if (!current) return;
    await Share.share({ title: current.title, message: current.content || current.title });
  }
};
