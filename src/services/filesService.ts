import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Linking } from "react-native";
import { getDB, runDbWrite, withDbWriteTransaction } from "@db/database";
import type { AppFile, AppFileType, ID } from "@models/types";

const FILES_DIR = `${FileSystem.documentDirectory}files/`;

const ensureDir = async () => {
  const info = await FileSystem.getInfoAsync(FILES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(FILES_DIR, { intermediates: true });
  }
};

const extensionOf = (name: string) => {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

const normalizeFileType = (name: string, mimeType?: string | null): AppFileType => {
  const ext = extensionOf(name);
  if (mimeType?.includes("pdf") || ext === "pdf") return "pdf";
  if (mimeType?.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
    return "image";
  }
  return "document";
};

const sanitizeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

const getNextFileOrderIndex = async (db: Awaited<ReturnType<typeof getDB>>, parentFolderId: ID | null): Promise<number> => {
  const row =
    parentFolderId === null
      ? await db.getFirstAsync<{ next: number }>(
          "SELECT COALESCE(MAX(orderIndex), 0) + 1 AS next FROM files WHERE parentFolderId IS NULL"
        )
      : await db.getFirstAsync<{ next: number }>(
          "SELECT COALESCE(MAX(orderIndex), 0) + 1 AS next FROM files WHERE parentFolderId = ?",
          parentFolderId
        );
  return Number(row?.next ?? 1);
};

export const getFileTypeIcon = (type: AppFileType): "document-text-outline" | "image-outline" | "document-outline" => {
  if (type === "pdf") return "document-text-outline";
  if (type === "image") return "image-outline";
  return "document-outline";
};

export const createFileRecord = async (payload: {
  name: string;
  type: AppFileType;
  path: string;
  parentFolderId: ID | null;
  description?: string | null;
  thumbnailPath?: string | null;
  bannerPath?: string | null;
}): Promise<AppFile> => {
  return withDbWriteTransaction("createFileRecord", async (db) => {
    const id = String(Date.now()) + Math.floor(Math.random() * 1000);
    const createdAt = Date.now();
    const orderIndex = await getNextFileOrderIndex(db, payload.parentFolderId);

    await db.runAsync(
      "INSERT INTO files (id, name, type, path, createdAt, orderIndex, parentFolderId, description, thumbnailPath, bannerPath) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      payload.name,
      payload.type,
      payload.path,
      createdAt,
      orderIndex,
      payload.parentFolderId,
      payload.description ?? null,
      payload.thumbnailPath ?? null,
      payload.bannerPath ?? null
    );

    return {
      id,
      name: payload.name,
      type: payload.type,
      path: payload.path,
      createdAt,
      orderIndex,
      parentFolderId: payload.parentFolderId,
      description: payload.description ?? null,
      thumbnailPath: payload.thumbnailPath ?? null,
      bannerPath: payload.bannerPath ?? null
    };
  });
};

export const importFileFromUri = async (
  uri: string,
  opts: {
    fileName?: string;
    mimeType?: string | null;
    parentFolderId: ID | null;
  }
): Promise<AppFile> => {
  await ensureDir();

  const sourceName = opts.fileName || uri.split("/").pop() || `file-${Date.now()}`;
  const fileName = sanitizeName(sourceName);
  const destination = `${FILES_DIR}${Date.now()}-${fileName}`;

  await FileSystem.copyAsync({ from: uri, to: destination });

  return createFileRecord({
    name: sourceName,
    type: normalizeFileType(sourceName, opts.mimeType),
    path: destination,
    parentFolderId: opts.parentFolderId
  });
};

export const importFileFromDevice = async (parentFolderId: ID | null): Promise<AppFile | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ],
    multiple: false,
    copyToCacheDirectory: true
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  return importFileFromUri(asset.uri, {
    fileName: asset.name,
    mimeType: asset.mimeType,
    parentFolderId
  });
};

