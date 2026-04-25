import type { SyncTask } from "@services/sync/taskSyncProtocol";
import { log, warn, error as logError } from '@utils/logger';

type SyncFolder = {
  id: string;
  parentId: string | null;
  name: string;
  description?: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
  imageUrl?: string;
  bannerUrl?: string;
};

type SyncNote = {
  id: string;
  parentId: string | null;
  folderId?: string | null;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

type SyncQuickNote = {
  id: string;
  title: string;
  content: string;
  folderId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type EntityServerEvent = (
  | { type: "UPSERT_FOLDER"; payload: SyncFolder }
  | { type: "DELETE_FOLDER"; payload: { id: string; updatedAt: number } }
  | { type: "UPSERT_NOTE"; payload: SyncNote }
  | { type: "DELETE_NOTE"; payload: { id: string; updatedAt: number } }
  | { type: "UPSERT_QUICK_NOTE"; payload: SyncQuickNote }
  | { type: "DELETE_QUICK_NOTE"; payload: { id: string; updatedAt: number } }
  | { type: "UPSERT_TASK"; payload: SyncTask }
  | { type: "DELETE_TASK"; payload: { id: string; updatedAt: number } }
  | { type: "UPSERT_APP_META"; payload: { key: string; value: string; updatedAt: number } }
  | { type: "DELETE_APP_META"; payload: { key: string; updatedAt: number } }
) & { origin?: string };

type EntityServerListener = (event: EntityServerEvent) => void;

const listeners = new Set<EntityServerListener>();

export const emitEntityServerEvent = (event: EntityServerEvent) => {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      warn("[sync] entity listener failed", error);
    }
  });
};

export const subscribeEntityServerEvents = (listener: EntityServerListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
