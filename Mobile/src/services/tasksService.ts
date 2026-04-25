import { getDB, runDbWrite, withDbWriteTransaction } from "@db/database";
import type { Task, ID, TaskReminderType, TaskRecurrence } from "@models/types";
import {
  scheduleTaskNotifications,
  cancelTaskNotifications,
} from "@services/notificationService";
import WidgetSyncService from "@services/WidgetSyncService";
import { emitTaskServerEvent } from "@services/sync/taskSyncEvents";
import { toSyncTask } from "@services/sync/taskSyncProtocol";

export type TaskPriority = 0 | 1 | 2;

const VALID_REMINDERS: TaskReminderType[] = ["AT_TIME", "10_MIN_BEFORE", "1_HOUR_BEFORE", "1_DAY_BEFORE"];

const safeJsonArray = (value: unknown): string[] => {
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const safeJsonNumberArray = (value: unknown): number[] => {
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
};

const safeJsonObject = <T>(value: unknown, fallback: T): T => {
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map(t => typeof t === "string" ? t.trim().toLowerCase() : "")
      .filter(t => t.length > 0)
  ));
};

const normalizeReminders = (value: unknown): TaskReminderType[] => {
  if (!Array.isArray(value)) return [];
  const deduped = Array.from(new Set(value.map(String)));
  return deduped
    .filter((item): item is TaskReminderType => VALID_REMINDERS.includes(item as TaskReminderType))
    .slice(0, 4);
};

const uuid = (): string =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const pad = (n: number) => String(n).padStart(2, "0");

export const toDateKey = (date: Date): string => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const weekdayFromDateKey = (dateKey: string): number => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getDay();
};

const parseTask = (row: Task & { repeatDays?: string; repeat?: string; completedDates?: string; reminders?: string; tags?: string; notificationIds?: string }): Task => ({
  ...row,
  completed: !!row.completed,
  priority: row.priority as TaskPriority,
  scheduledDate: row.scheduledDate ?? null,
  scheduledTime: row.scheduledTime ?? null,
  repeatDays: safeJsonNumberArray(row.repeatDays),
  repeat: safeJsonObject<TaskRecurrence | undefined>(row.repeat, undefined),
  completedDates: safeJsonArray(row.completedDates),
  tags: normalizeTags(safeJsonArray(row.tags)),
  reminders: normalizeReminders(safeJsonArray(row.reminders)),
  notificationIds: safeJsonArray(row.notificationIds),
});

export const isTaskCompletedForDate = (task: Task, dateKey: string): boolean => {
  if (!task.scheduledDate && !task.repeatDays?.length) {
    return task.completed;
  }
  return (task.completedDates ?? []).includes(dateKey);
};

export const shouldAppearOnDate = (task: Task, dateKey: string): boolean => {
  const repeats = task.repeatDays ?? [];
  if (repeats.length > 0) return repeats.includes(weekdayFromDateKey(dateKey));
  if (task.scheduledDate) return task.scheduledDate === dateKey;
  return dateKey === toDateKey(new Date());
};

const syncWidgetHeatmap = async (): Promise<void> => {
  try {
    const allTasks = await getAllTasks();
    await WidgetSyncService.updateWidgetWithTasks(allTasks);
  } catch (error) {
    console.error('[WIDGET] Failed to sync heatmap data:', error);
  }
};

