import { useCallback } from "react";
import type { Task, CreateTaskParams, UpdateTaskParams } from "../../api/types.ts";
import { createTask, closeTask, deleteTask, updateTask } from "../../api/tasks.ts";
import { parseQuickAdd, resolveProjectName } from "../../utils/quick-add.ts";
import type { UndoAction } from "./useUndoSystem.ts";
import type { HookRegistry } from "../../plugins/types.ts";

interface UseTaskOperationsOptions {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
  showStatus: (msg: string) => void;
  startUndoTimer: (action: { type: UndoAction["type"]; taskIds: string[]; previousState?: Partial<Task>[] }) => void;
  clearUndo: () => void;
  lastActionRef: React.RefObject<UndoAction | null>;
  refreshTasks: () => Promise<void>;
  selectedTask: Task | undefined;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setRangeSelectAnchor: React.Dispatch<React.SetStateAction<number | null>>;
  setTaskIndex: React.Dispatch<React.SetStateAction<number>>;
  setModal: React.Dispatch<React.SetStateAction<string>>;
  filteredTasksLength: number;
  filterProjectId: string | undefined;
  filterView: string;
  projects: Array<{ id: string; name: string }>;
  pluginHooks?: HookRegistry | null;
}

export function useTaskOperations({
  tasks,
  onTasksChange,
  showStatus,
  startUndoTimer,
  clearUndo,
  lastActionRef,
  refreshTasks,
  selectedTask,
  selectedIds,
  setSelectedIds,
  setRangeSelectAnchor,
  setTaskIndex,
  setModal,
  filteredTasksLength,
  filterProjectId,
  filterView,
  projects,
  pluginHooks,
}: UseTaskOperationsOptions) {

  const handleCompleteTask = useCallback(async () => {
    if (!selectedTask) return;
    const taskId = selectedTask.id;
    const taskSnapshot = selectedTask;
    const prevTasks = [...tasks];
    onTasksChange(tasks.filter((t) => t.id !== taskId));
    setTaskIndex((i) => Math.min(i, Math.max(filteredTasksLength - 2, 0)));
    startUndoTimer({ type: "complete", taskIds: [taskId] });
    showStatus("Task completed! Press u to undo (10s)");
    try {
      await closeTask(taskId);
      try { await pluginHooks?.emit("task.completed", { task: taskSnapshot }); } catch (err) { console.warn("[plugin-hook]", err); }
      refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
    } catch {
      onTasksChange(prevTasks);
      if (lastActionRef.current) clearTimeout(lastActionRef.current.timer);
      clearUndo();
      showStatus("Failed to complete task");
    }
  }, [selectedTask, tasks, onTasksChange, filteredTasksLength, startUndoTimer, refreshTasks, showStatus, setTaskIndex, lastActionRef, clearUndo, pluginHooks]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedTask) return;
    setModal("none");
    const taskId = selectedTask.id;
    const taskSnapshot = selectedTask;
    const snapshot: Partial<Task> = {
      content: selectedTask.content,
      description: selectedTask.description,
      priority: selectedTask.priority,
      due: selectedTask.due,
      labels: selectedTask.labels,
      project_id: selectedTask.project_id,
    };
    const prevTasks = [...tasks];
    onTasksChange(tasks.filter((t) => t.id !== taskId));
    setTaskIndex((i) => Math.min(i, Math.max(filteredTasksLength - 2, 0)));
    setRangeSelectAnchor(null);
    startUndoTimer({ type: "delete", taskIds: [taskId], previousState: [snapshot] });
    showStatus("Task deleted! Press u to undo (10s)");
    try {
      await deleteTask(taskId);
      try { await pluginHooks?.emit("task.deleted", { task: taskSnapshot }); } catch (err) { console.warn("[plugin-hook]", err); }
      refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
    } catch {
      onTasksChange(prevTasks);
      if (lastActionRef.current) clearTimeout(lastActionRef.current.timer);
      clearUndo();
      showStatus("Failed to delete task");
    }
  }, [selectedTask, tasks, onTasksChange, filteredTasksLength, startUndoTimer, refreshTasks, showStatus, setModal, setTaskIndex, setRangeSelectAnchor, lastActionRef, clearUndo, pluginHooks]);

  const handleUpdateContent = useCallback(
    async (newContent: string, successMessage: string, failureMessage: string) => {
      if (!selectedTask) return;
      setModal("none");
      const taskId = selectedTask.id;
      const prevTasks = [...tasks];
      onTasksChange(tasks.map((t) => (t.id === taskId ? { ...t, content: newContent } : t)));
      showStatus(successMessage);
      try {
        await updateTask(taskId, { content: newContent });
        try { await pluginHooks?.emit("task.updated", { task: { ...selectedTask, content: newContent }, changes: { content: newContent } }); } catch (err) { console.warn("[plugin-hook]", err); }
        refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
      } catch {
        onTasksChange(prevTasks);
        showStatus(failureMessage);
      }
    },
    [selectedTask, tasks, onTasksChange, refreshTasks, showStatus, setModal, pluginHooks],
  );

  const handleEditTask = useCallback(
    (newContent: string) => handleUpdateContent(newContent, "Task updated!", "Failed to update task"),
    [handleUpdateContent],
  );

  const handleRenameTask = useCallback(
    (newContent: string) => handleUpdateContent(newContent, "Renamed!", "Failed to rename task"),
    [handleUpdateContent],
  );

  const handleBulkComplete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const count = ids.length;
    const prevTasks = [...tasks];
    const idsSet = new Set(ids);
    const completedTasks = tasks.filter((t) => idsSet.has(t.id));
    onTasksChange(tasks.filter((t) => !idsSet.has(t.id)));
    startUndoTimer({ type: "complete", taskIds: ids });
    setSelectedIds(new Set());
    setRangeSelectAnchor(null);
    setTaskIndex(0);
    showStatus(`${count} tasks completed! Press u to undo (10s)`);
    try {
      await Promise.all(ids.map((id) => closeTask(id)));
      if (pluginHooks) {
        for (const t of completedTasks) {
          try { await pluginHooks.emit("task.completed", { task: t }); } catch (err) { console.warn("[plugin-hook]", err); }
        }
      }
      refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
    } catch {
      onTasksChange(prevTasks);
      if (lastActionRef.current) clearTimeout(lastActionRef.current.timer);
      clearUndo();
      showStatus("Failed to complete some tasks");
    }
  }, [selectedIds, tasks, onTasksChange, startUndoTimer, refreshTasks, showStatus, setSelectedIds, setRangeSelectAnchor, setTaskIndex, lastActionRef, clearUndo, pluginHooks]);

  const handleBulkDeleteConfirm = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setModal("none");
    const ids = Array.from(selectedIds);
    const count = ids.length;
    const idsSet = new Set(ids);
    const deletedTasks = tasks.filter((t) => idsSet.has(t.id));
    const snapshots = ids.map((id) => {
      const t = tasks.find((task) => task.id === id);
      return {
        content: t?.content ?? "Untitled",
        description: t?.description,
        priority: t?.priority,
        due: t?.due,
        labels: t?.labels,
        project_id: t?.project_id,
      } as Partial<Task>;
    });
    const prevTasks = [...tasks];
    onTasksChange(tasks.filter((t) => !idsSet.has(t.id)));
    startUndoTimer({ type: "delete", taskIds: ids, previousState: snapshots });
    setSelectedIds(new Set());
    setRangeSelectAnchor(null);
    setTaskIndex(0);
    showStatus(`${count} tasks deleted! Press u to undo (10s)`);
    try {
      await Promise.all(ids.map((id) => deleteTask(id)));
      if (pluginHooks) {
        for (const t of deletedTasks) {
          try { await pluginHooks.emit("task.deleted", { task: t }); } catch (err) { console.warn("[plugin-hook]", err); }
        }
      }
      refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
    } catch {
      onTasksChange(prevTasks);
      if (lastActionRef.current) clearTimeout(lastActionRef.current.timer);
      clearUndo();
      showStatus("Failed to delete some tasks");
    }
  }, [selectedIds, tasks, onTasksChange, startUndoTimer, refreshTasks, showStatus, setModal, setSelectedIds, setRangeSelectAnchor, setTaskIndex, lastActionRef, clearUndo, pluginHooks]);

  const handleSetPriority = useCallback(
    async (priority: 1 | 2 | 3 | 4) => {
      const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : selectedTask ? [selectedTask.id] : [];
      if (targetIds.length === 0) return;
      const previousState = targetIds.map((id) => {
        const t = tasks.find((task) => task.id === id);
        return { priority: t?.priority, id };
      });
      const prevTasks = [...tasks];
      const targetSet = new Set(targetIds);
      onTasksChange(tasks.map((t) => (targetSet.has(t.id) ? { ...t, priority } : t)));
      startUndoTimer({ type: "priority", taskIds: targetIds, previousState });
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        setRangeSelectAnchor(null);
      }
      showStatus(`Priority set to p${priority}. Press u to undo (10s)`);
      try {
        await Promise.all(targetIds.map((id) => updateTask(id, { priority })));
        if (pluginHooks) {
          for (const id of targetIds) {
            const t = tasks.find((task) => task.id === id);
            if (t) {
              try { await pluginHooks.emit("task.updated", { task: { ...t, priority }, changes: { priority } }); } catch (err) { console.warn("[plugin-hook]", err); }
            }
          }
        }
        refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
      } catch {
        onTasksChange(prevTasks);
        if (lastActionRef.current) clearTimeout(lastActionRef.current.timer);
        clearUndo();
        showStatus("Failed to set priority");
      }
    },
    [selectedIds, selectedTask, tasks, onTasksChange, startUndoTimer, refreshTasks, showStatus, setSelectedIds, setRangeSelectAnchor, lastActionRef, clearUndo, pluginHooks],
  );

  const handleSetDueDate = useCallback(
    async (dueString: string) => {
      setModal("none");
      const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : selectedTask ? [selectedTask.id] : [];
      if (targetIds.length === 0) return;
      const isRemove = dueString.toLowerCase() === "none" || dueString.toLowerCase() === "clear";
      const prevTasks = [...tasks];
      const targetSet = new Set(targetIds);
      onTasksChange(tasks.map((t) => {
        if (!targetSet.has(t.id)) return t;
        if (isRemove) return { ...t, due: null };
        return { ...t, due: { ...t.due, date: t.due?.date ?? "", string: dueString, is_recurring: false } as Task["due"] };
      }));
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        setRangeSelectAnchor(null);
      }
      showStatus(isRemove ? "Due date removed!" : `Due date set to "${dueString}"!`);
      try {
        if (isRemove) {
          await Promise.all(targetIds.map((id) => updateTask(id, { due_string: "no date" })));
        } else {
          await Promise.all(targetIds.map((id) => updateTask(id, { due_string: dueString })));
        }
        if (pluginHooks) {
          const changes = isRemove ? { due_string: "no date" } : { due_string: dueString };
          for (const id of targetIds) {
            const t = tasks.find((task) => task.id === id);
            if (t) {
              try { await pluginHooks.emit("task.updated", { task: t, changes }); } catch (err) { console.warn("[plugin-hook]", err); }
            }
          }
        }
        refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
      } catch {
        onTasksChange(prevTasks);
        showStatus("Failed to set due date");
      }
    },
    [selectedIds, selectedTask, tasks, onTasksChange, refreshTasks, showStatus, setModal, setSelectedIds, setRangeSelectAnchor, pluginHooks],
  );

  const handleSetDeadline = useCallback(
    async (value: string) => {
      setModal("none");
      const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : selectedTask ? [selectedTask.id] : [];
      if (targetIds.length === 0) return;
      const isRemove = value.toLowerCase() === "none" || value.toLowerCase() === "clear" || value === "";
      if (!isRemove) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          showStatus("Invalid date format. Use YYYY-MM-DD.");
          return;
        }
        const parsed = new Date(value + "T00:00:00");
        if (isNaN(parsed.getTime())) {
          showStatus("Invalid date. Check month/day values.");
          return;
        }
      }
      const prevTasks = [...tasks];
      const targetSet = new Set(targetIds);
      onTasksChange(tasks.map((t) => {
        if (!targetSet.has(t.id)) return t;
        return { ...t, deadline: isRemove ? null : { date: value } };
      }));
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        setRangeSelectAnchor(null);
      }
      showStatus(isRemove ? "Deadline removed!" : `Deadline set to ${value}!`);
      try {
        await Promise.all(targetIds.map((id) => updateTask(id, { deadline_date: isRemove ? null : value })));
        if (pluginHooks) {
          const changes = { deadline_date: isRemove ? null : value };
          for (const id of targetIds) {
            const t = tasks.find((task) => task.id === id);
            if (t) {
              try { await pluginHooks.emit("task.updated", { task: t, changes }); } catch (err) { console.warn("[plugin-hook]", err); }
            }
          }
        }
        refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
      } catch {
        onTasksChange(prevTasks);
        showStatus("Failed to set deadline");
      }
    },
    [selectedIds, selectedTask, tasks, onTasksChange, refreshTasks, showStatus, setModal, setSelectedIds, setRangeSelectAnchor, pluginHooks],
  );

  const handleAddTask = useCallback(
    async (input: string) => {
      try {
        const parsed = parseQuickAdd(input);
        const params: CreateTaskParams = { content: parsed.content };
        if (parsed.priority) params.priority = parsed.priority;
        if (parsed.due_string) {
          params.due_string = parsed.due_string;
        } else if (filterView === "Today") {
          params.due_string = "today";
        }
        if (parsed.labels.length > 0) params.labels = parsed.labels;
        if (parsed.project_name) {
          const resolvedId = await resolveProjectName(parsed.project_name);
          if (resolvedId) params.project_id = resolvedId;
        } else if (filterProjectId) {
          params.project_id = filterProjectId;
        }
        const newTask = await createTask(params);
        try { await pluginHooks?.emit("task.created", { task: newTask }); } catch (err) { console.warn("[plugin-hook]", err); }
        showStatus("Task created! Keep typing or Esc to close");
        refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
      } catch {
        showStatus("Failed to create task");
      }
    },
    [refreshTasks, filterProjectId, filterView, showStatus, pluginHooks],
  );

  const handleCreateTaskFull = useCallback(
    async (params: CreateTaskParams) => {
      setModal("none");
      try {
        const newTask = await createTask(params);
        try { await pluginHooks?.emit("task.created", { task: newTask }); } catch (err) { console.warn("[plugin-hook]", err); }
        showStatus("Task created!");
        refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
      } catch {
        showStatus("Failed to create task");
      }
    },
    [refreshTasks, showStatus, setModal, pluginHooks],
  );

  const handleAddSubtask = useCallback(
    async (input: string) => {
      setModal("none");
      if (!selectedTask) return;
      try {
        const parsed = parseQuickAdd(input);
        const params: CreateTaskParams = {
          content: parsed.content,
          parent_id: selectedTask.id,
        };
        if (parsed.priority) params.priority = parsed.priority;
        if (parsed.due_string) params.due_string = parsed.due_string;
        if (parsed.labels.length > 0) params.labels = parsed.labels;
        const newTask = await createTask(params);
        try { await pluginHooks?.emit("task.created", { task: newTask }); } catch (err) { console.warn("[plugin-hook]", err); }
        showStatus("Subtask created!");
        refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
      } catch {
        showStatus("Failed to create subtask");
      }
    },
    [selectedTask, refreshTasks, showStatus, setModal, pluginHooks],
  );

  const handleMoveToProject = useCallback(
    async (projectId: string) => {
      setModal("none");
      const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : selectedTask ? [selectedTask.id] : [];
      if (targetIds.length === 0) return;
      const previousState = targetIds.map((id) => {
        const t = tasks.find((task) => task.id === id);
        return { project_id: t?.project_id };
      });
      const projectName = projects.find((p) => p.id === projectId)?.name ?? "project";
      const prevTasks = [...tasks];
      const targetSet = new Set(targetIds);
      onTasksChange(tasks.map((t) => (targetSet.has(t.id) ? { ...t, project_id: projectId } : t)));
      startUndoTimer({ type: "move", taskIds: targetIds, previousState });
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        setRangeSelectAnchor(null);
      }
      showStatus(`Moved to ${projectName}! Press u to undo (10s)`);
      try {
        await Promise.all(targetIds.map((id) => updateTask(id, { project_id: projectId })));
        if (pluginHooks) {
          for (const id of targetIds) {
            const t = tasks.find((task) => task.id === id);
            if (t) {
              try { await pluginHooks.emit("task.updated", { task: { ...t, project_id: projectId }, changes: { project_id: projectId } }); } catch (err) { console.warn("[plugin-hook]", err); }
            }
          }
        }
        refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
      } catch {
        onTasksChange(prevTasks);
        if (lastActionRef.current) clearTimeout(lastActionRef.current.timer);
        clearUndo();
        showStatus("Failed to move task");
      }
    },
    [selectedIds, selectedTask, tasks, projects, onTasksChange, startUndoTimer, refreshTasks, showStatus, setModal, setSelectedIds, setRangeSelectAnchor, lastActionRef, clearUndo, pluginHooks],
  );

  const handleLabelsSave = useCallback(
    async (newLabels: string[]) => {
      setModal("none");
      const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : selectedTask ? [selectedTask.id] : [];
      if (targetIds.length === 0) return;
      const prevTasks = [...tasks];
      const targetSet = new Set(targetIds);
      onTasksChange(tasks.map((t) => (targetSet.has(t.id) ? { ...t, labels: newLabels } : t)));
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        setRangeSelectAnchor(null);
      }
      showStatus(`Labels updated for ${targetIds.length} task(s)!`);
      try {
        await Promise.all(targetIds.map((id) => updateTask(id, { labels: newLabels })));
        if (pluginHooks) {
          for (const id of targetIds) {
            const t = tasks.find((task) => task.id === id);
            if (t) {
              try { await pluginHooks.emit("task.updated", { task: { ...t, labels: newLabels }, changes: { labels: newLabels } }); } catch (err) { console.warn("[plugin-hook]", err); }
            }
          }
        }
        refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
      } catch {
        onTasksChange(prevTasks);
        showStatus("Failed to update labels");
      }
    },
    [selectedIds, selectedTask, tasks, onTasksChange, refreshTasks, showStatus, setModal, setSelectedIds, setRangeSelectAnchor, pluginHooks],
  );

  const handleEditTaskFull = useCallback(
    async (params: UpdateTaskParams) => {
      if (!selectedTask) return;
      setModal("none");
      const taskId = selectedTask.id;
      const prevTasks = [...tasks];
      onTasksChange(tasks.map((t) => {
        if (t.id !== taskId) return t;
        const updated = { ...t };
        if (params.content !== undefined) updated.content = params.content;
        if (params.description !== undefined) updated.description = params.description;
        if (params.priority !== undefined) updated.priority = params.priority;
        if (params.labels !== undefined) updated.labels = params.labels;
        if (params.project_id !== undefined) updated.project_id = params.project_id;
        return updated;
      }));
      showStatus("Task updated!");
      try {
        await updateTask(taskId, params);
        try { await pluginHooks?.emit("task.updated", { task: selectedTask, changes: params }); } catch (err) { console.warn("[plugin-hook]", err); }
        refreshTasks().catch(() => { /* background refresh — failure is non-critical */ });
      } catch {
        onTasksChange(prevTasks);
        showStatus("Failed to update task");
      }
    },
    [selectedTask, tasks, onTasksChange, refreshTasks, showStatus, setModal, pluginHooks],
  );

  const handleDuplicateTask = useCallback(async () => {
    if (!selectedTask) return;
    try {
      const params: CreateTaskParams = {
        content: `Copy of ${selectedTask.content}`,
        priority: selectedTask.priority,
        labels: selectedTask.labels.length > 0 ? selectedTask.labels : undefined,
        project_id: selectedTask.project_id,
      };
      if (selectedTask.due) {
        params.due_string = selectedTask.due.string;
      }
      if (selectedTask.description) {
        params.description = selectedTask.description;
      }
      if (selectedTask.deadline) {
        params.deadline_date = selectedTask.deadline.date;
      }
      if (selectedTask.section_id) {
        params.section_id = selectedTask.section_id;
      }
      const newTask = await createTask(params);
      onTasksChange([...tasks, newTask]);
      try { await pluginHooks?.emit("task.created", { task: newTask }); } catch (err) { console.warn("[plugin-hook]", err); }
      showStatus("Task duplicated!");
      refreshTasks().catch(() => { /* background refresh -- failure is non-critical */ });
    } catch {
      showStatus("Failed to duplicate task");
    }
  }, [selectedTask, tasks, onTasksChange, refreshTasks, showStatus, pluginHooks]);

  return {
    handleCompleteTask,
    handleDeleteConfirm,
    handleEditTask,
    handleRenameTask,
    handleBulkComplete,
    handleBulkDeleteConfirm,
    handleSetPriority,
    handleSetDueDate,
    handleSetDeadline,
    handleAddTask,
    handleCreateTaskFull,
    handleAddSubtask,
    handleMoveToProject,
    handleLabelsSave,
    handleEditTaskFull,
    handleDuplicateTask,
  };
}
