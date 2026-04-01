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
  createTask: (payload: Partial<Task> & { text: string }) => void;
  reorderTasksInStore: (orderedIds: ID[]) => void;
}

export const useTasksStore = create<TasksState & TasksActions>()(
  immer((set) => ({
    tasks: {},

    setTasks: (list) =>
      set((state) => {
        state.tasks = {};
        for (const task of list) {
          state.tasks[task.id] = { ...task, parentId: task.parentId ?? null };
        }
      }),

    upsertTask: (task) =>
      set((state) => {
        state.tasks[task.id] = { ...task, parentId: task.parentId ?? null };
        
        if (task.parentId && state.tasks[task.parentId]) {
          const parent = state.tasks[task.parentId];
          const siblings = Object.values(state.tasks).filter((t: any) => t.parentId === task.parentId);
          parent.completed = siblings.length > 0 && siblings.every((t: any) => t.completed);
        }
      }),

    removeTask: (taskId) =>
      set((state) => {
        const taskToRemove = state.tasks[taskId];
        if (!taskToRemove) return;
        
        const parentId = taskToRemove.parentId;
        delete state.tasks[taskId];

        if (parentId && state.tasks[parentId]) {
          const parent = state.tasks[parentId];
          const siblings = Object.values(state.tasks).filter((t: any) => t.parentId === parentId);
          parent.completed = siblings.length > 0 && siblings.every((t: any) => t.completed);
        }
      }),

    createTask: (payload) =>
      set((state) => {
        const id = payload.id || Date.now().toString() + Math.random().toString(36).substring(2);
        const newTask: Task = {
           id,
           completed: false,
           updatedAt: Date.now(),
           orderIndex: payload.orderIndex || 0,
           priority: payload.priority || 0,
           noteId: payload.noteId || null,
           parentId: payload.parentId || null,
           ...payload
        };
        state.tasks[id] = newTask;

        if (newTask.parentId && state.tasks[newTask.parentId]) {
           state.tasks[newTask.parentId].completed = false;
        }
      }),

    reorderTasksInStore: (orderedIds) =>
      set((state) => {
        orderedIds.forEach((id, index) => {
          if (state.tasks[id]) {
            state.tasks[id].orderIndex = index + 1;
          }
        });
      })
  }))
);
