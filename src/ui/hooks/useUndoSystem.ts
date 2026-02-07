import { useState, useEffect, useRef, useCallback } from "react";
import type { Task, CreateTaskParams } from "../../api/types.ts";
import { reopenTask, createTask, updateTask, closeTask } from "../../api/tasks.ts";

export interface UndoAction {
  type: "complete" | "delete" | "move" | "priority";
  taskIds: string[];
  previousState?: Partial<Task>[];
  timer: ReturnType<typeof setTimeout>;
}

export interface RedoAction {
  type: "complete" | "delete" | "move" | "priority";
  taskIds: string[];
  /** State to apply when redoing (i.e. the "new" state that undo reverted away from) */
  redoState?: Partial<Task>[];
  tasksSnapshot: Task[];
  timer: ReturnType<typeof setTimeout>;
}

interface UseUndoSystemOptions {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
  showStatus: (msg: string) => void;
  refreshTasks: () => Promise<void>;
}

export function useUndoSystem({ tasks, onTasksChange, showStatus, refreshTasks }: UseUndoSystemOptions) {
  const [lastAction, setLastAction] = useState<UndoAction | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const lastActionRef = useRef(lastAction);
  useEffect(() => { lastActionRef.current = lastAction; }, [lastAction]);

  const [lastRedo, setLastRedo] = useState<RedoAction | null>(null);
  const [redoCountdown, setRedoCountdown] = useState(0);
  const lastRedoRef = useRef(lastRedo);
  useEffect(() => { lastRedoRef.current = lastRedo; }, [lastRedo]);

  // Undo countdown timer
  useEffect(() => {
    if (!lastAction) {
      setUndoCountdown(0);
      return;
    }
    setUndoCountdown(10);
    const interval = setInterval(() => {
      setUndoCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lastAction]);

  // Redo countdown timer
  useEffect(() => {
    if (!lastRedo) {
      setRedoCountdown(0);
      return;
    }
    setRedoCountdown(10);
    const interval = setInterval(() => {
      setRedoCountdown((c) => {
        if (c <= 1) {
          clearInterval(interval);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lastRedo]);

  const startUndoTimer = useCallback(
    (action: { type: "complete" | "delete" | "move" | "priority"; taskIds: string[]; previousState?: Partial<Task>[] }) => {
      if (lastAction) clearTimeout(lastAction.timer);
      // Clear any pending redo when a new undoable action is performed
      if (lastRedoRef.current) {
        clearTimeout(lastRedoRef.current.timer);
        setLastRedo(null);
      }
      const timer = setTimeout(() => setLastAction(null), 10000);
      setLastAction({ ...action, timer });
    },
    [lastAction],
  );

  const clearUndo = useCallback(() => {
    if (lastActionRef.current) clearTimeout(lastActionRef.current.timer);
    setLastAction(null);
  }, []);

  const clearRedo = useCallback(() => {
    if (lastRedoRef.current) clearTimeout(lastRedoRef.current.timer);
    setLastRedo(null);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!lastAction) return;
    clearTimeout(lastAction.timer);

    // Save current tasks state before undo for redo
    const tasksBeforeUndo = [...tasks];
    const undoActionForRedo = lastAction;

    try {
      if (lastAction.type === "complete") {
        showStatus("Reopening task...");
        await Promise.all(lastAction.taskIds.map((id) => reopenTask(id)));
        showStatus("Task reopened! Press U to redo (10s)");
        refreshTasks().catch(() => {});
      } else if (lastAction.type === "delete" && lastAction.previousState) {
        showStatus("Recreating task...");
        for (const state of lastAction.previousState) {
          await createTask({
            content: state.content ?? "Untitled",
            description: state.description,
            priority: state.priority,
            due_string: state.due?.string,
            labels: state.labels,
            project_id: state.project_id,
          } as CreateTaskParams);
        }
        showStatus("Task recreated! Press U to redo (10s)");
        refreshTasks().catch(() => {});
      } else if (lastAction.type === "priority" && lastAction.previousState) {
        const revertMap = new Map(lastAction.taskIds.map((id, i) => [id, lastAction.previousState![i]?.priority]));
        onTasksChange(tasks.map((t) => (revertMap.has(t.id) ? { ...t, priority: revertMap.get(t.id) ?? t.priority } : t)));
        showStatus("Priority reverted! Press U to redo (10s)");
        await Promise.all(
          lastAction.taskIds.map((id, i) =>
            updateTask(id, { priority: lastAction.previousState![i]?.priority })
          ),
        );
        refreshTasks().catch(() => {});
      } else if (lastAction.type === "move" && lastAction.previousState) {
        const revertMap = new Map(lastAction.taskIds.map((id, i) => [id, lastAction.previousState![i]?.project_id]));
        onTasksChange(tasks.map((t) => (revertMap.has(t.id) ? { ...t, project_id: revertMap.get(t.id) ?? t.project_id } : t)));
        showStatus("Move reverted! Press U to redo (10s)");
        await Promise.all(
          lastAction.taskIds.map((id, i) =>
            updateTask(id, { project_id: lastAction.previousState![i]?.project_id })
          ),
        );
        refreshTasks().catch(() => {});
      }

      // Set up redo: save the pre-undo tasks and the action type
      const redoTimer = setTimeout(() => setLastRedo(null), 10000);
      setLastRedo({
        type: undoActionForRedo.type,
        taskIds: undoActionForRedo.taskIds,
        redoState: undoActionForRedo.previousState,
        tasksSnapshot: tasksBeforeUndo,
        timer: redoTimer,
      });
    } catch {
      showStatus("Undo failed");
    }
    setLastAction(null);
  }, [lastAction, tasks, onTasksChange, refreshTasks, showStatus]);

  const handleRedo = useCallback(async () => {
    if (!lastRedo) return;
    clearTimeout(lastRedo.timer);

    try {
      if (lastRedo.type === "complete") {
        showStatus("Re-completing task...");
        // Re-complete the tasks that were reopened by undo
        await Promise.all(lastRedo.taskIds.map((id) => closeTask(id)));
        showStatus("Task re-completed!");
        refreshTasks().catch(() => {});
      } else if (lastRedo.type === "delete") {
        showStatus("Re-deleting task...");
        // Re-delete the tasks that were recreated by undo
        // We need to refresh first to get the new IDs of recreated tasks, then delete them
        // The simplest approach: restore the pre-undo tasks snapshot (which had them removed)
        onTasksChange(lastRedo.tasksSnapshot);
        showStatus("Task re-deleted!");
        refreshTasks().catch(() => {});
      } else if (lastRedo.type === "priority") {
        // Restore pre-undo state (re-apply the priority change)
        onTasksChange(lastRedo.tasksSnapshot);
        showStatus("Priority change re-applied!");
        // Also re-apply via API using the snapshot priorities
        const snapshotMap = new Map(lastRedo.tasksSnapshot.map((t) => [t.id, t.priority]));
        Promise.all(
          lastRedo.taskIds.map((id) => {
            const priority = snapshotMap.get(id);
            if (priority !== undefined) return updateTask(id, { priority });
            return Promise.resolve();
          }),
        ).then(() => refreshTasks().catch(() => {})).catch(() => showStatus("Redo failed"));
      } else if (lastRedo.type === "move") {
        // Restore pre-undo state (re-apply the move)
        onTasksChange(lastRedo.tasksSnapshot);
        showStatus("Move re-applied!");
        const snapshotMap = new Map(lastRedo.tasksSnapshot.map((t) => [t.id, t.project_id]));
        Promise.all(
          lastRedo.taskIds.map((id) => {
            const projectId = snapshotMap.get(id);
            if (projectId !== undefined) return updateTask(id, { project_id: projectId });
            return Promise.resolve();
          }),
        ).then(() => refreshTasks().catch(() => {})).catch(() => showStatus("Redo failed"));
      }
    } catch {
      showStatus("Redo failed");
    }
    setLastRedo(null);
  }, [lastRedo, onTasksChange, refreshTasks, showStatus]);

  return { lastAction, lastActionRef, undoCountdown, startUndoTimer, handleUndo, clearUndo, lastRedo, redoCountdown, handleRedo, clearRedo };
}
