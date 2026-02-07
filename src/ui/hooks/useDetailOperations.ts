import { useCallback } from "react";
import type { Task, UpdateTaskParams } from "../../api/types.ts";
import { closeTask, deleteTask, updateTask } from "../../api/tasks.ts";
import type { HookRegistry } from "../../plugins/types.ts";

export function useDetailOperations(
  task: Task | undefined,
  projects: Array<{ id: string; name: string }>,
  onTaskChanged: (message?: string) => void,
  showStatus: (msg: string) => void,
  hooks?: HookRegistry | null,
) {
  const handleSetPriority = useCallback(async (priority: 1 | 2 | 3 | 4) => {
    if (!task) return;
    try {
      showStatus("Setting priority...");
      try { await hooks?.emit("task.updating", { task, changes: { priority } }); } catch { /* hook error is non-critical */ }
      await updateTask(task.id, { priority });
      try { await hooks?.emit("task.updated", { task: { ...task, priority }, changes: { priority } }); } catch { /* hook error is non-critical */ }
      onTaskChanged(`Priority set to p${priority}`);
    } catch {
      showStatus("Failed to set priority");
    }
  }, [task, onTaskChanged, showStatus, hooks]);

  const handleSetDueDate = useCallback(async (dueString: string) => {
    if (!task) return;
    try {
      const isRemove = dueString.toLowerCase() === "none" || dueString.toLowerCase() === "clear";
      const changes: UpdateTaskParams = { due_string: isRemove ? "no date" : dueString };
      try { await hooks?.emit("task.updating", { task, changes }); } catch { /* hook error is non-critical */ }
      await updateTask(task.id, changes);
      try { await hooks?.emit("task.updated", { task, changes }); } catch { /* hook error is non-critical */ }
      onTaskChanged(isRemove ? "Due date removed" : `Due set to "${dueString}"`);
    } catch {
      showStatus("Failed to set due date");
    }
  }, [task, onTaskChanged, showStatus, hooks]);

  const handleSetDeadline = useCallback(async (value: string) => {
    if (!task) return;
    const isRemove = value.toLowerCase() === "none" || value.toLowerCase() === "clear" || value === "";
    if (!isRemove && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      showStatus("Invalid date format. Use YYYY-MM-DD.");
      return;
    }
    try {
      const changes: UpdateTaskParams = { deadline_date: isRemove ? null : value };
      try { await hooks?.emit("task.updating", { task, changes }); } catch { /* hook error is non-critical */ }
      await updateTask(task.id, changes);
      try { await hooks?.emit("task.updated", { task, changes }); } catch { /* hook error is non-critical */ }
      onTaskChanged(isRemove ? "Deadline removed" : `Deadline set to ${value}`);
    } catch {
      showStatus("Failed to set deadline");
    }
  }, [task, onTaskChanged, showStatus, hooks]);

  const handleMoveToProject = useCallback(async (projectId: string) => {
    if (!task) return;
    try {
      const projectName = projects.find((p) => p.id === projectId)?.name ?? "project";
      const changes: UpdateTaskParams = { project_id: projectId };
      try { await hooks?.emit("task.updating", { task, changes }); } catch { /* hook error is non-critical */ }
      await updateTask(task.id, changes);
      try { await hooks?.emit("task.updated", { task: { ...task, project_id: projectId }, changes }); } catch { /* hook error is non-critical */ }
      onTaskChanged(`Moved to ${projectName}`);
    } catch {
      showStatus("Failed to move task");
    }
  }, [task, projects, onTaskChanged, showStatus, hooks]);

  const handleLabelsSave = useCallback(async (newLabels: string[]) => {
    if (!task) return;
    try {
      const changes: UpdateTaskParams = { labels: newLabels };
      try { await hooks?.emit("task.updating", { task, changes }); } catch { /* hook error is non-critical */ }
      await updateTask(task.id, changes);
      try { await hooks?.emit("task.updated", { task: { ...task, labels: newLabels }, changes }); } catch { /* hook error is non-critical */ }
      onTaskChanged("Labels updated");
    } catch {
      showStatus("Failed to update labels");
    }
  }, [task, onTaskChanged, showStatus, hooks]);

  const handleComplete = useCallback(async () => {
    if (!task) return;
    try {
      showStatus("Completing task...");
      await closeTask(task.id);
      try { await hooks?.emit("task.completed", { task }); } catch { /* hook error is non-critical */ }
      onTaskChanged("Task completed!");
    } catch {
      showStatus("Failed to complete task");
    }
  }, [task, onTaskChanged, showStatus, hooks]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!task) return;
    try {
      showStatus("Deleting task...");
      await deleteTask(task.id);
      try { await hooks?.emit("task.deleted", { task }); } catch { /* hook error is non-critical */ }
      onTaskChanged("Task deleted!");
    } catch {
      showStatus("Failed to delete task");
    }
  }, [task, onTaskChanged, showStatus, hooks]);

  const handleEditFull = useCallback(async (params: UpdateTaskParams & { project_id?: string }) => {
    if (!task) return;
    try {
      try { await hooks?.emit("task.updating", { task, changes: params }); } catch { /* hook error is non-critical */ }
      await updateTask(task.id, params);
      try { await hooks?.emit("task.updated", { task, changes: params }); } catch { /* hook error is non-critical */ }
      onTaskChanged("Task updated");
    } catch {
      showStatus("Failed to update task");
    }
  }, [task, onTaskChanged, showStatus, hooks]);

  return {
    handleSetPriority,
    handleSetDueDate,
    handleSetDeadline,
    handleMoveToProject,
    handleLabelsSave,
    handleComplete,
    handleDeleteConfirm,
    handleEditFull,
  };
}
