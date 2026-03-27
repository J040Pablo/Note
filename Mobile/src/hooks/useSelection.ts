import { useCallback, useEffect, useMemo, useState } from "react";

interface UseSelectionOptions<T> {
  getKey: (item: T) => string;
  onSelectionStart?: () => void;
}

export const useSelection = <T>(visibleItems: T[], options: UseSelectionOptions<T>) => {
  const { getKey, onSelectionStart } = options;
  const [selectedMap, setSelectedMap] = useState<Record<string, T>>({});

  const selectionCount = useMemo(() => Object.keys(selectedMap).length, [selectedMap]);
  const selectionMode = selectionCount > 0;

  const selectedItems = useMemo(() => Object.values(selectedMap), [selectedMap]);

  const isSelected = useCallback(
    (item: T) => {
      const key = getKey(item);
      return !!selectedMap[key];
    },
    [getKey, selectedMap]
  );

  const toggleSelection = useCallback(
    (item: T) => {
      const key = getKey(item);
      setSelectedMap((prev) => {
        if (prev[key]) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: item };
      });
    },
    [getKey]
  );

  const startSelection = useCallback(
    (item: T) => {
      onSelectionStart?.();
      const key = getKey(item);
      setSelectedMap({ [key]: item });
    },
    [getKey, onSelectionStart]
  );

  const clearSelection = useCallback(() => {
    setSelectedMap({});
  }, []);

  const selectAllVisible = useCallback(() => {
    const next: Record<string, T> = {};
    visibleItems.forEach((item) => {
      next[getKey(item)] = item;
    });
    setSelectedMap(next);
  }, [getKey, visibleItems]);

  useEffect(() => {
    const visibleKeySet = new Set((visibleItems ?? []).map((item) => getKey(item)));
    setSelectedMap((prev) => {
      let changed = false;
      const next: Record<string, T> = {};
      Object.entries(prev).forEach(([key, item]) => {
        if (visibleKeySet.has(key)) {
          next[key] = item;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [getKey, visibleItems]);

  return {
    selectedItems,
    selectedMap,
    selectionCount,
    selectionMode,
    isSelected,
    toggleSelection,
    startSelection,
    clearSelection,
    selectAllVisible
  };
};

