import { getDB, runDbWrite } from "@db/database";
import type { PinnedItem, PinnedItemType, RecentItem, RecentItemType, ID } from "@models/types";

const PINNED_KEY = "pinned_items";
const RECENT_KEY = "recent_items";
const LIST_ORDER_PREFIX = "list_order:";
const SORT_PREF_PREFIX = "sort_pref:";

const safeParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed as T;
  } catch {
    return fallback;
  }
};

const readMeta = async <T>(key: string, fallback: T): Promise<T> => {
  const db = await getDB();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", key);
  return safeParse<T>(row?.value, fallback);
};

const writeMeta = async <T>(key: string, value: T): Promise<void> => {
  await runDbWrite(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    JSON.stringify(value)
  );
};

export const getPinnedItems = async (): Promise<PinnedItem[]> => {
  const items = await readMeta<PinnedItem[]>(PINNED_KEY, []);
  return items
    .filter((x) => !!x && !!x.id && (x.type === "folder" || x.type === "note" || x.type === "task"))
    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
};

export const savePinnedItems = async (items: PinnedItem[]): Promise<void> => {
  await writeMeta(PINNED_KEY, items);
};

export const getRecentItems = async (): Promise<RecentItem[]> => {
  const items = await readMeta<RecentItem[]>(RECENT_KEY, []);
  return items
    .filter((x) => !!x && !!x.id && (x.type === "folder" || x.type === "note"))
    .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))
    .slice(0, 10);
};

export const saveRecentItems = async (items: RecentItem[]): Promise<void> => {
  await writeMeta(RECENT_KEY, items.slice(0, 10));
};

export const togglePinnedItem = async (type: PinnedItemType, id: ID): Promise<PinnedItem[]> => {
  const items = await getPinnedItems();
  const exists = items.some((x) => x.type === type && x.id === id);
  const next = exists
    ? items.filter((x) => !(x.type === type && x.id === id))
    : [{ type, id, pinnedAt: Date.now() }, ...items.filter((x) => !(x.type === type && x.id === id))];

  await savePinnedItems(next);
  return next;
};

export const addRecentOpen = async (type: RecentItemType, id: ID): Promise<RecentItem[]> => {
  const items = await getRecentItems();
  const next = [{ type, id, openedAt: Date.now() }, ...items.filter((x) => !(x.type === type && x.id === id))].slice(0, 10);
  await saveRecentItems(next);
  return next;
};

export const getListOrder = async (scope: string): Promise<ID[]> => {
  const ids = await readMeta<ID[]>(`${LIST_ORDER_PREFIX}${scope}`, []);
  return ids.filter(Boolean);
};

export const saveListOrder = async (scope: string, ids: ID[]): Promise<void> => {
  await writeMeta(`${LIST_ORDER_PREFIX}${scope}`, ids);
};

export const getSortPreference = async <T extends string>(
  scope: string,
  fallback: T
): Promise<T> => {
  const value = await readMeta<T | null>(`${SORT_PREF_PREFIX}${scope}`, null);
  return value ?? fallback;
};

export const saveSortPreference = async <T extends string>(scope: string, value: T): Promise<void> => {
  await writeMeta(`${SORT_PREF_PREFIX}${scope}`, value);
};
