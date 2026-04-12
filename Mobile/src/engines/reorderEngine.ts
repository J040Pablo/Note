import type { AppItemKind, ItemRegistry } from "@domain/items/types";
import { itemRegistry } from "@domain/items/registry";

export const reorderItems = async (
  payload: { kind: AppItemKind; parentId: string | null; orderedIds: string[] },
  registry: ItemRegistry = itemRegistry
): Promise<void> => {
  await registry.getAdapter(payload.kind).reorder(payload.orderedIds, payload.parentId);
};
