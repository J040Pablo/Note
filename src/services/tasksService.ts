import { getDb } from "@database/db";
import type { Task, ID } from "@models/types";

export type TaskPriority = 0 | 1 | 2; // 0 = low, 1 = medium, 2 = high

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

const pad = (n: number) => String(n).padStart(2, "0");

export const toDateKey = (date: Date): string => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const weekdayFromDateKey = (dateKey: string): number => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getDay();
};

const parseTask = (row: Task & { repeatDays?: string; completedDates?: string }): Task => ({
  ...row,
  completed: !!row.completed,
  priority: row.priority as TaskPriority,
  scheduledDate: row.scheduledDate ?? null,
  repeatDays: safeJsonNumberArray(row.repeatDays),
  completedDates: safeJsonArray(row.completedDates)
});

export const isTaskCompletedForDate = (task: Task, dateKey: string): boolean => {
  const repeats = task.repeatDays ?? [];
  const completedDates = task.completedDates ?? [];
  if (repeats.length > 0 || task.scheduledDate) {
    return completedDates.includes(dateKey);
  }
  return task.completed;
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

export const createTask = async (payload: {
  text: string;
  priority: TaskPriority;
  noteId?: ID | null;
  scheduledDate?: string | null;
  repeatDays?: number[];
}): Promise<Task> => {
  const db = await getDb();
  const id = String(Date.now());
  const repeatDays = payload.repeatDays ?? [];
  const completedDates: string[] = [];

  await db.runAsync(
    "INSERT INTO tasks (id, text, completed, priority, noteId, scheduledDate, repeatDays, completedDates) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    payload.text,
    0,
    payload.priority,
    payload.noteId ?? null,
    payload.scheduledDate ?? null,
    JSON.stringify(repeatDays),
    JSON.stringify(completedDates)
  );

  return {
    id,
    text: payload.text,
    completed: false,
    priority: payload.priority,
    noteId: payload.noteId ?? null,
    scheduledDate: payload.scheduledDate ?? null,
    repeatDays,
    completedDates
  };
};

export const toggleTask = async (task: Task): Promise<Task> => {
  const db = await getDb();
  const updated = { ...task, completed: !task.completed };

  await db.runAsync("UPDATE tasks SET completed = ? WHERE id = ?", updated.completed ? 1 : 0, task.id);
  return updated;
};

export const toggleTaskForDate = async (task: Task, dateKey: string): Promise<Task> => {
  const db = await getDb();
  const repeats = task.repeatDays ?? [];
  const isRecurringOrScheduled = repeats.length > 0 || !!task.scheduledDate;

  if (!isRecurringOrScheduled) {
    return toggleTask(task);
  }

  const completedDates = new Set(task.completedDates ?? []);
  if (completedDates.has(dateKey)) {
    completedDates.delete(dateKey);
  } else {
    completedDates.add(dateKey);
  }

  const updated: Task = {
    ...task,
    completedDates: Array.from(completedDates)
  };

  await db.runAsync(
    "UPDATE tasks SET completedDates = ? WHERE id = ?",
    JSON.stringify(updated.completedDates),
    task.id
  );

  return updated;
};

export const updateTaskPriority = async (task: Task, priority: TaskPriority): Promise<Task> => {
  const db = await getDb();
  const updated = { ...task, priority };

  await db.runAsync("UPDATE tasks SET priority = ? WHERE id = ?", priority, task.id);
  return updated;
};

export const updateTask = async (task: Task): Promise<Task> => {
  const db = await getDb();
  await db.runAsync(
    "UPDATE tasks SET text = ?, completed = ?, priority = ?, noteId = ?, scheduledDate = ?, repeatDays = ?, completedDates = ? WHERE id = ?",
    task.text,
    task.completed ? 1 : 0,
    task.priority,
    task.noteId ?? null,
    task.scheduledDate ?? null,
    JSON.stringify(task.repeatDays ?? []),
    JSON.stringify(task.completedDates ?? []),
    task.id
  );
  return task;
};

export const deleteTask = async (taskId: ID): Promise<void> => {
  const db = await getDb();
  await db.runAsync("DELETE FROM tasks WHERE id = ?", taskId);
};

export const getAllTasks = async (): Promise<Task[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<Task & { repeatDays?: string; completedDates?: string }>(
    "SELECT * FROM tasks"
  );
  return rows.map(parseTask);
};

export const getTasksForDate = async (dateKey: string): Promise<Task[]> => {
  const all = await getAllTasks();
  return all.filter((task) => shouldAppearOnDate(task, dateKey));
};

export const getPriorityTasks = async (minPriority: TaskPriority = 2, limit = 5): Promise<Task[]> => {
  const db = await getDb();
  const rows = await db.getAllAsync<Task & { repeatDays?: string; completedDates?: string }>(
    "SELECT * FROM tasks WHERE priority >= ? ORDER BY priority DESC LIMIT ?",
    minPriority,
    limit
  );
  return rows.map(parseTask).filter((task) => !task.completed);
};

