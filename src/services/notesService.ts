import { getDB, runDbWrite } from "@db/database";
import type { Note, ID } from "@models/types";

export const createNote = async (payload: {
  title: string;
  content: string;
  folderId: ID | null;
}): Promise<Note> => {
  const now = Date.now();
  const id = String(now);

  await runDbWrite(
    "INSERT INTO notes (id, title, content, folderId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    payload.title,
    payload.content,
    payload.folderId,
    now,
    now
  );

  return {
    id,
    title: payload.title,
    content: payload.content,
    folderId: payload.folderId,
    createdAt: now,
    updatedAt: now
  };
};

export const updateNote = async (note: Note): Promise<Note> => {
  const updatedAt = Date.now();

  await runDbWrite(
    "UPDATE notes SET title = ?, content = ?, folderId = ?, updatedAt = ? WHERE id = ?",
    note.title,
    note.content,
    note.folderId,
    updatedAt,
    note.id
  );

  return { ...note, updatedAt };
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

