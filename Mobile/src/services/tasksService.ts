import { getDB, runDbWrite, withDbWriteTransaction } from "@db/database";
import type { Task, ID, TaskReminderType } from "@models/types";
import {
  scheduleTaskNotifications,
  cancelTaskNotifications,
} from "@services/notificationService";
import WidgetSyncService from "@services/WidgetSyncService";
import { emitTaskServerEvent } from "@services/sync/taskSyncEvents";
import { toSyncTask } from "@services/sync/taskSyncProtocol";

export type TaskPriority = 0 | 1 | 2; // 0 = low, 1 = medium, 2 = high

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

const parseTask = (row: Task & { repeatDays?: string; completedDates?: string; reminders?: string; notificationIds?: string }): Task => ({
  ...row,
  completed: !!row.completed,
  priority: row.priority as TaskPriority,
  scheduledDate: row.scheduledDate ?? null,
  scheduledTime: row.scheduledTime ?? null,
  repeatDays: safeJsonNumberArray(row.repeatDays),
  completedDates: safeJsonArray(row.completedDates),
  reminders: normalizeReminders(safeJsonArray(row.reminders)),
  notificationIds: safeJsonArray(row.notificationIds),
});

export const isTaskCompletedForDate = (task: Task, dateKey: string): boolean => {
  if (!task.scheduledDate && !task.repeatDays?.length) {
    // Non-scheduled task: use the boolean field only
    return task.completed;
  }
  // Scheduled or recurring: use completedDates array
  return (task.completedDates ?? []).includes(dateKey);
};

export const shouldAppearOnDate = (task: Task, dateKey: string): boolean => {
  const repeats = task.repeatDays ?? [];
  if (repeats.length > 0) {
    return repeats.includes(weekdayFromDateKey(dateKey));
  }
  if (task.scheduledDate) {
    return task.scheduledDate === dateKey;
  }
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

export const createTask = async (payload: {
  id?: ID;
  text: string;
  priority?: TaskPriority;
  noteId?: ID | null;
  parentId?: ID | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  repeatDays?: number[];
  reminders?: TaskReminderType[];
  updatedAt?: number;
}): Promise<Task> => {
  // Validate that text is not empty
  const taskText = (payload.text ?? "").trim();
  if (!taskText) {
    throw new Error("Task text cannot be empty");
  }

  console.log("createTask called");

  const task = await withDbWriteTransaction("createTask", async (db) => {
    const id = payload.id ?? uuid();
    const updatedAt = Number(payload.updatedAt ?? Date.now());
    const repeatDays = payload.repeatDays ?? [];
    const reminders = normalizeReminders(payload.reminders ?? []);
    const completedDates: string[] = [];
    const nextOrderRow = await db.getFirstAsync<{ next: number }>(
      "SELECT COALESCE(MAX(orderIndex), 0) + 1 AS next FROM tasks"
    );
    const orderIndex = Number(nextOrderRow?.next ?? 1);

    // Create task object for notification scheduling
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
      completedDates,
      reminders,
      notificationIds: [],
    };

    await db.runAsync(
      "INSERT INTO tasks (id, text, completed, updatedAt, orderIndex, priority, noteId, parentId, scheduledDate, scheduledTime, repeatDays, completedDates, reminders, notificationIds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      taskText,
      0,
      updatedAt,
      orderIndex,
      payload.priority ?? 1,
      payload.noteId ?? null,
      payload.parentId ?? null,
      payload.scheduledDate ?? null,
      payload.scheduledTime ?? null,
      JSON.stringify(repeatDays),
      JSON.stringify(completedDates),
      JSON.stringify(reminders),
      JSON.stringify(task.notificationIds ?? [])
    );
    return task;
  });

  // After task exists in DB, schedule notifications and persist notificationIds.
  let createdTask = task;
  try {
    if (task.scheduledDate && task.scheduledTime && !task.completed) {
      const notificationIds = await scheduleTaskNotifications(task);
      createdTask = {
        ...task,
        notificationIds,
      };

      await runDbWrite(
        "UPDATE tasks SET notificationIds = ?, updatedAt = ? WHERE id = ?",
        JSON.stringify(notificationIds),
        createdTask.updatedAt,
        createdTask.id
      );

      if (__DEV__) {
        console.log(`[NOTIF] Scheduled task notifications for ID: ${createdTask.id} (${notificationIds.length})`);
      }
    }
  } catch (e) {
    console.log(`[NOTIF ERROR] scheduleTaskNotifications create ${task.id}`, e);
  }

  emitTaskServerEvent({ type: "TASK_CREATED", payload: toSyncTask(createdTask) });
  void syncWidgetHeatmap();
  return createdTask;
};

