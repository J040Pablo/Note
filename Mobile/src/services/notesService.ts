import { getDB, runDbWrite } from "@db/database";
import type { Note, ID, QuickNote } from "@models/types";
import { emitEntityServerEvent } from "@services/sync/entitySyncEvents";
import { log, warn, error as logError } from '@utils/logger';
import { transformNoteImages } from "@utils/noteContent";
import { uriToBase64 } from "@services/imageService";

const upsertNoteRow = async (payload: {
  id: ID;
  title: string;
  content: string;
  folderId: ID | null;
  createdAt: number;
  updatedAt: number;
}): Promise<void> => {
  await runDbWrite(
    `INSERT INTO notes (id, title, content, folderId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       folderId = excluded.folderId,
       updatedAt = excluded.updatedAt;`,
    payload.id,
    payload.title,
    payload.content,
    payload.folderId,
    payload.createdAt,
    payload.updatedAt
  );
};

const upsertQuickNoteRow = async (payload: {
  id: ID;
  title: string;
  content: string;
  folderId: ID | null;
  createdAt: number;
  updatedAt: number;
}): Promise<void> => {
  await runDbWrite(
    `INSERT INTO quick_notes (id, title, content, folderId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       folderId = excluded.folderId,
       updatedAt = excluded.updatedAt;`,
    payload.id,
    payload.title,
    payload.content,
    payload.folderId,
    payload.createdAt,
    payload.updatedAt
  );
};

