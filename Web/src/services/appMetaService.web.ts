// Web-side appMeta service — mirrors Mobile appMetaService API surface.
// localStorage-backed metadata store for pinned items, recent items, list order, sort prefs.

import { dispatchEntitySyncEvent } from "../features/tasks/sync";
import { isWebMobileSyncMode } from "./webSyncMode";
import type { ID, PinnedItem, PinnedItemType, RecentItem, RecentItemType } from "../types";

const PINNED_KEY = "pinned_items";
const RECENT_KEY = "recent_items";
const LIST_ORDER_PREFIX = "list_order:";
const SORT_PREF_PREFIX = "sort_pref:";

const LEGACY_KEYS = {
  pinned: "note.web.pinned.v1",
  recent: "note.web.recent.v1",
  listOrderPrefix: "note.web.listorder:",
  sortPrefPrefix: "note.web.sortpref:",
};

type MetaRecord<T> = {
  value: T;
  updatedAt: number;
};

const parseRecord = <T>(raw: string | null, fallback: T): MetaRecord<T> => {
  if (!raw) return { value: fallback, updatedAt: 0 };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "value" in (parsed as Record<string, unknown>)) {
      const record = parsed as { value?: T; updatedAt?: number };
      return {
        value: record.value ?? fallback,
        updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
      };
    }

    return { value: parsed as T, updatedAt: 0 };
  } catch {
    return { value: fallback, updatedAt: 0 };
  }
};

const readMetaRecord = <T>(key: string, fallback: T): MetaRecord<T> => {
  return parseRecord<T>(localStorage.getItem(key), fallback);
};

const writeMetaRecord = <T>(key: string, value: T, updatedAt = Date.now()): void => {
  try {
    localStorage.setItem(key, JSON.stringify({ value, updatedAt }));
  } catch {
    // Ignore storage errors
  }
};

const readWithFallback = <T>(primaryKey: string, legacyKey: string, fallback: T): MetaRecord<T> => {
  const primary = readMetaRecord<T>(primaryKey, fallback);
  if (primary.updatedAt > 0 || localStorage.getItem(primaryKey)) {
    return primary;
  }

  const legacy = readMetaRecord<T>(legacyKey, fallback);
  if (legacy.updatedAt > 0 || localStorage.getItem(legacyKey)) {
    writeMetaRecord(primaryKey, legacy.value, legacy.updatedAt);
    return legacy;
  }

  return primary;
};

export const getMetaRecord = <T>(key: string, fallback: T): MetaRecord<T> => {
  if (key === PINNED_KEY) return readWithFallback<PinnedItem[]>(PINNED_KEY, LEGACY_KEYS.pinned, []) as MetaRecord<T>;
  if (key === RECENT_KEY) return readWithFallback<RecentItem[]>(RECENT_KEY, LEGACY_KEYS.recent, []) as MetaRecord<T>;
  if (key.startsWith(LIST_ORDER_PREFIX)) {
    const suffix = key.slice(LIST_ORDER_PREFIX.length);
    return readWithFallback<ID[]>(key, `${LEGACY_KEYS.listOrderPrefix}${suffix}`, []) as MetaRecord<T>;
  }
  if (key.startsWith(SORT_PREF_PREFIX)) {
    const suffix = key.slice(SORT_PREF_PREFIX.length);
    return readWithFallback<string | null>(key, `${LEGACY_KEYS.sortPrefPrefix}${suffix}`, null) as MetaRecord<T>;
  }
  return readMetaRecord<T>(key, fallback);
};

export const setMetaRecord = <T>(key: string, value: T, updatedAt = Date.now()): void => {
  writeMetaRecord(key, value, updatedAt);
};

const emitMetaSync = (key: string, value: unknown): void => {
  if (!isWebMobileSyncMode()) return;

  dispatchEntitySyncEvent({
    type: "UPSERT_APP_META",
    payload: {
      key,
      value: JSON.stringify(value),
      updatedAt: Date.now(),
    },
  });
};

// ─── Pinned Items ────────────────────────────────────────────────────────────

export const getPinnedItems = (): PinnedItem[] => {
  const items = getMetaRecord<PinnedItem[]>(PINNED_KEY, []).value;
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
  const next = items;
  writeMetaRecord(PINNED_KEY, next);
  writeMetaRecord(LEGACY_KEYS.pinned, next);
  emitMetaSync(PINNED_KEY, next);
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
  const items = getMetaRecord<RecentItem[]>(RECENT_KEY, []).value;
  return items
    .filter(
      (x) => !!x && !!x.id && (x.type === "folder" || x.type === "note")
    )
    .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))
    .slice(0, 10);
};

export const saveRecentItems = (items: RecentItem[]): void => {
  const next = items.slice(0, 10);
  writeMetaRecord(RECENT_KEY, next);
  writeMetaRecord(LEGACY_KEYS.recent, next);
  emitMetaSync(RECENT_KEY, next);
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
  const ids = getMetaRecord<ID[]>(`${LIST_ORDER_PREFIX}${scope}`, []).value;
  return ids.filter(Boolean);
};

export const saveListOrder = (scope: string, ids: ID[]): void => {
  const next = ids.filter(Boolean);
  writeMetaRecord(`${LIST_ORDER_PREFIX}${scope}`, next);
  writeMetaRecord(`${LEGACY_KEYS.listOrderPrefix}${scope}`, next);
  emitMetaSync(`${LIST_ORDER_PREFIX}${scope}`, next);
};

// ─── Sort Preferences ────────────────────────────────────────────────────────

export const getSortPreference = <T extends string>(
  scope: string,
  fallback: T
): T => {
  const value = getMetaRecord<T | null>(`${SORT_PREF_PREFIX}${scope}`, null).value;
  return value ?? fallback;
};

export const saveSortPreference = <T extends string>(
  scope: string,
  value: T
): void => {
  writeMetaRecord(`${SORT_PREF_PREFIX}${scope}`, value);
  writeMetaRecord(`${LEGACY_KEYS.sortPrefPrefix}${scope}`, value);
  emitMetaSync(`${SORT_PREF_PREFIX}${scope}`, value);
};