export const toggleTask = async (task: Task): Promise<Task> => {
  const updated = { ...task, completed: !task.completed, updatedAt: Date.now() };

  // Cancel notifications when task is marked as completed
  if (updated.completed && task.notificationIds && task.notificationIds.length > 0) {
    try {
      await cancelTaskNotifications(task.notificationIds);
    } catch (e) {
      console.log(`[NOTIF ERROR] cancelTaskNotifications toggle ${task.id}`, e);
    }
  }

  await runDbWrite(
    "UPDATE tasks SET completed = ?, updatedAt = ? WHERE id = ?",
    updated.completed ? 1 : 0,
    updated.updatedAt,
    task.id
  );
  emitTaskServerEvent({ type: "TASK_UPDATED", payload: toSyncTask(updated) });
  void syncWidgetHeatmap();
  return updated;
};

export const toggleTaskForDate = async (task: Task, dateKey: string): Promise<Task> => {
  const repeats = task.repeatDays ?? [];
  const isRecurringOrScheduled = repeats.length > 0 || !!task.scheduledDate;

  if (!isRecurringOrScheduled) {
    return toggleTask(task);
  }

  // Normalize dateKey to YYYY-MM-DD format (safety check)
  const normalizedDateKey = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : toDateKey(dateKey as any);
  
  const completedDates = new Set(task.completedDates ?? []);
  const isCompleting = !completedDates.has(normalizedDateKey);
  
  if (isCompleting) {
    completedDates.add(normalizedDateKey);
  } else {
    completedDates.delete(normalizedDateKey);
  }

  const updated: Task = {
    ...task,
    updatedAt: Date.now(),
    completedDates: Array.from(completedDates)
  };

  if (__DEV__) {
    console.log(`[TASK] toggleTaskForDate: ${task.id} date=${normalizedDateKey} isCompleting=${isCompleting} newDates=${updated.completedDates.length}`);
  }

  // Cancel notifications when all instances are completed
  if (isCompleting && task.notificationIds && task.notificationIds.length > 0) {
    // For recurring tasks, only cancel if this is the only instance
    if (repeats.length === 0) {
      try {
        await cancelTaskNotifications(task.notificationIds);
      } catch (e) {
        console.log(`[NOTIF ERROR] cancelTaskNotifications toggleForDate ${task.id}`, e);
      }
    }
  }

  await runDbWrite(
    "UPDATE tasks SET completedDates = ?, updatedAt = ? WHERE id = ?",
    JSON.stringify(updated.completedDates),
    updated.updatedAt,
    task.id
  );

  emitTaskServerEvent({ type: "TASK_UPDATED", payload: toSyncTask(updated) });
  void syncWidgetHeatmap();

  return updated;
};

export const updateTaskPriority = async (task: Task, priority: TaskPriority): Promise<Task> => {
  const updated = { ...task, priority, updatedAt: Date.now() };

  await runDbWrite("UPDATE tasks SET priority = ?, updatedAt = ? WHERE id = ?", priority, updated.updatedAt, task.id);
  emitTaskServerEvent({ type: "TASK_UPDATED", payload: toSyncTask(updated) });
  return updated;
};

