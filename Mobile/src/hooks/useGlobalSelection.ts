import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppItem } from "@domain/items/types";
import { getSelectionKey, pruneSelectionMap, selectAllVisibleMap, startSelectionMap, toggleSelectionInMap } from "@engines/selectionEngine";

interface UseGlobalSelectionOptions {
  onSelectionStart?: () => void;
}

export const useGlobalSelection = <T extends { kind: AppItem["kind"]; id: string }>(
  items: T[],
  options: UseGlobalSelectionOptions = {}
) => {
  const [selectedMap, setSelectedMap] = useState<Record<string, T>>({});

  const getKey = getSelectionKey;
  const selectedItems = useMemo(() => Object.values(selectedMap), [selectedMap]);
  const selectionCount = selectedItems.length;
  const selectionMode = selectionCount > 0;

  const isSelected = useCallback(
    (item: T) => {
      return !!selectedMap[getKey(item)];
    },
    [getKey, selectedMap]
  );

  const toggleSelection = useCallback(
    (item: T) => {
      setSelectedMap((current) => toggleSelectionInMap(current, item, getKey));
    },
    [getKey]
  );

  const startSelection = useCallback(
    (item: T) => {
      options.onSelectionStart?.();
      setSelectedMap(startSelectionMap(item, getKey));
    },
    [getKey, options]
  );

  const clearSelection = useCallback(() => {
    setSelectedMap({});
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedMap(selectAllVisibleMap(items, getKey));
  }, [getKey, items]);

  useEffect(() => {
    setSelectedMap((current) => pruneSelectionMap(current, items, getKey));
  }, [getKey, items]);

  return {
    selectedItems,
    selectedMap,
    selectionCount,
    selectionMode,
    isSelectionMode: selectionMode,
    isSelected,
    toggleSelection,
    startSelection,
    clearSelection,
    selectAllVisible
  };
};
