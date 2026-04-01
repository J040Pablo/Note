import type { Task } from "@models/types";

export type SyncPriority = "low" | "medium" | "high";

export type SyncTask = {
  id: string;
  text?: string;
  title: string;
  completed: boolean;
  priority: SyncPriority;
  date: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  repeatDays?: number[];
  completedDates?: string[];
  order?: number;
  createdAt?: number;
  parentId?: string | null;
  noteId?: string | null;
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
  text: task.text,
  title: task.text,
  completed: !!task.completed,
  priority: toSyncPriority(Number(task.priority ?? 1)),
  date: task.scheduledDate ?? null,
  scheduledDate: task.scheduledDate ?? null,
  scheduledTime: task.scheduledTime ?? null,
  repeatDays: Array.isArray(task.repeatDays) ? task.repeatDays : [],
  completedDates: Array.isArray(task.completedDates) ? task.completedDates : [],
  order: Number(task.orderIndex ?? 0),
  createdAt: Number(task.updatedAt ?? Date.now()),
  parentId: typeof task.parentId === "string" ? task.parentId : null,
  noteId: typeof task.noteId === "string" ? task.noteId : null,
  updatedAt: Number(task.updatedAt ?? Date.now()),
});
