import { getDB, runDbWrite, withDbWriteTransaction } from "@db/database";
import type { Folder, ID } from "@models/types";

const getNextFolderOrderIndex = async (db: Awaited<ReturnType<typeof getDB>>, parentId: ID | null): Promise<number> => {
  const row =
    parentId === null
      ? await db.getFirstAsync<{ next: number }>(
          "SELECT COALESCE(MAX(orderIndex), 0) + 1 AS next FROM folders WHERE parentId IS NULL"
        )
      : await db.getFirstAsync<{ next: number }>(
          "SELECT COALESCE(MAX(orderIndex), 0) + 1 AS next FROM folders WHERE parentId = ?",
          parentId
        );
  return Number(row?.next ?? 1);
};

export const createFolder = async (
  name: string,
  parentId: ID | null,
  color: string | null = null,
  description: string | null = null,
  photoPath: string | null = null,
  bannerPath: string | null = null
): Promise<Folder> => {
  return withDbWriteTransaction("createFolder", async (db) => {
    const now = Date.now();
    const id = String(now);
    const orderIndex = await getNextFolderOrderIndex(db, parentId);

    await db.runAsync(
      "INSERT INTO folders (id, name, parentId, orderIndex, color, description, photoPath, bannerPath, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      name,
      parentId,
      orderIndex,
      color,
      description,
      photoPath,
      bannerPath,
      now
    );

    return { id, name, parentId, orderIndex, color, description, photoPath, bannerPath, createdAt: now };
  });
};

export const getFolders = async (parentId: ID | null = null): Promise<Folder[]> => {
  const db = await getDB();

  const rows =
    parentId === null
      ? await db.getAllAsync<Folder>("SELECT * FROM folders WHERE parentId IS NULL ORDER BY orderIndex ASC, createdAt DESC")
      : await db.getAllAsync<Folder>(
          "SELECT * FROM folders WHERE parentId = ? ORDER BY orderIndex ASC, createdAt DESC",
          parentId
        );

  return rows;
};

export const getFoldersByParent = async (parentId: ID | null): Promise<Folder[]> => {
  return getFolders(parentId);
};

export const getAllFolders = async (): Promise<Folder[]> => {
  const db = await getDB();
  return db.getAllAsync<Folder>("SELECT * FROM folders ORDER BY orderIndex ASC, createdAt DESC");
};

export const updateFolder = async (folder: Folder): Promise<Folder> => {
  return withDbWriteTransaction("updateFolder", async (db) => {
    const current = await db.getFirstAsync<{ parentId: ID | null }>("SELECT parentId FROM folders WHERE id = ?", folder.id);
    const parentChanged = (current?.parentId ?? null) !== (folder.parentId ?? null);
    const nextOrderIndex = parentChanged ? await getNextFolderOrderIndex(db, folder.parentId ?? null) : folder.orderIndex;
    const updatedFolder: Folder = { ...folder, orderIndex: nextOrderIndex };
    await db.runAsync(
      "UPDATE folders SET name = ?, color = ?, parentId = ?, orderIndex = ?, description = ?, photoPath = ?, bannerPath = ? WHERE id = ?",
      updatedFolder.name,
      updatedFolder.color ?? null,
      updatedFolder.parentId,
      updatedFolder.orderIndex,
      updatedFolder.description ?? null,
      updatedFolder.photoPath ?? null,
      updatedFolder.bannerPath ?? null,
      updatedFolder.id
    );
    return updatedFolder;
  });
};

export const reorderFolders = async (parentId: ID | null, orderedIds: ID[]): Promise<void> => {
  await withDbWriteTransaction("reorderFolders", async (db) => {
    const siblings =
      parentId === null
        ? await db.getAllAsync<{ id: ID }>("SELECT id FROM folders WHERE parentId IS NULL ORDER BY orderIndex ASC, createdAt DESC")
        : await db.getAllAsync<{ id: ID }>(
            "SELECT id FROM folders WHERE parentId = ? ORDER BY orderIndex ASC, createdAt DESC",
            parentId
          );

    const remainingIds = siblings.map((x) => x.id).filter((id) => !orderedIds.includes(id));
    const nextIds = [...orderedIds, ...remainingIds];

    for (let i = 0; i < nextIds.length; i += 1) {
      await db.runAsync("UPDATE folders SET orderIndex = ? WHERE id = ?", i + 1, nextIds[i]);
    }
  });
};

export const deleteFolder = async (folderId: ID): Promise<void> => {
  await runDbWrite("DELETE FROM folders WHERE id = ?", folderId);
};
