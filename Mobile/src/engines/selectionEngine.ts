import type { AppItem } from "@domain/items/types";

export type SelectionMap<T> = Record<string, T>;

export const getSelectionKey = (item: Pick<AppItem, "kind" | "id">): string => `${item.kind}:${item.id}`;

export const toggleSelectionInMap = <T>(current: SelectionMap<T>, item: T, getKey: (item: T) => string): SelectionMap<T> => {
  const key = getKey(item);
  if (current[key]) {
    const next = { ...current };
    delete next[key];
    return next;
  }
  return { ...current, [key]: item };
};

export const startSelectionMap = <T>(item: T, getKey: (item: T) => string): SelectionMap<T> => {
  return { [getKey(item)]: item };
};

export const selectAllVisibleMap = <T>(items: T[], getKey: (item: T) => string): SelectionMap<T> => {
  const next: SelectionMap<T> = {};
  items.forEach((item) => {
    next[getKey(item)] = item;
  });
  return next;
};

export const pruneSelectionMap = <T>(current: SelectionMap<T>, visibleItems: T[], getKey: (item: T) => string): SelectionMap<T> => {
  const visibleKeys = new Set(visibleItems.map((item) => getKey(item)));
  let changed = false;
  const next: SelectionMap<T> = {};

  Object.entries(current).forEach(([key, item]) => {
    if (visibleKeys.has(key)) {
      next[key] = item;
      return;
    }
    changed = true;
  });

  return changed ? next : current;
};
