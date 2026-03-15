import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Folder, ID, PinnedItem, PinnedItemType, RecentItem, RecentItemType } from "@models/types";

interface AppState {
  folders: Record<ID, Folder>;
  selectedFolderId: ID | null;
  pinnedItems: PinnedItem[];
  recentItems: RecentItem[];
}

interface AppActions {
  setInitialData: (payload: Partial<AppState>) => void;
  selectFolder: (folderId: ID | null) => void;
  setFolders: (list: Folder[]) => void;
  upsertFolder: (folder: Folder) => void;
  removeFolder: (folderId: ID) => void;
  setPinnedItems: (items: PinnedItem[]) => void;
  setRecentItems: (items: RecentItem[]) => void;
  togglePinned: (type: PinnedItemType, id: ID) => PinnedItem[];
  pushRecent: (type: RecentItemType, id: ID) => RecentItem[];
}

export const useAppStore = create<AppState & AppActions>()(
  immer((set) => ({
    folders: {},
    selectedFolderId: null,
    pinnedItems: [],
    recentItems: [],

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
      }),

    setPinnedItems: (items) =>
      set((state) => {
        state.pinnedItems = items;
      }),

    setRecentItems: (items) =>
      set((state) => {
        state.recentItems = items.slice(0, 10);
      }),

    togglePinned: (type, id) => {
      let next: PinnedItem[] = [];
      set((state) => {
        const exists = state.pinnedItems.some((x) => x.type === type && x.id === id);
        next = exists
          ? state.pinnedItems.filter((x) => !(x.type === type && x.id === id))
          : [{ type, id, pinnedAt: Date.now() }, ...state.pinnedItems.filter((x) => !(x.type === type && x.id === id))];
        state.pinnedItems = next;
      });
      return next;

    },

    pushRecent: (type, id) => {
      let next: RecentItem[] = [];
      set((state) => {
        next = [{ type, id, openedAt: Date.now() }, ...state.recentItems.filter((x) => !(x.type === type && x.id === id))].slice(0, 10);
        state.recentItems = next;
      })
      return next;
    }
  }))
);

