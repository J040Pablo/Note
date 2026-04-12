import { useCallback } from "react";
import { itemRegistry } from "@domain/items/registry";
import type { AppItem, AppItemKind, ItemRegistry } from "@domain/items/types";
import { moveItem as moveItemEngine } from "@engines/moveEngine";
import { reorderItems as reorderItemsEngine } from "@engines/reorderEngine";

export const useItemActions = (registry: ItemRegistry = itemRegistry) => {
  const getAdapter = useCallback((kind: AppItemKind) => registry.getAdapter(kind), [registry]);

  const deleteItem = useCallback(
    async (item: AppItem) => {
      await getAdapter(item.kind).delete(item.id);
    },
    [getAdapter]
  );

  const pinItem = useCallback(
    async (item: AppItem) => {
      const adapter = getAdapter(item.kind);
      if (adapter.pin) {
        await adapter.pin(item.id);
      }
    },
    [getAdapter]
  );

  const shareItem = useCallback(
    async (item: AppItem) => {
      const adapter = getAdapter(item.kind);
      if (adapter.share) {
        await adapter.share(item.id);
      }
    },
    [getAdapter]
  );

  const moveItem = useCallback(
    (payload: { kind: AppItemKind; id: string; toParentId: string | null }) => moveItemEngine(payload, registry),
    [registry]
  );

  const reorderItems = useCallback(
    (payload: { kind: AppItemKind; parentId: string | null; orderedIds: string[] }) => reorderItemsEngine(payload, registry),
    [registry]
  );

  return {
    registry,
    getAdapter,
    delete: deleteItem,
    deleteItem,
    pin: pinItem,
    pinItem,
    share: shareItem,
    shareItem,
    move: moveItem,
    moveItem,
    reorder: reorderItems,
    reorderItems
  };
};
