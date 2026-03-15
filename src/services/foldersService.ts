import { getDb } from "@database/db";
import type { Folder, ID } from "@models/types";

export const createFolder = async (
  name: string,
  parentId: ID | null,
  color: string | null = null
): Promise<Folder> => {
  const db = await getDb();
  const now = Date.now();
  const id = String(now);

  await db.runAsync(
    "INSERT INTO folders (id, name, parentId, color, createdAt) VALUES (?, ?, ?, ?, ?)",
    id,
    name,
    parentId,
    color,
    now
  );

  return { id, name, parentId, color, createdAt: now };
};

export const getFolders = async (parentId: ID | null = null): Promise<Folder[]> => {
  const db = await getDb();

  const rows =
    parentId === null
      ? await db.getAllAsync<Folder>("SELECT * FROM folders WHERE parentId IS NULL ORDER BY name")
      : await db.getAllAsync<Folder>(
          "SELECT * FROM folders WHERE parentId = ? ORDER BY name",
          parentId
        );

  return rows;
};

export const getFoldersByParent = async (parentId: ID | null): Promise<Folder[]> => {
  return getFolders(parentId);
};

export const updateFolder = async (folder: Folder): Promise<Folder> => {
  const db = await getDb();
  await db.runAsync(
    "UPDATE folders SET name = ?, color = ?, parentId = ? WHERE id = ?",
    folder.name,
    folder.color ?? null,
    folder.parentId,
    folder.id
  );
  return folder;
};

export const deleteFolder = async (folderId: ID): Promise<void> => {
  const db = await getDb();
  await db.runAsync("DELETE FROM folders WHERE id = ?", folderId);
};
