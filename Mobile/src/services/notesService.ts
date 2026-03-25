import { getDB, runDbWrite } from "@db/database";
import type { Note, ID, QuickNote } from "@models/types";

export const createNote = async (payload: {
  title: string;
  content: string;
  folderId: ID | null;
}): Promise<Note> => {
  const now = Date.now();
  const id = String(now);
  const safeTitle = (payload.title ?? "").trim();
  if (!safeTitle) {
    throw new Error("Note title cannot be empty");
  }
  const safeContent = typeof payload.content === "string" ? payload.content : "";
  const safeFolderId = payload.folderId ?? null;

  if (safeFolderId === null) {
    await runDbWrite(
      "INSERT INTO notes (id, title, content, folderId, createdAt, updatedAt) VALUES (?, ?, ?, NULL, ?, ?)",
      id,
      safeTitle,
      safeContent,
      now,
      now
    );
  } else {
    await runDbWrite(
      "INSERT INTO notes (id, title, content, folderId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      safeTitle,
      safeContent,
      safeFolderId,
      now,
      now
    );
  }

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
  const safeTitle = (note.title ?? "").trim();
  if (!safeTitle) {
    throw new Error("Note title cannot be empty");
  }
  const safeContent = typeof note.content === "string" ? note.content : "";
  const safeFolderId = note.folderId ?? null;

  if (safeFolderId === null) {
    await runDbWrite(
      "UPDATE notes SET title = ?, content = ?, folderId = NULL, updatedAt = ? WHERE id = ?",
      safeTitle,
      safeContent,
      updatedAt,
      note.id
    );
  } else {
    await runDbWrite(
      "UPDATE notes SET title = ?, content = ?, folderId = ?, updatedAt = ? WHERE id = ?",
      safeTitle,
      safeContent,
      safeFolderId,
      updatedAt,
      note.id
    );
  }

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
  title: string;
  content: string;
  folderId: ID | null;
}): Promise<QuickNote> => {
  const now = Date.now();
  const id = String(now);
  const safeTitle = (payload.title ?? "").trim() || "Quick Note";
  const safeContent = typeof payload.content === "string" ? payload.content : "";
  const safeFolderId = payload.folderId ?? null;

  if (safeFolderId === null) {
    await runDbWrite(
      "INSERT INTO quick_notes (id, title, content, folderId, createdAt, updatedAt) VALUES (?, ?, ?, NULL, ?, ?)",
      id,
      safeTitle,
      safeContent,
      now,
      now
    );
  } else {
    await runDbWrite(
      "INSERT INTO quick_notes (id, title, content, folderId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      safeTitle,
      safeContent,
      safeFolderId,
      now,
      now
    );
  }

  return {
    id,
    title: safeTitle,
    content: safeContent,
    folderId: safeFolderId,
    createdAt: now,
    updatedAt: now
  };
};

export const updateQuickNote = async (id: ID, payload: { title: string; content: string }): Promise<void> => {
  const updatedAt = Date.now();
  const safeTitle = (payload.title ?? "").trim() || "Quick Note";
  const safeContent = typeof payload.content === "string" ? payload.content : "";

  await runDbWrite(
    "UPDATE quick_notes SET title = ?, content = ?, updatedAt = ? WHERE id = ?",
    safeTitle,
    safeContent,
    updatedAt,
    id
  );
};

export const getQuickNotesByFolder = async (folderId: ID | null): Promise<QuickNote[]> => {
  const db = await getDB();
  const rows =
    folderId === null
      ? await db.getAllAsync<QuickNote>(
          "SELECT * FROM quick_notes WHERE folderId IS NULL ORDER BY updatedAt DESC"
        )
      : await db.getAllAsync<QuickNote>(
          "SELECT * FROM quick_notes WHERE folderId = ? ORDER BY updatedAt DESC",
          folderId
        );
  return rows;
};

export const getQuickNoteById = async (id: ID): Promise<QuickNote | null> => {
  const db = await getDB();
  const row = await db.getFirstAsync<QuickNote>("SELECT * FROM quick_notes WHERE id = ?", id);
  return row ?? null;
};

export const deleteQuickNote = async (id: ID): Promise<void> => {
  await runDbWrite("DELETE FROM quick_notes WHERE id = ?", id);
};