export const createNote = async (
  payload: {
    id?: ID;
    title: string;
    content: string;
    folderId: ID | null;
    createdAt?: number;
    updatedAt?: number;
  },
  origin?: string
): Promise<Note> => {
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

  await upsertNoteRow({
    id,
    title: safeTitle,
    content: safeContent,
    folderId: safeFolderId,
    createdAt,
    updatedAt,
  });

  log("[DB][UPSERT]", id);

  const created: Note = {
    id,
    title: safeTitle,
    content: safeContent,
    folderId: safeFolderId,
    createdAt,
    updatedAt
  };

  const syncContent = await transformNoteImages(created.content, async (uri) => {
    if (uri.startsWith("file://")) {
      return (await uriToBase64(uri)) || uri;
    }
    return uri;
  });

  emitEntityServerEvent({
    type: "UPSERT_NOTE",
    payload: {
      id: created.id,
      parentId: created.folderId,
      folderId: created.folderId,
      title: created.title,
      content: syncContent,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
    origin,
  });

  return created;
};

export const updateNote = async (note: Note, origin?: string): Promise<Note> => {
  const updatedAt = Date.now();
  const safeTitle = (note.title ?? "").trim();
  if (!safeTitle) {
    throw new Error("Note title cannot be empty");
  }
  const safeContent = typeof note.content === "string" ? note.content : "";
  const safeFolderId = note.folderId ?? null;

  if (safeFolderId === null) {
    await runDbWrite(
      "UPDATE notes SET title = ?, content = ?, folderId = NULL, globalOrder = ?, updatedAt = ? WHERE id = ?",
      safeTitle,
      safeContent,
      note.globalOrder ?? null,
      updatedAt,
      note.id
    );
  } else {
    await runDbWrite(
      "UPDATE notes SET title = ?, content = ?, folderId = ?, globalOrder = ?, updatedAt = ? WHERE id = ?",
      safeTitle,
      safeContent,
      safeFolderId,
      note.globalOrder ?? null,
      updatedAt,
      note.id
    );
  }

  const updated = { ...note, title: safeTitle, content: safeContent, folderId: safeFolderId, updatedAt };
  const syncContent = await transformNoteImages(updated.content, async (uri) => {
    if (uri.startsWith("file://")) {
      return (await uriToBase64(uri)) || uri;
    }
    return uri;
  });

  emitEntityServerEvent({
    type: "UPSERT_NOTE",
    payload: {
      id: updated.id,
      parentId: updated.folderId,
      folderId: updated.folderId,
      title: updated.title,
      content: syncContent,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
    origin,
  });
  return updated;
};

export const getNotesByFolder = async (folderId: ID | null): Promise<Note[]> => {
  const db = await getDB();

  const rows =
    folderId === null
      ? await db.getAllAsync<Note>(
          "SELECT * FROM notes WHERE folderId IS NULL ORDER BY COALESCE(globalOrder, 9999) ASC, id ASC"
        )
      : await db.getAllAsync<Note>(
          "SELECT * FROM notes WHERE folderId = ? ORDER BY COALESCE(globalOrder, 9999) ASC, id ASC",
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

export const deleteNote = async (noteId: ID, origin?: string): Promise<void> => {
  await runDbWrite("DELETE FROM notes WHERE id = ?", noteId);
  emitEntityServerEvent({
    type: "DELETE_NOTE",
    payload: { id: String(noteId), updatedAt: Date.now() },
    origin,
  });
};

// ==================== Quick Notes ====================

export const createQuickNote = async (
  payload: {
    id?: ID;
    title: string;
    content: string;
    folderId: ID | null;
    createdAt?: number;
    updatedAt?: number;
  },
  origin?: string
): Promise<QuickNote> => {
  const now = Date.now();
  const createdAt = Number(payload.createdAt ?? now);
  const updatedAt = Number(payload.updatedAt ?? createdAt);
  const id = payload.id ?? String(now);
  const safeTitle = (payload.title ?? "").trim() || "Quick Note";
  const safeContent = typeof payload.content === "string" ? payload.content : "";
  const safeFolderId = payload.folderId ?? null;

  await upsertQuickNoteRow({
    id,
    title: safeTitle,
    content: safeContent,
    folderId: safeFolderId,
    createdAt,
    updatedAt,
  });

  const created: QuickNote = {
    id,
    title: safeTitle,
    content: safeContent,
    folderId: safeFolderId,
    createdAt,
    updatedAt
  };

  const syncContent = await transformNoteImages(created.content, async (uri) => {
    if (uri.startsWith("file://")) {
      return (await uriToBase64(uri)) || uri;
    }
    return uri;
  });

  emitEntityServerEvent({
    type: "UPSERT_QUICK_NOTE",
    payload: {
      id: created.id,
      title: created.title,
      content: syncContent,
      folderId: created.folderId,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
    origin,
  });

  return created;
};

export const updateQuickNote = async (
  id: ID,
  payload: { title: string; content: string; folderId?: ID | null },
  origin?: string
): Promise<void> => {
  const updatedAt = Date.now();
  const safeTitle = (payload.title ?? "").trim() || "Quick Note";
  const safeContent = typeof payload.content === "string" ? payload.content : "";
  const safeFolderId = payload.folderId === undefined ? null : payload.folderId;

  await runDbWrite(
    "UPDATE quick_notes SET title = ?, content = ?, folderId = ?, updatedAt = ? WHERE id = ?",
    safeTitle,
    safeContent,
    safeFolderId,
    updatedAt,
    id
  );

  const syncContent = await transformNoteImages(safeContent, async (uri) => {
    if (uri.startsWith("file://")) {
      return (await uriToBase64(uri)) || uri;
    }
    return uri;
  });

  // Always emit, regardless of folderId state
  emitEntityServerEvent({
    type: "UPSERT_QUICK_NOTE",
    payload: {
      id: String(id),
      title: safeTitle,
      content: syncContent,
      folderId: safeFolderId,
      createdAt: updatedAt,
      updatedAt,
    },
    origin,
  });
};

export const updateNoteGlobalOrder = async (id: ID, globalOrder: number): Promise<void> => {
  await runDbWrite(
    "UPDATE notes SET globalOrder = ? WHERE id = ?",
    globalOrder,
    id
  );
};

export const updateQuickNoteGlobalOrder = async (id: ID, globalOrder: number): Promise<void> => {
  await runDbWrite(
    "UPDATE quick_notes SET globalOrder = ? WHERE id = ?",
    globalOrder,
    id
  );
};

export const getQuickNotesByFolder = async (folderId: ID | null): Promise<QuickNote[]> => {
  const db = await getDB();
  const rows =
    folderId === null
      ? await db.getAllAsync<QuickNote>(
          "SELECT * FROM quick_notes WHERE folderId IS NULL ORDER BY COALESCE(globalOrder, 9999) ASC, id ASC"
        )
      : await db.getAllAsync<QuickNote>(
          "SELECT * FROM quick_notes WHERE folderId = ? ORDER BY COALESCE(globalOrder, 9999) ASC, id ASC",
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

export const deleteQuickNote = async (id: ID, origin?: string): Promise<void> => {
  await runDbWrite("DELETE FROM quick_notes WHERE id = ?", id);
  emitEntityServerEvent({
    type: "DELETE_QUICK_NOTE",
    payload: { id: String(id), updatedAt: Date.now() },
    origin,
  });
};