export const createTask = async (
  payload: {
    id?: ID;
    text: string;
    priority?: TaskPriority;
    noteId?: ID | null;
    parentId?: ID | null;
    scheduledDate?: string | null;
    scheduledTime?: string | null;
    repeatDays?: number[];
    repeat?: TaskRecurrence;
    tags?: string[];
    reminders?: TaskReminderType[];
    updatedAt?: number;
  },
  origin?: string
): Promise<Task> => {
  const taskText = (payload.text ?? "").trim();
  if (!taskText) throw new Error("Task text cannot be empty");

  const task = await withDbWriteTransaction("createTask", async (db) => {
    const id = payload.id ?? uuid();
    const updatedAt = Number(payload.updatedAt ?? Date.now());
    const repeatDays = payload.repeatDays ?? [];
    const repeat = payload.repeat;
    const tags = normalizeTags(payload.tags ?? []);
    const reminders = normalizeReminders(payload.reminders ?? []);
    
    const nextOrderRow = await db.getFirstAsync<{ next: number }>(
      "SELECT COALESCE(MAX(orderIndex), 0) + 1 AS next FROM tasks"
    );
    const orderIndex = Number(nextOrderRow?.next ?? 1);

    const task: Task = {
      id,
      text: taskText,
      completed: false,
      updatedAt,
      orderIndex,
      priority: payload.priority ?? 1,
      noteId: payload.noteId ?? null,
      parentId: payload.parentId ?? null,
      scheduledDate: payload.scheduledDate ?? null,
      scheduledTime: payload.scheduledTime ?? null,
      repeatDays,
      repeat,
      tags,
      completedDates: [],
      reminders,
      notificationIds: [],
    };

    await db.runAsync(
      "INSERT INTO tasks (id, text, completed, updatedAt, orderIndex, priority, noteId, parentId, scheduledDate, scheduledTime, repeatDays, repeat, tags, completedDates, reminders, notificationIds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, taskText, 0, updatedAt, orderIndex, task.priority, task.noteId, task.parentId, task.scheduledDate, task.scheduledTime, JSON.stringify(repeatDays), repeat ? JSON.stringify(repeat) : null, JSON.stringify(tags), "[]", JSON.stringify(reminders), "[]"
    );
    return task;
  });

  // Sync notifications
  const notificationIds = await scheduleTaskNotifications(task);
  if (notificationIds.length > 0) {
    const finalTask = { ...task, notificationIds };
    await runDbWrite("UPDATE tasks SET notificationIds = ? WHERE id = ?", JSON.stringify(notificationIds), task.id);
    emitTaskServerEvent({ type: "TASK_CREATED", payload: toSyncTask(finalTask), origin });
    void syncWidgetHeatmap();
    return finalTask;
  }

  emitTaskServerEvent({ type: "TASK_CREATED", payload: toSyncTask(task), origin });
  void syncWidgetHeatmap();
  return task;
};

export const toggleTask = async (task: Task, origin?: string): Promise<Task> => {
  const updated = { ...task, completed: !task.completed, updatedAt: Date.now() };

  // Always sync notifications on toggle to ensure they are removed when completed or added when recurring/restored
  const nextNotificationIds = await scheduleTaskNotifications(updated);
  updated.notificationIds = nextNotificationIds;

  await runDbWrite(
    "UPDATE tasks SET completed = ?, updatedAt = ?, notificationIds = ? WHERE id = ?",
    updated.completed ? 1 : 0,
    updated.updatedAt,
    JSON.stringify(updated.notificationIds),
    task.id
  );

  emitTaskServerEvent({ type: "TASK_UPDATED", payload: toSyncTask(updated), origin });
  void syncWidgetHeatmap();
  return updated;
};

export const toggleTaskForDate = async (task: Task, dateKey: string, origin?: string): Promise<Task> => {
  const isRecurring = (task.repeatDays ?? []).length > 0;
  if (!isRecurring && !task.scheduledDate) return toggleTask(task);

  const normalizedDateKey = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : toDateKey(dateKey as any);
  const completedDates = new Set(task.completedDates ?? []);
  if (completedDates.has(normalizedDateKey)) completedDates.delete(normalizedDateKey);
  else completedDates.add(normalizedDateKey);

  const updated: Task = {
    ...task,
    updatedAt: Date.now(),
    completedDates: Array.from(completedDates)
  };

  // Sync notifications (critical for recurring tasks)
  const nextIds = await scheduleTaskNotifications(updated);
  updated.notificationIds = nextIds;

  await runDbWrite(
    "UPDATE tasks SET completedDates = ?, updatedAt = ?, notificationIds = ? WHERE id = ?",
    JSON.stringify(updated.completedDates),
    updated.updatedAt,
    JSON.stringify(updated.notificationIds),
    task.id
  );

  emitTaskServerEvent({ type: "TASK_UPDATED", payload: toSyncTask(updated), origin });
  void syncWidgetHeatmap();
  return updated;
};

