import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Folder, ID } from "@models/types";

interface AppState {
  folders: Record<ID, Folder>;
  selectedFolderId: ID | null;
}

interface AppActions {
  setInitialData: (payload: Partial<AppState>) => void;
  selectFolder: (folderId: ID | null) => void;
  setFolders: (list: Folder[]) => void;
  upsertFolder: (folder: Folder) => void;
  removeFolder: (folderId: ID) => void;
}

export const useAppStore = create<AppState & AppActions>()(
  immer((set) => ({
    folders: {},
    selectedFolderId: null,

    setInitialData: (payload) =>
      set((state) => {
        Object.assign(state, payload);
      }),

    selectFolder: (folderId) =>
      set((state) => {
        state.selectedFolderId = folderId;
      }),

    setFolders: (list) =>
      set((state) => {
        state.folders = {};
        for (const folder of list) {
          state.folders[folder.id] = folder;
        }
      }),

    upsertFolder: (folder) =>
      set((state) => {
        state.folders[folder.id] = folder;
      }),

    removeFolder: (folderId) =>
      set((state) => {
        delete state.folders[folderId];
      })
  }))
);

