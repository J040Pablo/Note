import type { SyncTask } from "@services/sync/taskSyncProtocol";

export type TaskServerEvent =
  | { type: "TASK_CREATED"; payload: SyncTask }
  | { type: "TASK_UPDATED"; payload: SyncTask }
  | { type: "TASK_DELETED"; payload: { id: string; updatedAt: number } };

type TaskServerListener = (event: TaskServerEvent) => void;

const listeners = new Set<TaskServerListener>();

export const emitTaskServerEvent = (event: TaskServerEvent) => {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.warn("[sync] listener failed", error);
    }
  });
};

export const subscribeTaskServerEvents = (listener: TaskServerListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
