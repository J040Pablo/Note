// Web-side folders service — mirrors Mobile foldersService API surface.
// All operations persist locally and emit sync automatically in mobile-sync mode.

import { dispatchEntitySyncEvent } from "../features/tasks/sync";
import { loadData, saveData, type DataFolder } from "./webData";
import { isWebMobileSyncMode } from "./webSyncMode";

type FolderPayload = {
  id?: string;
  parentId?: string | null;
  name: string;
  description?: string;
  color?: string;
  imageUrl?: string;
  bannerUrl?: string;
};

const emitFolderSync = (type: "UPSERT_FOLDER" | "DELETE_FOLDER", payload: Record<string, unknown>): void => {
  if (!isWebMobileSyncMode()) return;
  dispatchEntitySyncEvent({ type, payload });
};

export const getAllFolders = (): DataFolder[] => loadData().folders;

export const createFolder = (payload: FolderPayload): DataFolder => {
  const store = loadData();
  const now = Date.now();
  const folder: DataFolder = {
    id: payload.id ?? `folder-${now}-${Math.round(Math.random() * 1e4)}`,
    parentId: payload.parentId ?? null,
    name: (payload.name ?? "").trim() || "Untitled folder",
    description: payload.description,
    color: payload.color,
    imageUrl: payload.imageUrl,
    bannerUrl: payload.bannerUrl,
    createdAt: now,
    updatedAt: now,
  };

  store.folders = [folder, ...store.folders.filter((item) => item.id !== folder.id)];
  saveData(store);
  emitFolderSync("UPSERT_FOLDER", folder);
  return folder;
};

export const updateFolder = (folder: DataFolder): DataFolder => {
  const store = loadData();
  const updated: DataFolder = {
    ...folder,
    name: (folder.name ?? "").trim() || "Untitled folder",
    updatedAt: Date.now(),
  };

  const exists = store.folders.some((item) => item.id === updated.id);
  store.folders = exists
    ? store.folders.map((item) => (item.id === updated.id ? updated : item))
    : [updated, ...store.folders];

  saveData(store);
  emitFolderSync("UPSERT_FOLDER", updated);
  return updated;
};

export const deleteFolder = (id: string): void => {
  const store = loadData();
  store.folders = store.folders.filter((item) => item.id !== id);
  saveData(store);
  emitFolderSync("DELETE_FOLDER", { id });
};