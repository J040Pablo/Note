import create from "zustand";
import { loadData, type DataFolder, type DataNote, type DataQuickNote, type DataStore } from "../services/webData";
import type { TaskItem } from "../features/tasks/types";

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toTaskItem = (task: DataStore["tasks"][number], fallbackOrder: number): TaskItem => {
  const completedDates = Array.isArray(task.completedDates) ? task.completedDates : [];
  const today = toDateKey(new Date());

  return {
    id: task.id,
    title: task.title,
    completed: completedDates.includes(today),
    completedDates,
    priority: task.priority === "low" || task.priority === "high" ? task.priority : "medium",
    scheduledDate: typeof task.scheduledDate === "string" ? task.scheduledDate : typeof task.dueDate === "string" ? task.dueDate : null,
    dueDate: typeof task.dueDate === "string" ? task.dueDate : null,
    dueTime: typeof task.dueTime === "string" ? task.dueTime : null,
    repeatDays: Array.isArray(task.repeatDays) ? task.repeatDays : [],
    order: typeof task.order === "number" ? task.order : fallbackOrder,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    parentId: task.parentId ?? null,
    noteId: task.noteId ?? null,
  };
};

const toSnapshot = (data: DataStore) => ({
  folders: data.folders,
  notes: data.notes,
  quickNotes: data.quickNotes,
  tasks: data.tasks.map((task, index) => toTaskItem(task, index)),
});

type SyncDataStoreState = {
  tasks: TaskItem[];
  folders: DataFolder[];
  notes: DataNote[];
  quickNotes: DataQuickNote[];
  refreshFromStorage: () => void;
  setFromStoreData: (data: DataStore) => void;
};

const initial = toSnapshot(loadData());

export const useSyncDataStore = create<SyncDataStoreState>((set) => ({
  ...initial,
  refreshFromStorage: () => {
    set(toSnapshot(loadData()));
  },
  setFromStoreData: (data) => {
    set(toSnapshot(data));
  },
}));

export const refreshSyncDataFromStorage = () => {
  useSyncDataStore.getState().refreshFromStorage();
};

export const setSyncDataFromStoreData = (data: DataStore) => {
  useSyncDataStore.getState().setFromStoreData(data);
};
