import { getDB, runDbWrite } from "@db/database";
import type { Note, ID } from "@models/types";

export const createNote = async (payload: {
  title: string;
  content: string;
  folderId: ID | null;
}): Promise<Note> => {
  const now = Date.now();
  const id = String(now);
  const safeTitle = (payload.title ?? "").trim() || "Untitled";
  const safeContent = typeof payload.content === "string" ? payload.content : "";
  const safeFolderId = payload.folderId ?? null;

  await runDbWrite(
    "INSERT INTO notes (id, title, content, folderId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    safeTitle,
    safeContent,
    safeFolderId,
    now,
    now
  );

  return {
    id,
    title: safeTitle,
    content: safeContent,
    folderId: safeFolderId,
    createdAt: now,
    updatedAt: now
  };
};

export const updateNote = async (note: Note): Promise<Note> => {
  const updatedAt = Date.now();
  const safeTitle = (note.title ?? "").trim() || "Untitled";
  const safeContent = typeof note.content === "string" ? note.content : "";
  const safeFolderId = note.folderId ?? null;

  await runDbWrite(
    "UPDATE notes SET title = ?, content = ?, folderId = ?, updatedAt = ? WHERE id = ?",
    safeTitle,
    safeContent,
    safeFolderId,
    updatedAt,
    note.id
  );

  return { ...note, title: safeTitle, content: safeContent, folderId: safeFolderId, updatedAt };
};

export const getNotesByFolder = async (folderId: ID | null): Promise<Note[]> => {
  const db = await getDB();

  const rows =
    folderId === null
      ? await db.getAllAsync<Note>(
          "SELECT * FROM notes WHERE folderId IS NULL ORDER BY updatedAt DESC"
        )
      : await db.getAllAsync<Note>(
          "SELECT * FROM notes WHERE folderId = ? ORDER BY updatedAt DESC",
          folderId
        );

  return rows;
};

export const getRecentNotes = async (limit = 5): Promise<Note[]> => {
  const db = await getDB();
  const rows = await db.getAllAsync<Note>(
    "SELECT * FROM notes ORDER BY updatedAt DESC LIMIT ?",
    limit
  );
  return rows;
};

export const getAllNotes = async (): Promise<Note[]> => {
  const db = await getDB();
  return db.getAllAsync<Note>("SELECT * FROM notes ORDER BY updatedAt DESC");
};

export const deleteNote = async (noteId: ID): Promise<void> => {
  await runDbWrite("DELETE FROM notes WHERE id = ?", noteId);
};

// ==================== Quick Notes ====================

export const createQuickNote = async (payload: {
  content: string;
  folderId: ID | null;
}): Promise<any> => {
  const now = Date.now();
  const id = String(now);

  await runDbWrite(
    "INSERT INTO quick_notes (id, content, folderId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
    id,
    payload.content,
    payload.folderId,
    now,
    now
  );

  return {
    id,
    content: payload.content,
    folderId: payload.folderId,
    createdAt: now,
    updatedAt: now
  };
};

export const updateQuickNote = async (id: ID, content: string): Promise<void> => {
  const updatedAt = Date.now();
  await runDbWrite(
    "UPDATE quick_notes SET content = ?, updatedAt = ? WHERE id = ?",
    content,
    updatedAt,
    id
  );
};

export const getQuickNotesByFolder = async (folderId: ID | null): Promise<any[]> => {
  const db = await getDB();
  const rows =
    folderId === null
      ? await db.getAllAsync<any>(
          "SELECT * FROM quick_notes WHERE folderId IS NULL ORDER BY updatedAt DESC"
        )
      : await db.getAllAsync<any>(
          "SELECT * FROM quick_notes WHERE folderId = ? ORDER BY updatedAt DESC",
          folderId
        );
  return rows;
};

export const deleteQuickNote = async (id: ID): Promise<void> => {
  await runDbWrite("DELETE FROM quick_notes WHERE id = ?", id);
};

