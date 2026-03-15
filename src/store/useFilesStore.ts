import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { AppFile, ID } from "@models/types";

interface FilesState {
  files: Record<ID, AppFile>;
}

interface FilesActions {
  setFiles: (list: AppFile[]) => void;
  upsertFile: (file: AppFile) => void;
  removeFile: (fileId: ID) => void;
}

export const useFilesStore = create<FilesState & FilesActions>()(
  immer((set) => ({
    files: {},

    setFiles: (list) =>
      set((state) => {
        state.files = {};
        for (const file of list) {
          state.files[file.id] = file;
        }
      }),

    upsertFile: (file) =>
      set((state) => {
        state.files[file.id] = file;
      }),

    removeFile: (fileId) =>
      set((state) => {
        delete state.files[fileId];
      })
  }))
);
