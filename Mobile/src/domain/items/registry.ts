import type { AppItem, AppItemKind, ItemAdapter, ItemRegistry } from "./types";
import { foldersAdapter } from "@adapters/foldersAdapter";
import { notesAdapter } from "@adapters/notesAdapter";
import { quickNotesAdapter } from "@adapters/quickNotesAdapter";
import { tasksAdapter } from "@adapters/tasksAdapter";

const adapters: Record<AppItemKind, ItemAdapter> = {
  folder: foldersAdapter,
  note: notesAdapter,
  quick: quickNotesAdapter,
  task: tasksAdapter
};

export const itemRegistry: ItemRegistry = {
  adapters,
  getAdapter: (kind) => adapters[kind],
  getKey: (item) => `${item.kind}:${item.id}`,
  getItems: () => Object.values(adapters).flatMap((adapter) => adapter.getItems()),
  getItemsByKind: (kind) => adapters[kind].getItems()
};

export const createItemRegistry = (customAdapters: Record<AppItemKind, ItemAdapter>): ItemRegistry => ({
  adapters: customAdapters,
  getAdapter: (kind) => customAdapters[kind],
  getKey: (item: AppItem) => `${item.kind}:${item.id}`,
  getItems: () => Object.values(customAdapters).flatMap((adapter) => adapter.getItems()),
  getItemsByKind: (kind) => customAdapters[kind].getItems()
});