export const updateTask = async (task: Task, origin?: string): Promise<Task> => {
  const normalizedReminders = normalizeReminders(task.reminders ?? []);
  const normalizedTags = normalizeTags(task.tags ?? []);
  
  // 1. Sync notifications first to get the final IDs for single-transaction consistency
  const nextNotificationIds = await scheduleTaskNotifications({
    ...task,
    reminders: normalizedReminders,
  });

  const updatedTask: Task = {
    ...task,
    reminders: normalizedReminders,
    tags: normalizedTags,
    notificationIds: nextNotificationIds,
    updatedAt: Date.now(),
  };

  // 2. Persist everything in one atomic write
  await runDbWrite(
    "UPDATE tasks SET text = ?, completed = ?, updatedAt = ?, orderIndex = ?, priority = ?, noteId = ?, scheduledDate = ?, scheduledTime = ?, repeatDays = ?, completedDates = ?, reminders = ?, notificationIds = ?, repeat = ?, tags = ? WHERE id = ?",
    updatedTask.text, updatedTask.completed ? 1 : 0, updatedTask.updatedAt, updatedTask.orderIndex, updatedTask.priority, updatedTask.noteId, updatedTask.scheduledDate, updatedTask.scheduledTime, JSON.stringify(updatedTask.repeatDays), JSON.stringify(updatedTask.completedDates), JSON.stringify(updatedTask.reminders), JSON.stringify(updatedTask.notificationIds), updatedTask.repeat ? JSON.stringify(updatedTask.repeat) : null, JSON.stringify(updatedTask.tags), updatedTask.id
  );

  emitTaskServerEvent({ type: "TASK_UPDATED", payload: toSyncTask(updatedTask), origin });
  void syncWidgetHeatmap();
  return updatedTask;
};

export const deleteTask = async (taskId: ID, origin?: string): Promise<void> => {
  await cancelTaskNotifications(String(taskId));
  await runDbWrite("DELETE FROM tasks WHERE id = ?", taskId);
  emitTaskServerEvent({ type: "TASK_DELETED", payload: { id: String(taskId), updatedAt: Date.now() }, origin });
  void syncWidgetHeatmap();
};

export const getAllTasks = async (): Promise<Task[]> => {
  const db = await getDB();
  const rows = await db.getAllAsync<Task & { repeatDays?: string; completedDates?: string; reminders?: string; notificationIds?: string }>(
    "SELECT * FROM tasks ORDER BY orderIndex ASC, id DESC"
  );
  return rows.map(parseTask);
};

export const deleteTaskWithChildren = async (taskId: ID): Promise<void> => {
    const db = await getDB();
    const children = await db.getAllAsync<{ id: ID }>("SELECT id FROM tasks WHERE parentId = ?", taskId);
    for (const child of children) {
        await deleteTask(child.id);
    }
    await deleteTask(taskId);
};

export const getTasksForDate = async (dateKey: string): Promise<Task[]> => {
  const all = await getAllTasks();
  return all.filter((task) => shouldAppearOnDate(task, dateKey));
};

export const moveTask = async (taskId: ID, parentId: ID | null, origin?: string): Promise<Task> => {
  const db = await getDB();
  const row = await db.getFirstAsync<any>("SELECT * FROM tasks WHERE id = ?", taskId);
  if (!row) throw new Error(`Task not found: ${taskId}`);

  const movedTask: Task = { ...parseTask(row), parentId: parentId ?? null, updatedAt: Date.now() };
  await runDbWrite("UPDATE tasks SET parentId = ?, updatedAt = ? WHERE id = ?", movedTask.parentId, movedTask.updatedAt, movedTask.id);
  emitTaskServerEvent({ type: "TASK_UPDATED", payload: toSyncTask(movedTask), origin });
  return movedTask;
};

export const reorderTasks = async (orderedIds: ID[]): Promise<void> => {
  await withDbWriteTransaction("reorderTasks", async (db) => {
    const existing = await db.getAllAsync<{ id: ID }>("SELECT id FROM tasks ORDER BY orderIndex ASC, id DESC");
    const remainingIds = existing.map((x) => x.id).filter((id) => !orderedIds.includes(id));
    const nextIds = [...orderedIds, ...remainingIds];
    for (let i = 0; i < nextIds.length; i += 1) {
      await db.runAsync("UPDATE tasks SET orderIndex = ? WHERE id = ?", i + 1, nextIds[i]);
    }
  });
};
