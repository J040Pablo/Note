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
  reorderFilesInStore: (orderedIds: ID[]) => void;
}

export const useFilesStore = create<FilesState & FilesActions>()(
  immer((set) => ({
    files: {},

    setFiles: (list) =>
      set((state) => {
        state.files = {};
        for (const file of list) {
          state.files[file.id] = { ...file, parentFolderId: file.parentFolderId ?? null };
        }
      }),

    upsertFile: (file) =>
      set((state) => {
        state.files[file.id] = { ...file, parentFolderId: file.parentFolderId ?? null };
      }),

    removeFile: (fileId) =>
      set((state) => {
        delete state.files[fileId];
      }),

    // Surgically updates only orderIndex for the reordered IDs.
    // Never replaces the map, so only mutated file objects re-render.
    reorderFilesInStore: (orderedIds) =>
      set((state) => {
        orderedIds.forEach((id, index) => {
          if (state.files[id]) {
            state.files[id].orderIndex = index + 1;
          }
        });
      })
  }))
);
