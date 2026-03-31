// Web-side appMeta service — mirrors Mobile appMetaService API surface.
// localStorage-backed metadata store for pinned items, recent items, list order, sort prefs.

import type { ID, PinnedItem, PinnedItemType, RecentItem, RecentItemType } from "../types";

const PINNED_KEY = "note.web.pinned.v1";
const RECENT_KEY = "note.web.recent.v1";
const LIST_ORDER_PREFIX = "note.web.listorder:";
const SORT_PREF_PREFIX = "note.web.sortpref:";

const safeParse = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed as T;
  } catch {
    return fallback;
  }
};

const readMeta = <T>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key);
  return safeParse<T>(raw, fallback);
};

const writeMeta = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
};

// ─── Pinned Items ────────────────────────────────────────────────────────────

export const getPinnedItems = (): PinnedItem[] => {
  const items = readMeta<PinnedItem[]>(PINNED_KEY, []);
  return items
    .filter(
      (x) =>
        !!x &&
        !!x.id &&
        (x.type === "folder" || x.type === "note" || x.type === "task")
    )
    .sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
};

export const savePinnedItems = (items: PinnedItem[]): void => {
  writeMeta(PINNED_KEY, items);
};

export const togglePinnedItem = (type: PinnedItemType, id: ID): PinnedItem[] => {
  const items = getPinnedItems();
  const exists = items.some((x) => x.type === type && x.id === id);
  const next = exists
    ? items.filter((x) => !(x.type === type && x.id === id))
    : [
        { type, id, pinnedAt: Date.now() },
        ...items.filter((x) => !(x.type === type && x.id === id)),
      ];

  savePinnedItems(next);
  return next;
};

export const isPinned = (type: PinnedItemType, id: ID): boolean => {
  return getPinnedItems().some((x) => x.type === type && x.id === id);
};

// ─── Recent Items ────────────────────────────────────────────────────────────

export const getRecentItems = (): RecentItem[] => {
  const items = readMeta<RecentItem[]>(RECENT_KEY, []);
  return items
    .filter(
      (x) => !!x && !!x.id && (x.type === "folder" || x.type === "note")
    )
    .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))
    .slice(0, 10);
};

export const saveRecentItems = (items: RecentItem[]): void => {
  writeMeta(RECENT_KEY, items.slice(0, 10));
};

export const addRecentOpen = (type: RecentItemType, id: ID): RecentItem[] => {
  const items = getRecentItems();
  const next = [
    { type, id, openedAt: Date.now() },
    ...items.filter((x) => !(x.type === type && x.id === id)),
  ].slice(0, 10);
  saveRecentItems(next);
  return next;
};

// ─── List Order ──────────────────────────────────────────────────────────────

export const getListOrder = (scope: string): ID[] => {
  const ids = readMeta<ID[]>(`${LIST_ORDER_PREFIX}${scope}`, []);
  return ids.filter(Boolean);
};

export const saveListOrder = (scope: string, ids: ID[]): void => {
  writeMeta(`${LIST_ORDER_PREFIX}${scope}`, ids);
};

// ─── Sort Preferences ────────────────────────────────────────────────────────

export const getSortPreference = <T extends string>(
  scope: string,
  fallback: T
): T => {
  const value = readMeta<T | null>(`${SORT_PREF_PREFIX}${scope}`, null);
  return value ?? fallback;
};

export const saveSortPreference = <T extends string>(
  scope: string,
  value: T
): void => {
  writeMeta(`${SORT_PREF_PREFIX}${scope}`, value);
};
