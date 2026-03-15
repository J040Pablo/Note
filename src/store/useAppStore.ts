import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Folder, Note, Task, Attachment, ID } from "@models/types";

interface AppState {
  folders: Record<ID, Folder>;
  notes: Record<ID, Note>;
  tasks: Record<ID, Task>;
  attachments: Record<ID, Attachment>;
  selectedFolderId: ID | null;
}

interface AppActions {
  setInitialData: (payload: Partial<AppState>) => void;
  selectFolder: (folderId: ID | null) => void;

  upsertFolder: (folder: Folder) => void;
  upsertNote: (note: Note) => void;
  upsertTask: (task: Task) => void;
  upsertAttachment: (attachment: Attachment) => void;

  toggleTaskCompleted: (taskId: ID) => void;
  toggleTaskPriority: (taskId: ID) => void;
}

export const useAppStore = create<AppState & AppActions>()(
  immer((set) => ({
    folders: {},
    notes: {},
    tasks: {},
    attachments: {},
    selectedFolderId: null,

    setInitialData: (payload) =>
      set((state) => {
        Object.assign(state, payload);
      }),

    selectFolder: (folderId) =>
      set((state) => {
        state.selectedFolderId = folderId;
      }),

    upsertFolder: (folder) =>
      set((state) => {
        state.folders[folder.id] = folder;
      }),

    upsertNote: (note) =>
      set((state) => {
        state.notes[note.id] = note;
      }),

    upsertTask: (task) =>
      set((state) => {
        state.tasks[task.id] = task;
      }),

    upsertAttachment: (attachment) =>
      set((state) => {
        state.attachments[attachment.id] = attachment;
      }),

    toggleTaskCompleted: (taskId) =>
      set((state) => {
        const task = state.tasks[taskId];
        if (task) {
          task.completed = !task.completed;
        }
      }),

    toggleTaskPriority: (taskId) =>
      set((state) => {
        const task = state.tasks[taskId];
        if (task) {
          task.priority = !task.priority;
        }
      })
  }))
);

