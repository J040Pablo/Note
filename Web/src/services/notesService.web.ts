// Web-side notes service — mirrors Mobile notesService API surface.
// All operations are synchronous against localStorage via webData.

import { dispatchEntitySyncEvent } from "../features/tasks/sync";
import { loadData, saveData, type DataNote, type DataQuickNote } from "./webData";
import { isWebMobileSyncMode } from "./webSyncMode";

type ID = string;

// ════════════════════════ Notes ════════════════════════

export const createNote = (payload: {
  title: string;
  content: string;
  folderId: ID | null;
}): DataNote => {
  const store = loadData();
  const now = Date.now();
  const id = `note-${now}-${Math.round(Math.random() * 1e4)}`;
  const safeTitle = (payload.title ?? "").trim() || "Untitled note";

  const note: DataNote = {
    id,
    parentId: payload.folderId,
    title: safeTitle,
    content: typeof payload.content === "string" ? payload.content : "",
    folderId: payload.folderId,
    createdAt: now,
    updatedAt: now,
  };

  store.notes = [note, ...store.notes];
  saveData(store);

  if (isWebMobileSyncMode()) {
    dispatchEntitySyncEvent({ type: "UPSERT_NOTE", payload: note });
  }
  return note;
};

export const updateNote = (note: DataNote): DataNote => {
  const store = loadData();
  const now = Date.now();
  const safeTitle = (note.title ?? "").trim() || "Untitled note";
  const updated: DataNote = {
    ...note,
    title: safeTitle,
    content: typeof note.content === "string" ? note.content : "",
    updatedAt: now,
  };

  store.notes = store.notes.map((n) => (n.id === updated.id ? updated : n));
  saveData(store);

  if (isWebMobileSyncMode()) {
    dispatchEntitySyncEvent({ type: "UPSERT_NOTE", payload: updated });
  }
  return updated;
};

export const deleteNote = (noteId: ID): void => {
  const store = loadData();
  store.notes = store.notes.filter((n) => n.id !== noteId);
  saveData(store);

  if (isWebMobileSyncMode()) {
    dispatchEntitySyncEvent({ type: "DELETE_NOTE", payload: { id: noteId } });
  }
};

export const getAllNotes = (): DataNote[] => loadData().notes;

export const getNoteById = (noteId: ID): DataNote | null => {
  const notes = loadData().notes;
  return notes.find((n) => n.id === noteId) ?? null;
};

export const getNotesByFolder = (folderId: ID | null): DataNote[] => {
  const notes = loadData().notes;
  return folderId === null
    ? notes.filter((n) => !n.parentId && !n.folderId)
    : notes.filter((n) => n.parentId === folderId || n.folderId === folderId);
};

export const getRecentNotes = (limit = 5): DataNote[] =>
  getAllNotes()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);

// ════════════════════════ Quick Notes ════════════════════════

export const createQuickNote = (payload: {
  title?: string;
  content?: string;
  text?: string;
  folderId?: ID | null;
}): DataQuickNote => {
  const store = loadData();
  const now = Date.now();
  const id = `qn-${now}-${Math.round(Math.random() * 1e4)}`;
  const text = payload.text ?? payload.content ?? "";
  const content = payload.content ?? payload.text ?? "";

  const quickNote: DataQuickNote = {
    id,
    title: (payload.title ?? "").trim() || "Quick Note",
    text,
    content,
    folderId: payload.folderId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  store.quickNotes = [quickNote, ...store.quickNotes];
  saveData(store);

  if (isWebMobileSyncMode()) {
    dispatchEntitySyncEvent({ type: "UPSERT_QUICK_NOTE", payload: quickNote });
  }
  return quickNote;
};

export const updateQuickNote = (
  id: ID,
  payload: { title?: string; content?: string; text?: string; folderId?: ID | null; color?: string }
): DataQuickNote | null => {
  const store = loadData();
  const now = Date.now();
  let result: DataQuickNote | null = null;

  store.quickNotes = store.quickNotes.map((q) => {
    if (q.id !== id) return q;
    const updated: DataQuickNote = {
      ...q,
      title: payload.title !== undefined ? ((payload.title ?? "").trim() || "Quick Note") : q.title,
      text: payload.text !== undefined ? payload.text : (payload.content !== undefined ? payload.content : q.text),
      content: payload.content !== undefined ? payload.content : (payload.text !== undefined ? payload.text : q.content),
      folderId: payload.folderId !== undefined ? payload.folderId : q.folderId,
      color: payload.color !== undefined ? payload.color : q.color,
      updatedAt: now,
    };
    result = updated;
    return updated;
  });

  saveData(store);

  if (isWebMobileSyncMode() && result) {
    dispatchEntitySyncEvent({ type: "UPSERT_QUICK_NOTE", payload: result });
  }
  return result;
};

export const deleteQuickNote = (id: ID): void => {
  const store = loadData();
  store.quickNotes = store.quickNotes.filter((q) => q.id !== id);
  saveData(store);

  if (isWebMobileSyncMode()) {
    dispatchEntitySyncEvent({ type: "DELETE_QUICK_NOTE", payload: { id } });
  }
};

export const getAllQuickNotes = (): DataQuickNote[] => loadData().quickNotes;

export const getQuickNoteById = (id: ID): DataQuickNote | null => {
  const notes = loadData().quickNotes;
  return notes.find((q) => q.id === id) ?? null;
};

export const getQuickNotesByFolder = (folderId: ID | null): DataQuickNote[] => {
  const notes = loadData().quickNotes;
  return folderId === null
    ? notes.filter((q) => !q.folderId)
    : notes.filter((q) => q.folderId === folderId);
};

// ════════════════════════ Bulk Replace (sync) ════════════════════════

export const replaceAllNotes = (notes: DataNote[]): void => {
  const store = loadData();
  store.notes = notes;
  saveData(store);
};

export const replaceAllQuickNotes = (quickNotes: DataQuickNote[]): void => {
  const store = loadData();
  store.quickNotes = quickNotes;
  saveData(store);
};
