"use client";

import { useState, useCallback, useMemo } from "react";

export interface CatalogMultiSelectController<TId extends string | number> {
  selectedIds: ReadonlySet<TId>;
  selectedCount: number;
  selectionMode: boolean;

  enter: (id: TId) => void;
  toggle: (id: TId) => void;
  clear: () => void;
  isSelected: (id: TId) => boolean;
  handleSelectionBack: () => boolean;
}

export function useCatalogMultiSelect<
  TId extends string | number
>(): CatalogMultiSelectController<TId> {
  const [selectedIds, setSelectedIds] = useState<Set<TId>>(new Set());

  const selectedCount = selectedIds.size;
  const selectionMode = selectedIds.size > 0;

  const enter = useCallback((id: TId) => {
    setSelectedIds(new Set([id]));
  }, []);

  const toggle = useCallback((id: TId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: TId) => selectedIds.has(id),
    [selectedIds],
  );

  const handleSelectionBack = useCallback((): boolean => {
    if (selectedIds.size === 0) return false;
    clear();
    return true;
  }, [selectedIds.size, clear]);

  return useMemo(
    () => ({
      selectedIds: selectedIds as ReadonlySet<TId>,
      selectedCount,
      selectionMode,
      enter,
      toggle,
      clear,
      isSelected,
      handleSelectionBack,
    }),
    [selectedIds, selectedCount, selectionMode, enter, toggle, clear, isSelected, handleSelectionBack],
  );
}
