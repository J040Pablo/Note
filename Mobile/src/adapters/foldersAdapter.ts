import { useAppStore } from "@store/useAppStore";
import type { Folder, ID } from "@models/types";
import type { AppItem, ItemAdapter } from "@domain/items/types";
import { deleteFolder, reorderFolders, updateFolder } from "@services/foldersService";
import { togglePinnedItem } from "@services/appMetaService";
import { exportFolderPackageAndShare } from "@services/folderPackageService";

const toItem = (folder: Folder): AppItem => ({
  kind: "folder",
  id: folder.id,
  parentId: folder.parentId ?? null
});

export const foldersAdapter: ItemAdapter = {
  kind: "folder",
  getItems: () => Object.values(useAppStore.getState().folders).map(toItem),
  update: async (item: Folder) => {
    const updated = await updateFolder(item);
    useAppStore.getState().upsertFolder(updated);
  },
  delete: async (id: string) => {
    await deleteFolder(id);
    useAppStore.getState().removeFolder(id);
  },
  move: async (id: string, parentId: string | null) => {
    const current = useAppStore.getState().folders[id as ID];
    if (!current) return;
    const updated = await updateFolder({ ...current, parentId: parentId as ID | null });
    useAppStore.getState().upsertFolder(updated);
  },
  reorder: async (ids: string[], parentId: string | null) => {
    const orderedIds = ids as ID[];
    useAppStore.getState().reorderFoldersInStore(orderedIds);
    await reorderFolders(parentId as ID | null, orderedIds);
  },
  pin: async (id: string) => {
    await togglePinnedItem("folder", id);
  },
  share: async (id: string) => {
    await exportFolderPackageAndShare(id);
  }
};
