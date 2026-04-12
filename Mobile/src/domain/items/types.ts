import type { ID } from "@models/types";

export type AppItemKind = "folder" | "note" | "quick" | "task";

export type AppItem =
  | { kind: "folder"; id: ID; parentId: ID | null }
  | { kind: "note"; id: ID; parentId: ID | null }
  | { kind: "quick"; id: ID; parentId: ID | null }
  | { kind: "task"; id: ID; parentId: ID | null };

export type AppItemKey = `${AppItemKind}:${ID}`;

export type ItemAdapter = {
  kind: AppItemKind;
  getItems: () => AppItem[];
  update: (item: any) => Promise<void>;
  delete: (id: string) => Promise<void>;
  move: (id: string, parentId: string | null) => Promise<void>;
  reorder: (ids: string[], parentId: string | null) => Promise<void>;
  pin?: (id: string) => Promise<void>;
  share?: (id: string) => Promise<void>;
};

export type ItemRegistry = {
  adapters: Record<AppItemKind, ItemAdapter>;
  getAdapter: (kind: AppItemKind) => ItemAdapter;
  getKey: (item: AppItem) => AppItemKey;
  getItems: () => AppItem[];
  getItemsByKind: (kind: AppItemKind) => AppItem[];
};