export const getFilesByFolder = async (parentFolderId: ID | null): Promise<AppFile[]> => {
  const db = await getDB();
  if (parentFolderId === null) {
    return db.getAllAsync<AppFile>(
      "SELECT * FROM files WHERE parentFolderId IS NULL ORDER BY orderIndex ASC, createdAt DESC"
    );
  }
  return db.getAllAsync<AppFile>(
    "SELECT * FROM files WHERE parentFolderId = ? ORDER BY orderIndex ASC, createdAt DESC",
    parentFolderId
  );
};

export const getAllFiles = async (): Promise<AppFile[]> => {
  const db = await getDB();
  return db.getAllAsync<AppFile>("SELECT * FROM files ORDER BY orderIndex ASC, createdAt DESC");
};

export const renameFile = async (fileId: ID, name: string): Promise<void> => {
  await runDbWrite("UPDATE files SET name = ? WHERE id = ?", name, fileId);
};

export const updateFileDetails = async (file: AppFile): Promise<AppFile> => {
  return withDbWriteTransaction("updateFileDetails", async (db) => {
    const current = await db.getFirstAsync<{ parentFolderId: ID | null }>(
      "SELECT parentFolderId FROM files WHERE id = ?",
      file.id
    );
    const parentChanged = (current?.parentFolderId ?? null) !== (file.parentFolderId ?? null);
    const nextOrderIndex = parentChanged ? await getNextFileOrderIndex(db, file.parentFolderId ?? null) : file.orderIndex;
    const updatedFile: AppFile = { ...file, orderIndex: nextOrderIndex };
    await db.runAsync(
      "UPDATE files SET name = ?, description = ?, thumbnailPath = ?, bannerPath = ?, parentFolderId = ?, orderIndex = ? WHERE id = ?",
      updatedFile.name,
      updatedFile.description ?? null,
      updatedFile.thumbnailPath ?? null,
      updatedFile.bannerPath ?? null,
      updatedFile.parentFolderId,
      updatedFile.orderIndex,
      updatedFile.id
    );
    return updatedFile;
  });
};

export const moveFileToFolder = async (fileId: ID, parentFolderId: ID | null): Promise<void> => {
  await withDbWriteTransaction("moveFileToFolder", async (db) => {
    const nextOrderIndex = await getNextFileOrderIndex(db, parentFolderId);
    await db.runAsync("UPDATE files SET parentFolderId = ?, orderIndex = ? WHERE id = ?", parentFolderId, nextOrderIndex, fileId);
  });
};

export const reorderFiles = async (parentFolderId: ID | null, orderedIds: ID[]): Promise<void> => {
  await withDbWriteTransaction("reorderFiles", async (db) => {
    const siblings =
      parentFolderId === null
        ? await db.getAllAsync<{ id: ID }>("SELECT id FROM files WHERE parentFolderId IS NULL ORDER BY orderIndex ASC, createdAt DESC")
        : await db.getAllAsync<{ id: ID }>(
            "SELECT id FROM files WHERE parentFolderId = ? ORDER BY orderIndex ASC, createdAt DESC",
            parentFolderId
          );

    const remainingIds = siblings.map((x) => x.id).filter((id) => !orderedIds.includes(id));
    const nextIds = [...orderedIds, ...remainingIds];

    for (let i = 0; i < nextIds.length; i += 1) {
      await db.runAsync("UPDATE files SET orderIndex = ? WHERE id = ?", i + 1, nextIds[i]);
    }
  });
};

export const deleteFile = async (file: AppFile): Promise<void> => {
  await runDbWrite("DELETE FROM files WHERE id = ?", file.id);
  const info = await FileSystem.getInfoAsync(file.path);
  if (info.exists) {
    await FileSystem.deleteAsync(file.path, { idempotent: true });
  }
};

export const openExternalFile = async (filePath: string): Promise<void> => {
  const canOpen = await Linking.canOpenURL(filePath);
  if (canOpen) {
    await Linking.openURL(filePath);
    return;
  }
  await Linking.openURL(`file://${filePath.replace(/^file:\/\//, "")}`);
};
