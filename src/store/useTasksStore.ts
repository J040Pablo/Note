import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Task, ID } from "@models/types";

interface TasksState {
  tasks: Record<ID, Task>;
}

interface TasksActions {
  setTasks: (list: Task[]) => void;
  upsertTask: (task: Task) => void;
  removeTask: (taskId: ID) => void;
}

export const useTasksStore = create<TasksState & TasksActions>()(
  immer((set) => ({
    tasks: {},

    setTasks: (list) =>
      set((state) => {
        state.tasks = {};
        for (const task of list) {
          state.tasks[task.id] = task;
        }
      }),

    upsertTask: (task) =>
      set((state) => {
        state.tasks[task.id] = task;
      }),

    removeTask: (taskId) =>
      set((state) => {
        delete state.tasks[taskId];
      })
  }))
);

