// Web-side tasks service — mirrors Mobile tasksService API surface.
// All operations are synchronous against localStorage via webData.

import { loadData, saveData, type DataTask } from "./webData";
import type { TaskItem, TaskPriority } from "../features/tasks/types";

const makeTaskId = () =>
  `task-${Date.now()}-${Math.round(Math.random() * 1e4)}`;

const mapDataToItem = (task: DataTask, fallbackOrder: number): TaskItem => ({
  id: task.id,
  title: task.title,
  completed: task.completed,
  priority:
    task.priority === "low" || task.priority === "high"
      ? task.priority
      : "medium",
  dueDate: typeof task.dueDate === "string" ? task.dueDate : null,
  dueTime: typeof task.dueTime === "string" ? task.dueTime : null,
  repeatDays: Array.isArray(task.repeatDays) ? task.repeatDays : [],
  order: typeof task.order === "number" ? task.order : fallbackOrder,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  parentId: task.parentId ?? null,
  noteId: task.noteId ?? null,
});

const mapItemToData = (task: TaskItem): DataTask => ({
  id: task.id,
  title: task.title,
  completed: task.completed,
  priority: task.priority,
  dueDate: task.dueDate,
  dueTime: task.dueTime,
  repeatDays: task.repeatDays,
  order: task.order,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  parentId: task.parentId ?? null,
  noteId: task.noteId ?? null,
});

// ─── Read ────────────────────────────────────────────────────────────────────

export const getAllTasks = (): TaskItem[] => {
  const store = loadData();
  return store.tasks.map((task, index) => mapDataToItem(task, index));
};

export const getTaskById = (id: string): TaskItem | null => {
  const all = getAllTasks();
  return all.find((task) => task.id === id) ?? null;
};

export const getSubtasks = (parentId: string): TaskItem[] =>
  getAllTasks().filter((task) => task.parentId === parentId);

export const getRootTasks = (): TaskItem[] =>
  getAllTasks().filter((task) => !task.parentId);

// ─── Write ───────────────────────────────────────────────────────────────────

export const createTask = (payload: {
  id?: string;
  title: string;
  priority?: TaskPriority;
  dueDate?: string | null;
  dueTime?: string | null;
  repeatDays?: number[];
  parentId?: string | null;
  noteId?: string | null;
}): TaskItem => {
  const store = loadData();
  const now = Date.now();
  const maxOrder =
    store.tasks.length > 0
      ? Math.max(...store.tasks.map((t) => typeof t.order === "number" ? t.order : 0))
      : -1;

  const task: DataTask = {
    id: payload.id ?? makeTaskId(),
    title: (payload.title ?? "").trim() || "Untitled task",
    completed: false,
    priority: payload.priority ?? "medium",
    dueDate: payload.dueDate ?? null,
    dueTime: payload.dueTime ?? null,
    repeatDays: payload.repeatDays ?? [],
    order: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
    parentId: payload.parentId ?? null,
    noteId: payload.noteId ?? null,
  };

  store.tasks = [task, ...store.tasks];
  saveData(store);

  return mapDataToItem(task, 0);
};

export const updateTask = (updated: TaskItem): TaskItem => {
  const store = loadData();
  const now = Date.now();
  const patched: TaskItem = { ...updated, updatedAt: now };

  store.tasks = store.tasks.map((task) =>
    task.id === patched.id ? mapItemToData(patched) : task
  );
  saveData(store);

  return patched;
};

export const toggleTask = (id: string): TaskItem | null => {
  const store = loadData();
  const now = Date.now();
  let result: TaskItem | null = null;

  store.tasks = store.tasks.map((task, index) => {
    if (task.id !== id) return task;
    const toggled = { ...task, completed: !task.completed, updatedAt: now };
    result = mapDataToItem(toggled, index);
    return toggled;
  });

  saveData(store);
  return result;
};

export const deleteTask = (id: string): void => {
  const store = loadData();
  // Delete task and all its subtasks
  const idsToDelete = new Set<string>([id]);
  // Collect subtask IDs recursively
  let found = true;
  while (found) {
    found = false;
    store.tasks.forEach((task) => {
      if (task.parentId && idsToDelete.has(task.parentId) && !idsToDelete.has(task.id)) {
        idsToDelete.add(task.id);
        found = true;
      }
    });
  }
  store.tasks = store.tasks.filter((task) => !idsToDelete.has(task.id));
  saveData(store);
};

export const reorderTasks = (orderedIds: string[]): void => {
  const store = loadData();
  const taskMap = new Map(store.tasks.map((t) => [t.id, t]));
  const reordered: DataTask[] = [];

  orderedIds.forEach((id, index) => {
    const task = taskMap.get(id);
    if (task) {
      reordered.push({ ...task, order: index });
      taskMap.delete(id);
    }
  });

  // Append any remaining tasks not in the ordered list
  let nextOrder = orderedIds.length;
  taskMap.forEach((task) => {
    reordered.push({ ...task, order: nextOrder++ });
  });

  store.tasks = reordered;
  saveData(store);
};

// ─── Bulk Replace (used by sync) ─────────────────────────────────────────────

export const replaceAllTasks = (tasks: TaskItem[]): void => {
  const store = loadData();
  store.tasks = tasks.map((t) => mapItemToData(t));
  saveData(store);
};
