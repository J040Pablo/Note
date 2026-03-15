import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Linking } from "react-native";
import { getDb } from "@database/db";
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
}): Promise<AppFile> => {
  const db = await getDb();
  const id = String(Date.now()) + Math.floor(Math.random() * 1000);
  const createdAt = Date.now();

  await db.runAsync(
    "INSERT INTO files (id, name, type, path, createdAt, parentFolderId) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    payload.name,
    payload.type,
    payload.path,
    createdAt,
    payload.parentFolderId
  );

  return {
    id,
    name: payload.name,
    type: payload.type,
    path: payload.path,
    createdAt,
    parentFolderId: payload.parentFolderId
  };
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
  const db = await getDb();
  if (parentFolderId === null) {
    return db.getAllAsync<AppFile>(
      "SELECT * FROM files WHERE parentFolderId IS NULL ORDER BY createdAt DESC"
    );
  }
  return db.getAllAsync<AppFile>(
    "SELECT * FROM files WHERE parentFolderId = ? ORDER BY createdAt DESC",
    parentFolderId
  );
};

export const getAllFiles = async (): Promise<AppFile[]> => {
  const db = await getDb();
  return db.getAllAsync<AppFile>("SELECT * FROM files ORDER BY createdAt DESC");
};

export const renameFile = async (fileId: ID, name: string): Promise<void> => {
  const db = await getDb();
  await db.runAsync("UPDATE files SET name = ? WHERE id = ?", name, fileId);
};

export const moveFileToFolder = async (fileId: ID, parentFolderId: ID | null): Promise<void> => {
  const db = await getDb();
  await db.runAsync("UPDATE files SET parentFolderId = ? WHERE id = ?", parentFolderId, fileId);
};

export const deleteFile = async (file: AppFile): Promise<void> => {
  const db = await getDb();
  await db.runAsync("DELETE FROM files WHERE id = ?", file.id);
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
