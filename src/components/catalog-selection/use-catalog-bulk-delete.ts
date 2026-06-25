"use client";

import { useState, useCallback, useMemo } from "react";

export interface CatalogBulkDeleteController<TId extends string | number> {
  deleteOpen: boolean;
  deleting: boolean;
  deleteError: string | null;

  requestDelete: () => void;
  cancelDelete: () => void;
  resetDeleteState: () => void;

  executeDelete: (
    ids: readonly TId[],
    deleteAction: (ids: readonly TId[]) => Promise<void>,
    onSuccess?: (count: number) => void,
  ) => Promise<boolean>;
}

export function useCatalogBulkDelete<
  TId extends string | number
>(): CatalogBulkDeleteController<TId> {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const requestDelete = useCallback(() => {
    setDeleteError(null);
    setDeleteOpen(true);
  }, []);

  const cancelDelete = useCallback(() => {
    setDeleting((current) => {
      if (current) return true; // ponytail: deleting 时禁止关闭
      return current;
    });
    if (!deleting) {
      setDeleteOpen(false);
      setDeleteError(null);
    }
  }, [deleting]);

  const resetDeleteState = useCallback(() => {
    setDeleteOpen(false);
    setDeleting(false);
    setDeleteError(null);
  }, []);

  const executeDelete = useCallback(
    async (
      ids: readonly TId[],
      deleteAction: (ids: readonly TId[]) => Promise<void>,
      onSuccess?: (count: number) => void,
    ): Promise<boolean> => {
      setDeleteError(null);
      setDeleting(true);
      try {
        await deleteAction(ids);
        setDeleteOpen(false);
        onSuccess?.(ids.length);
        return true;
      } catch (error) {
        setDeleteError(
          error instanceof Error ? error.message : "删除失败，请重试",
        );
        return false;
      } finally {
        setDeleting(false);
      }
    },
    [],
  );

  return useMemo(
    () => ({
      deleteOpen,
      deleting,
      deleteError,
      requestDelete,
      cancelDelete,
      resetDeleteState,
      executeDelete,
    }),
    [deleteOpen, deleting, deleteError, requestDelete, cancelDelete, resetDeleteState, executeDelete],
  );
}
