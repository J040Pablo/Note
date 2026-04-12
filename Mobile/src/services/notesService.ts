import { getDB, runDbWrite } from "@db/database";
import type { Note, ID, QuickNote } from "@models/types";
import { emitEntityServerEvent } from "@services/sync/entitySyncEvents";

export const createNote = async (payload: {
  id?: ID;
  title: string;
  content: string;
  folderId: ID | null;
  createdAt?: number;
  updatedAt?: number;
}): Promise<Note> => {
  const now = Date.now();
  const createdAt = Number(payload.createdAt ?? now);
  const updatedAt = Number(payload.updatedAt ?? createdAt);
  const id = payload.id ?? String(now);
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
      createdAt,
      updatedAt
    );
  } else {
    await runDbWrite(
      "INSERT INTO notes (id, title, content, folderId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      safeTitle,
      safeContent,
      safeFolderId,
      createdAt,
      updatedAt
    );
  }

  const created: Note = {
    id,
    title: safeTitle,
    content: safeContent,
    folderId: safeFolderId,
    createdAt,
    updatedAt
  };

  emitEntityServerEvent({
    type: "UPSERT_NOTE",
    payload: {
      id: created.id,
      parentId: created.folderId,
      folderId: created.folderId,
      title: created.title,
      content: created.content,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
  });

  return created;
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

  const updated = { ...note, title: safeTitle, content: safeContent, folderId: safeFolderId, updatedAt };
  emitEntityServerEvent({
    type: "UPSERT_NOTE",
    payload: {
      id: updated.id,
      parentId: updated.folderId,
      folderId: updated.folderId,
      title: updated.title,
      content: updated.content,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
  });
  return updated;
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

export const reorderNotes = async (folderId: ID | null, orderedIds: ID[]): Promise<void> => {
  if (!orderedIds.length) return;
  const base = Date.now();
  for (let index = 0; index < orderedIds.length; index += 1) {
    const id = orderedIds[index];
    const updatedAt = base + (orderedIds.length - index);
    if (folderId === null) {
      await runDbWrite("UPDATE notes SET updatedAt = ? WHERE id = ? AND folderId IS NULL", updatedAt, id);
    } else {
      await runDbWrite("UPDATE notes SET updatedAt = ? WHERE id = ? AND folderId = ?", updatedAt, id, folderId);
    }
  }
};

export const getAllNotes = async (): Promise<Note[]> => {
  const db = await getDB();
  return db.getAllAsync<Note>("SELECT * FROM notes ORDER BY updatedAt DESC");
};

export const deleteNote = async (noteId: ID): Promise<void> => {
  await runDbWrite("DELETE FROM notes WHERE id = ?", noteId);
  emitEntityServerEvent({
    type: "DELETE_NOTE",
    payload: { id: String(noteId), updatedAt: Date.now() },
  });
};

// ==================== Quick Notes ====================

export const createQuickNote = async (payload: {
  id?: ID;
  title: string;
  content: string;
  folderId: ID | null;
  createdAt?: number;
  updatedAt?: number;
}): Promise<QuickNote> => {
  const now = Date.now();
  const createdAt = Number(payload.createdAt ?? now);
  const updatedAt = Number(payload.updatedAt ?? createdAt);
  const id = payload.id ?? String(now);
  const safeTitle = (payload.title ?? "").trim() || "Quick Note";
  const safeContent = typeof payload.content === "string" ? payload.content : "";
  const safeFolderId = payload.folderId ?? null;

  if (safeFolderId === null) {
    await runDbWrite(
      "INSERT INTO quick_notes (id, title, content, folderId, createdAt, updatedAt) VALUES (?, ?, ?, NULL, ?, ?)",
      id,
      safeTitle,
      safeContent,
      createdAt,
      updatedAt
    );
  } else {
    await runDbWrite(
      "INSERT INTO quick_notes (id, title, content, folderId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
      id,
      safeTitle,
      safeContent,
      safeFolderId,
      createdAt,
      updatedAt
    );
  }

  const created: QuickNote = {
    id,
    title: safeTitle,
    content: safeContent,
    folderId: safeFolderId,
    createdAt,
    updatedAt
  };

  emitEntityServerEvent({
    type: "UPSERT_QUICK_NOTE",
    payload: {
      id: created.id,
      title: created.title,
      content: created.content,
      folderId: created.folderId,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
  });

  return created;
};

export const updateQuickNote = async (id: ID, payload: { title: string; content: string; folderId?: ID | null }): Promise<void> => {
  const updatedAt = Date.now();
  const safeTitle = (payload.title ?? "").trim() || "Quick Note";
  const safeContent = typeof payload.content === "string" ? payload.content : "";

  if (payload.folderId === undefined) {
    await runDbWrite(
      "UPDATE quick_notes SET title = ?, content = ?, updatedAt = ? WHERE id = ?",
      safeTitle,
      safeContent,
      updatedAt,
      id
    );
    return;
  }

  if (payload.folderId === null) {
    await runDbWrite(
      "UPDATE quick_notes SET title = ?, content = ?, folderId = NULL, updatedAt = ? WHERE id = ?",
      safeTitle,
      safeContent,
      updatedAt,
      id
    );
    return;
  }

  await runDbWrite(
    "UPDATE quick_notes SET title = ?, content = ?, folderId = ?, updatedAt = ? WHERE id = ?",
    safeTitle,
    safeContent,
    payload.folderId,
    updatedAt,
    id
  );

  emitEntityServerEvent({
    type: "UPSERT_QUICK_NOTE",
    payload: {
      id: String(id),
      title: safeTitle,
      content: safeContent,
      folderId: payload.folderId ?? null,
      createdAt: updatedAt,
      updatedAt,
    },
  });
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

export const getAllQuickNotes = async (): Promise<QuickNote[]> => {
  const db = await getDB();
  return db.getAllAsync<QuickNote>("SELECT * FROM quick_notes ORDER BY updatedAt DESC");
};

export const reorderQuickNotes = async (folderId: ID | null, orderedIds: ID[]): Promise<void> => {
  if (!orderedIds.length) return;
  const base = Date.now();
  for (let index = 0; index < orderedIds.length; index += 1) {
    const id = orderedIds[index];
    const updatedAt = base + (orderedIds.length - index);
    if (folderId === null) {
      await runDbWrite("UPDATE quick_notes SET updatedAt = ? WHERE id = ? AND folderId IS NULL", updatedAt, id);
    } else {
      await runDbWrite("UPDATE quick_notes SET updatedAt = ? WHERE id = ? AND folderId = ?", updatedAt, id, folderId);
    }
  }
};

export const getQuickNoteById = async (id: ID): Promise<QuickNote | null> => {
  const db = await getDB();
  const row = await db.getFirstAsync<QuickNote>("SELECT * FROM quick_notes WHERE id = ?", id);
  return row ?? null;
};

export const deleteQuickNote = async (id: ID): Promise<void> => {
  await runDbWrite("DELETE FROM quick_notes WHERE id = ?", id);
  emitEntityServerEvent({
    type: "DELETE_QUICK_NOTE",
    payload: { id: String(id), updatedAt: Date.now() },
  });
};

