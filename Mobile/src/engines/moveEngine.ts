import type { AppItemKind, ItemRegistry } from "@domain/items/types";
import { itemRegistry } from "@domain/items/registry";

export const moveItem = async (
  payload: { kind: AppItemKind; id: string; toParentId: string | null },
  registry: ItemRegistry = itemRegistry
): Promise<void> => {
  await registry.getAdapter(payload.kind).move(payload.id, payload.toParentId);
};