export const updateTask = async (task: Task): Promise<Task> => {
  const previousNotificationIds = Array.isArray(task.notificationIds) ? task.notificationIds : [];
  const normalizedReminders = normalizeReminders(task.reminders ?? []);
  const baseUpdatedTask: Task = {
    ...task,
    reminders: normalizedReminders,
    notificationIds: previousNotificationIds,
    updatedAt: Date.now(),
  };

  // 1) Persist task fields first.
  await runDbWrite(
    "UPDATE tasks SET text = ?, completed = ?, updatedAt = ?, orderIndex = ?, priority = ?, noteId = ?, scheduledDate = ?, scheduledTime = ?, repeatDays = ?, completedDates = ?, reminders = ?, notificationIds = ? WHERE id = ?",
    baseUpdatedTask.text,
    baseUpdatedTask.completed ? 1 : 0,
    baseUpdatedTask.updatedAt,
    baseUpdatedTask.orderIndex,
    baseUpdatedTask.priority,
    baseUpdatedTask.noteId ?? null,
    baseUpdatedTask.scheduledDate ?? null,
    baseUpdatedTask.scheduledTime ?? null,
    JSON.stringify(baseUpdatedTask.repeatDays ?? []),
    JSON.stringify(baseUpdatedTask.completedDates ?? []),
    JSON.stringify(baseUpdatedTask.reminders ?? []),
    JSON.stringify(baseUpdatedTask.notificationIds ?? []),
    baseUpdatedTask.id
  );

  // 2) Notification side effects: cancel old -> schedule new if eligible.
  let nextNotificationIds = previousNotificationIds;
  try {
    if (previousNotificationIds.length > 0) {
      await cancelTaskNotifications(previousNotificationIds);
      nextNotificationIds = [];
    }

    if (baseUpdatedTask.scheduledDate && baseUpdatedTask.scheduledTime && !baseUpdatedTask.completed) {
      nextNotificationIds = await scheduleTaskNotifications({
        ...baseUpdatedTask,
        notificationIds: [],
      });
      if (__DEV__) {
        console.log(`[NOTIF] Rescheduled notifications for task ID: ${task.id} (${nextNotificationIds.length})`);
      }
    }
  } catch (e) {
    console.log(`[NOTIF ERROR] updateTask notifications ${task.id}`, e);
  }

  // 3) Persist definitive notificationIds.
  const finalTask: Task = {
    ...baseUpdatedTask,
    notificationIds: nextNotificationIds,
    updatedAt: Date.now(),
  };

  await runDbWrite(
    "UPDATE tasks SET notificationIds = ?, updatedAt = ? WHERE id = ?",
    JSON.stringify(finalTask.notificationIds ?? []),
    finalTask.updatedAt,
    finalTask.id
  );

  emitTaskServerEvent({ type: "TASK_UPDATED", payload: toSyncTask(finalTask) });
  void syncWidgetHeatmap();
  return finalTask;
};

export const moveTask = async (taskId: ID, parentId: ID | null): Promise<Task> => {
  const db = await getDB();
  const row = await db.getFirstAsync<Task & { repeatDays?: string; completedDates?: string; reminders?: string; notificationIds?: string }>(
    "SELECT * FROM tasks WHERE id = ?",
    taskId
  );

  if (!row) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const movedTask: Task = {
    ...parseTask(row),
    parentId: parentId ?? null,
    updatedAt: Date.now()
  };

  await runDbWrite(
    "UPDATE tasks SET parentId = ?, updatedAt = ? WHERE id = ?",
    movedTask.parentId,
    movedTask.updatedAt,
    movedTask.id
  );

  emitTaskServerEvent({ type: "TASK_UPDATED", payload: toSyncTask(movedTask) });
  return movedTask;
};

export const deleteTask = async (taskId: ID): Promise<void> => {
  // First get task to retrieve notification IDs
  const db = await getDB();
  const row = await db.getFirstAsync<Task & { notificationIds?: string }>(
    "SELECT * FROM tasks WHERE id = ?",
    taskId
  );
  
  // Cancel notifications before deleting
  if (row && row.notificationIds) {
    const notificationIds = safeJsonArray(row.notificationIds);
    if (notificationIds.length > 0) {
      try {
        await cancelTaskNotifications(notificationIds);
      } catch (e) {
        console.log(`[NOTIF ERROR] cancelTaskNotifications delete ${taskId}`, e);
      }
    }
  }
  
  await runDbWrite("DELETE FROM tasks WHERE id = ?", taskId);
  emitTaskServerEvent({ type: "TASK_DELETED", payload: { id: String(taskId), updatedAt: Date.now() } });
  void syncWidgetHeatmap();
};

export const getAllTasks = async (): Promise<Task[]> => {
  const db = await getDB();
  const rows = await db.getAllAsync<Task & { repeatDays?: string; completedDates?: string; reminders?: string; notificationIds?: string }>(
    "SELECT * FROM tasks ORDER BY orderIndex ASC, id DESC"
  );
  return rows.map(parseTask);
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

export const getTasksForDate = async (dateKey: string): Promise<Task[]> => {
  const all = await getAllTasks();
  return all.filter((task) => shouldAppearOnDate(task, dateKey));
};

export const getPriorityTasks = async (minPriority: TaskPriority = 2, limit = 5): Promise<Task[]> => {
  const db = await getDB();
  const rows = await db.getAllAsync<Task & { repeatDays?: string; completedDates?: string; reminders?: string; notificationIds?: string }>(
    "SELECT * FROM tasks WHERE priority >= ? ORDER BY priority DESC LIMIT ?",
    minPriority,
    limit
  );
  return rows.map(parseTask).filter((task) => !task.completed);
};

