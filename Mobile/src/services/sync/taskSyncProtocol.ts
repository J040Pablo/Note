import type { Task } from "@models/types";

export type SyncPriority = "low" | "medium" | "high";

export type SyncTask = {
  id: string;
  title: string;
  completed: boolean;
  priority: SyncPriority;
  date: string | null;
  updatedAt: number;
};

export const toSyncPriority = (value: number): SyncPriority => {
  if (value <= 0) return "low";
  if (value >= 2) return "high";
  return "medium";
};

export const fromSyncPriority = (value: SyncPriority | undefined): 0 | 1 | 2 => {
  if (value === "low") return 0;
  if (value === "high") return 2;
  return 1;
};

export const toSyncTask = (task: Task): SyncTask => ({
  id: String(task.id),
  title: task.text,
  completed: !!task.completed,
  priority: toSyncPriority(Number(task.priority ?? 1)),
  date: task.scheduledDate ?? null,
  updatedAt: Number(task.updatedAt ?? Date.now()),
});
