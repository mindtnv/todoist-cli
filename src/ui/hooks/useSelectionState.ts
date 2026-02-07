import { useState, useCallback } from "react";
import type { Task } from "../../api/types.ts";

interface UseSelectionStateOptions {
  filteredTasks: Task[];
  taskIndex: number;
  showStatus: (msg: string) => void;
}

export function useSelectionState({
  filteredTasks,
  taskIndex,
  showStatus,
}: UseSelectionStateOptions) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rangeSelectAnchor, setRangeSelectAnchor] = useState<number | null>(null);

  const selectedTask = filteredTasks[taskIndex];

  const toggleSelection = useCallback(() => {
    if (!selectedTask) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(selectedTask.id)) {
        next.delete(selectedTask.id);
      } else {
        next.add(selectedTask.id);
      }
      return next;
    });
  }, [selectedTask]);

  const handleRangeSelect = useCallback(() => {
    if (rangeSelectAnchor === null) {
      setRangeSelectAnchor(taskIndex);
      if (selectedTask) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.add(selectedTask.id);
          return next;
        });
      }
      showStatus("Range select started. Move cursor then press v again.");
      return;
    }
    // Range select end: select everything between anchor and current
    const start = Math.min(rangeSelectAnchor, taskIndex);
    const end = Math.max(rangeSelectAnchor, taskIndex);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (let i = start; i <= end; i++) {
        const t = filteredTasks[i];
        if (t) next.add(t.id);
      }
      return next;
    });
    setRangeSelectAnchor(null);
    showStatus(`${end - start + 1} tasks selected`);
  }, [rangeSelectAnchor, taskIndex, filteredTasks, selectedTask, showStatus]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setRangeSelectAnchor(null);
  }, []);

  return {
    selectedIds,
    setSelectedIds,
    rangeSelectAnchor,
    setRangeSelectAnchor,
    selectedTask,
    toggleSelection,
    handleRangeSelect,
    clearSelection,
  };
}
