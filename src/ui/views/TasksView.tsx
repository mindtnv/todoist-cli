import React from "react";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import type { Task, Project, Label, Section, CreateTaskParams } from "../../api/types.ts";
import { Sidebar } from "../components/Sidebar.tsx";
import type { SidebarItem } from "../components/Sidebar.tsx";
import { TaskList } from "../components/TaskList.tsx";
import { InputPrompt } from "../components/InputPrompt.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { HelpOverlay } from "../components/HelpOverlay.tsx";
import { SortMenu } from "../components/SortMenu.tsx";
import type { SortField } from "../components/SortMenu.tsx";
import { CommandPalette } from "../components/CommandPalette.tsx";
import type { Command } from "../components/CommandPalette.tsx";
import { createTask, closeTask, deleteTask, updateTask, reopenTask } from "../../api/tasks.ts";
import { getTasks } from "../../api/tasks.ts";
import { parseQuickAdd, resolveProjectName } from "../../utils/quick-add.ts";
import { openUrl } from "../../utils/open-url.ts";
import { ProjectPicker } from "../components/ProjectPicker.tsx";
import { LabelPicker } from "../components/LabelPicker.tsx";
import { EditTaskModal } from "../components/EditTaskModal.tsx";
import type { UpdateTaskParams } from "../../api/types.ts";

type Panel = "sidebar" | "tasks";
type Modal = "none" | "add" | "addSubtask" | "edit" | "delete" | "filter" | "search" | "help" | "sort" | "bulkDelete" | "command" | "due" | "deadline" | "move" | "label" | "editFull" | "createFull";

const PRIORITY_COLORS: Record<number, string> = {
  1: "white",
  2: "blue",
  3: "yellow",
  4: "red",
};

const PRIORITY_NAMES: Record<number, string> = {
  1: "Normal",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

interface TasksViewProps {
  tasks: Task[];
  projects: Project[];
  labels: Label[];
  sections?: Section[];
  onTasksChange: (tasks: Task[]) => void;
  onQuit: () => void;
  onOpenTask?: (task: Task) => void;
  onNavigate?: (view: string) => void;
  initialStatus?: string;
  onStatusClear?: () => void;
}

const sortLabels: Record<SortField, string> = {
  priority: "Priority",
  due: "Due date",
  name: "Name",
  project: "Project",
};

function sortTasks(tasks: Task[], field: SortField, direction: "asc" | "desc" = "asc"): Task[] {
  const sorted = [...tasks];
  sorted.sort((a, b) => {
    switch (field) {
      case "priority":
        return b.priority - a.priority;
      case "due": {
        const aDate = a.due?.date ?? "9999-99-99";
        const bDate = b.due?.date ?? "9999-99-99";
        return aDate.localeCompare(bDate);
      }
      case "name":
        return a.content.localeCompare(b.content);
      case "project":
        return a.project_id.localeCompare(b.project_id);
    }
  });
  if (direction === "desc") sorted.reverse();
  return sorted;
}

export function TasksView({ tasks, projects, labels, sections, onTasksChange, onQuit, onOpenTask, onNavigate, initialStatus, onStatusClear }: TasksViewProps) {
  const [activePanel, setActivePanel] = useState<Panel>("tasks");
  const [taskIndex, setTaskIndex] = useState(0);
  const [sidebarIndex, setSidebarIndex] = useState(0);
  const [modal, setModal] = useState<Modal>("none");
  const [filterLabel, setFilterLabel] = useState<string | undefined>();
  const [filterProjectId, setFilterProjectId] = useState<string | undefined>();
  const [filterView, setFilterView] = useState("Inbox");
  const [statusMessage, setStatusMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [rangeSelectAnchor, setRangeSelectAnchor] = useState<number | null>(null);
  const [apiFilteredTasks, setApiFilteredTasks] = useState<Task[] | null>(null);
  const [lastAction, setLastAction] = useState<{
    type: "complete" | "delete" | "move" | "priority";
    taskIds: string[];
    previousState?: Partial<Task>[];
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const lastActionRef = useRef(lastAction);
  useEffect(() => { lastActionRef.current = lastAction; }, [lastAction]);
  const [pendingQuit, setPendingQuit] = useState(false);
  const pendingQuitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Pick up status from parent (e.g. after detail view action)
  useEffect(() => {
    if (initialStatus) {
      setStatusMessage(initialStatus);
      onStatusClear?.();
    }
  }, [initialStatus, onStatusClear]);

  // Auto-clear status message after 3 seconds
  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  const baseTasks = useMemo(() => {
    if (filterView.startsWith("Filter: ") && apiFilteredTasks !== null) {
      return apiFilteredTasks;
    }
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return tasks.filter((t) => {
      if (filterProjectId) return t.project_id === filterProjectId;
      if (filterLabel) return t.labels.includes(filterLabel);
      if (filterView === "Today") {
        if (!t.due) return false;
        return t.due.date <= localDate;
      }
      if (filterView === "Upcoming") {
        return t.due !== null && t.due.date >= localDate;
      }
      const inboxProject = projects.find((p) => p.is_inbox_project);
      if (inboxProject) return t.project_id === inboxProject.id;
      return true;
    });
  }, [tasks, filterProjectId, filterLabel, filterView, projects, apiFilteredTasks]);

  const filteredTasks = useMemo(() => {
    let result = baseTasks;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t) =>
        t.content.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        t.labels.some((l) => l.toLowerCase().includes(q))
      );
    }
    return sortTasks(result, sortField, sortDirection);
  }, [baseTasks, searchQuery, sortField, sortDirection]);

  const selectedTask = filteredTasks[taskIndex];

  const refreshTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const newTasks = await getTasks();
      onTasksChange(newTasks);
    } catch {
      setStatusMessage("Failed to refresh tasks");
    } finally {
      setIsLoading(false);
    }
  }, [onTasksChange]);

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

  const startUndoTimer = useCallback(
    (action: { type: "complete" | "delete" | "move" | "priority"; taskIds: string[]; previousState?: Partial<Task>[] }) => {
      if (lastAction) clearTimeout(lastAction.timer);
      const timer = setTimeout(() => setLastAction(null), 10000);
      setLastAction({ ...action, timer });
    },
    [lastAction],
  );

  const handleUndo = useCallback(async () => {
    if (!lastAction) return;
    clearTimeout(lastAction.timer);
    try {
      if (lastAction.type === "complete") {
        setStatusMessage("Reopening task...");
        await Promise.all(lastAction.taskIds.map((id) => reopenTask(id)));
        setStatusMessage("Task reopened!");
        refreshTasks().catch(() => {});
      } else if (lastAction.type === "delete" && lastAction.previousState) {
        setStatusMessage("Recreating task...");
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
        setStatusMessage("Task recreated!");
        refreshTasks().catch(() => {});
      } else if (lastAction.type === "priority" && lastAction.previousState) {
        // Optimistic: revert priority locally
        const revertMap = new Map(lastAction.taskIds.map((id, i) => [id, lastAction.previousState![i]?.priority]));
        onTasksChange(tasks.map((t) => (revertMap.has(t.id) ? { ...t, priority: revertMap.get(t.id) ?? t.priority } : t)));
        setStatusMessage("Priority reverted!");
        Promise.all(
          lastAction.taskIds.map((id, i) =>
            updateTask(id, { priority: lastAction.previousState![i]?.priority })
          ),
        ).then(() => refreshTasks().catch(() => {})).catch(() => setStatusMessage("Undo failed"));
      } else if (lastAction.type === "move" && lastAction.previousState) {
        // Optimistic: revert project locally
        const revertMap = new Map(lastAction.taskIds.map((id, i) => [id, lastAction.previousState![i]?.project_id]));
        onTasksChange(tasks.map((t) => (revertMap.has(t.id) ? { ...t, project_id: revertMap.get(t.id) ?? t.project_id } : t)));
        setStatusMessage("Move reverted!");
        Promise.all(
          lastAction.taskIds.map((id, i) =>
            updateTask(id, { project_id: lastAction.previousState![i]?.project_id })
          ),
        ).then(() => refreshTasks().catch(() => {})).catch(() => setStatusMessage("Undo failed"));
      }
    } catch {
      setStatusMessage("Undo failed");
    }
    setLastAction(null);
  }, [lastAction, tasks, onTasksChange, refreshTasks]);

  const handleSidebarSelect = useCallback(
    (item: SidebarItem) => {
      setTaskIndex(0);
      setApiFilteredTasks(null);
      if (item.type === "builtin") {
        setFilterProjectId(undefined);
        setFilterLabel(undefined);
        setFilterView(item.label);
      } else if (item.type === "project") {
        setFilterLabel(undefined);
        setFilterView("");
        setFilterProjectId(item.id);
      } else if (item.type === "label") {
        setFilterProjectId(undefined);
        setFilterView("");
        const labelObj = labels.find((l) => l.id === item.id);
        setFilterLabel(labelObj?.name);
      }
      setActivePanel("tasks");
    },
    [labels],
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
        await createTask(params);
        setStatusMessage("Task created! Keep typing or Esc to close");
        refreshTasks().catch(() => {});
      } catch {
        setStatusMessage("Failed to create task");
      }
    },
    [refreshTasks, filterProjectId, filterView],
  );

  const handleCreateTaskFull = useCallback(
    async (params: CreateTaskParams) => {
      setModal("none");
      try {
        await createTask(params);
        setStatusMessage("Task created!");
        refreshTasks().catch(() => {});
      } catch {
        setStatusMessage("Failed to create task");
      }
    },
    [refreshTasks],
  );

  const renderQuickAddPreview = useCallback((value: string): React.ReactNode => {
    const parsed = parseQuickAdd(value);
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="gray">Content:  </Text>
          <Text>{parsed.content || "(empty)"}</Text>
        </Box>
        {parsed.due_string && (
          <Box>
            <Text color="gray">Due:      </Text>
            <Text color="green">{parsed.due_string}</Text>
          </Box>
        )}
        {parsed.priority && (
          <Box>
            <Text color="gray">Priority: </Text>
            <Text color={PRIORITY_COLORS[parsed.priority] ?? "white"}>
              {parsed.priority}: {PRIORITY_NAMES[parsed.priority] ?? ""}
            </Text>
          </Box>
        )}
        {parsed.project_name && (
          <Box>
            <Text color="gray">Project:  </Text>
            <Text color="cyan">#{parsed.project_name}</Text>
          </Box>
        )}
        {!parsed.project_name && filterProjectId && (
          <Box>
            <Text color="gray">Project:  </Text>
            <Text color="cyan">{projects.find((p) => p.id === filterProjectId)?.name ?? "Current"} (default)</Text>
          </Box>
        )}
        {parsed.labels.length > 0 && (
          <Box>
            <Text color="gray">Labels:   </Text>
            <Text color="magenta">{parsed.labels.map((l) => `@${l}`).join(" ")}</Text>
          </Box>
        )}
      </Box>
    );
  }, [filterProjectId, projects]);

  const handleCompleteTask = useCallback(async () => {
    if (!selectedTask) return;
    const taskId = selectedTask.id;
    const prevTasks = [...tasks];
    // Optimistic: remove task from list instantly
    onTasksChange(tasks.filter((t) => t.id !== taskId));
    setTaskIndex((i) => Math.min(i, Math.max(filteredTasks.length - 2, 0)));
    startUndoTimer({ type: "complete", taskIds: [taskId] });
    setStatusMessage("Task completed! Press u to undo (10s)");
    try {
      await closeTask(taskId);
      refreshTasks().catch(() => {});
    } catch {
      onTasksChange(prevTasks);
      if (lastActionRef.current) clearTimeout(lastActionRef.current.timer);
      setLastAction(null);
      setStatusMessage("Failed to complete task");
    }
  }, [selectedTask, tasks, onTasksChange, filteredTasks.length, startUndoTimer, refreshTasks]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedTask) return;
    setModal("none");
    const taskId = selectedTask.id;
    const snapshot: Partial<Task> = {
      content: selectedTask.content,
      description: selectedTask.description,
      priority: selectedTask.priority,
      due: selectedTask.due,
      labels: selectedTask.labels,
      project_id: selectedTask.project_id,
    };
    const prevTasks = [...tasks];
    // Optimistic: remove task from list instantly
    onTasksChange(tasks.filter((t) => t.id !== taskId));
    setTaskIndex((i) => Math.min(i, Math.max(filteredTasks.length - 2, 0)));
    startUndoTimer({ type: "delete", taskIds: [taskId], previousState: [snapshot] });
    setStatusMessage("Task deleted! Press u to undo (10s)");
    try {
      await deleteTask(taskId);
      refreshTasks().catch(() => {});
    } catch {
      onTasksChange(prevTasks);
      if (lastActionRef.current) clearTimeout(lastActionRef.current.timer);
      setLastAction(null);
      setStatusMessage("Failed to delete task");
    }
  }, [selectedTask, tasks, onTasksChange, filteredTasks.length, startUndoTimer, refreshTasks]);

  const handleEditTask = useCallback(
    async (newContent: string) => {
      if (!selectedTask) return;
      setModal("none");
      const taskId = selectedTask.id;
      const prevTasks = [...tasks];
      // Optimistic: update content instantly
      onTasksChange(tasks.map((t) => (t.id === taskId ? { ...t, content: newContent } : t)));
      setStatusMessage("Task updated!");
      try {
        await updateTask(taskId, { content: newContent });
        refreshTasks().catch(() => {});
      } catch {
        onTasksChange(prevTasks);
        setStatusMessage("Failed to update task");
      }
    },
    [selectedTask, tasks, onTasksChange, refreshTasks],
  );

  const handleBulkComplete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const count = ids.length;
    const prevTasks = [...tasks];
    const idsSet = new Set(ids);
    // Optimistic: remove all selected tasks instantly
    onTasksChange(tasks.filter((t) => !idsSet.has(t.id)));
    startUndoTimer({ type: "complete", taskIds: ids });
    setSelectedIds(new Set());
    setRangeSelectAnchor(null);
    setTaskIndex(0);
    setStatusMessage(`${count} tasks completed! Press u to undo (10s)`);
    try {
      await Promise.all(ids.map((id) => closeTask(id)));
      refreshTasks().catch(() => {});
    } catch {
      onTasksChange(prevTasks);
      if (lastActionRef.current) clearTimeout(lastActionRef.current.timer);
      setLastAction(null);
      setStatusMessage("Failed to complete some tasks");
    }
  }, [selectedIds, tasks, onTasksChange, startUndoTimer, refreshTasks]);

  const handleBulkDeleteConfirm = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setModal("none");
    const ids = Array.from(selectedIds);
    const count = ids.length;
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
    const idsSet = new Set(ids);
    // Optimistic: remove all selected tasks instantly
    onTasksChange(tasks.filter((t) => !idsSet.has(t.id)));
    startUndoTimer({ type: "delete", taskIds: ids, previousState: snapshots });
    setSelectedIds(new Set());
    setRangeSelectAnchor(null);
    setTaskIndex(0);
    setStatusMessage(`${count} tasks deleted! Press u to undo (10s)`);
    try {
      await Promise.all(ids.map((id) => deleteTask(id)));
      refreshTasks().catch(() => {});
    } catch {
      onTasksChange(prevTasks);
      if (lastActionRef.current) clearTimeout(lastActionRef.current.timer);
      setLastAction(null);
      setStatusMessage("Failed to delete some tasks");
    }
  }, [selectedIds, tasks, onTasksChange, startUndoTimer, refreshTasks]);

  const handleFilterInput = useCallback(
    async (query: string) => {
      setModal("none");
      try {
        setStatusMessage(`Filtering: ${query}`);
        const filtered = await getTasks({ filter: query });
        setApiFilteredTasks(filtered);
        setFilterView(`Filter: ${query}`);
        setFilterProjectId(undefined);
        setFilterLabel(undefined);
        setTaskIndex(0);
      } catch {
        setStatusMessage("Invalid filter");
      }
    },
    [],
  );

  const handleSearchSubmit = useCallback(
    (_value: string) => {
      setModal("none");
    },
    [],
  );

  const handleSearchCancel = useCallback(() => {
    setSearchQuery("");
    setModal("none");
  }, []);

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
      // Optimistic: update priority instantly
      onTasksChange(tasks.map((t) => (targetSet.has(t.id) ? { ...t, priority } : t)));
      startUndoTimer({ type: "priority", taskIds: targetIds, previousState });
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        setRangeSelectAnchor(null);
      }
      setStatusMessage(`Priority set to p${priority}. Press u to undo (10s)`);
      try {
        await Promise.all(targetIds.map((id) => updateTask(id, { priority })));
        refreshTasks().catch(() => {});
      } catch {
        onTasksChange(prevTasks);
        if (lastActionRef.current) clearTimeout(lastActionRef.current.timer);
        setLastAction(null);
        setStatusMessage("Failed to set priority");
      }
    },
    [selectedIds, selectedTask, tasks, onTasksChange, startUndoTimer, refreshTasks],
  );

  const handleSetDueDate = useCallback(
    async (dueString: string) => {
      setModal("none");
      const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : selectedTask ? [selectedTask.id] : [];
      if (targetIds.length === 0) return;
      const isRemove = dueString.toLowerCase() === "none" || dueString.toLowerCase() === "clear";
      const prevTasks = [...tasks];
      const targetSet = new Set(targetIds);
      // Optimistic: update due field instantly
      onTasksChange(tasks.map((t) => {
        if (!targetSet.has(t.id)) return t;
        if (isRemove) return { ...t, due: null };
        return { ...t, due: { ...t.due, date: t.due?.date ?? "", string: dueString, is_recurring: false } as Task["due"] };
      }));
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        setRangeSelectAnchor(null);
      }
      setStatusMessage(isRemove ? "Due date removed!" : `Due date set to "${dueString}"!`);
      try {
        if (isRemove) {
          await Promise.all(targetIds.map((id) => updateTask(id, { due_string: "no date" })));
        } else {
          await Promise.all(targetIds.map((id) => updateTask(id, { due_string: dueString })));
        }
        // Refresh to get proper parsed due date from API
        refreshTasks().catch(() => {});
      } catch {
        onTasksChange(prevTasks);
        setStatusMessage("Failed to set due date");
      }
    },
    [selectedIds, selectedTask, tasks, onTasksChange, refreshTasks],
  );

  const handleSetDeadline = useCallback(
    async (value: string) => {
      setModal("none");
      const targetIds = selectedIds.size > 0 ? Array.from(selectedIds) : selectedTask ? [selectedTask.id] : [];
      if (targetIds.length === 0) return;
      const isRemove = value.toLowerCase() === "none" || value.toLowerCase() === "clear" || value === "";
      if (!isRemove && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        setStatusMessage("Invalid date format. Use YYYY-MM-DD.");
        return;
      }
      const prevTasks = [...tasks];
      const targetSet = new Set(targetIds);
      // Optimistic: update deadline field instantly
      onTasksChange(tasks.map((t) => {
        if (!targetSet.has(t.id)) return t;
        return { ...t, deadline: isRemove ? null : { date: value } };
      }));
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        setRangeSelectAnchor(null);
      }
      setStatusMessage(isRemove ? "Deadline removed!" : `Deadline set to ${value}!`);
      try {
        await Promise.all(targetIds.map((id) => updateTask(id, { deadline_date: isRemove ? null : value } as any)));
        refreshTasks().catch(() => {});
      } catch {
        onTasksChange(prevTasks);
        setStatusMessage("Failed to set deadline");
      }
    },
    [selectedIds, selectedTask, tasks, onTasksChange, refreshTasks],
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
        await createTask(params);
        setStatusMessage("Subtask created!");
        refreshTasks().catch(() => {});
      } catch {
        setStatusMessage("Failed to create subtask");
      }
    },
    [selectedTask, refreshTasks],
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
      // Optimistic: update project_id instantly
      onTasksChange(tasks.map((t) => (targetSet.has(t.id) ? { ...t, project_id: projectId } : t)));
      startUndoTimer({ type: "move", taskIds: targetIds, previousState });
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        setRangeSelectAnchor(null);
      }
      setStatusMessage(`Moved to ${projectName}! Press u to undo (10s)`);
      try {
        await Promise.all(targetIds.map((id) => updateTask(id, { project_id: projectId })));
        refreshTasks().catch(() => {});
      } catch {
        onTasksChange(prevTasks);
        if (lastActionRef.current) clearTimeout(lastActionRef.current.timer);
        setLastAction(null);
        setStatusMessage("Failed to move task");
      }
    },
    [selectedIds, selectedTask, tasks, projects, onTasksChange, startUndoTimer, refreshTasks],
  );

  const handleLabelsSave = useCallback(
    async (newLabels: string[]) => {
      setModal("none");
      if (!selectedTask) return;
      const taskId = selectedTask.id;
      const prevTasks = [...tasks];
      // Optimistic: update labels instantly
      onTasksChange(tasks.map((t) => (t.id === taskId ? { ...t, labels: newLabels } : t)));
      setStatusMessage("Labels updated!");
      try {
        await updateTask(taskId, { labels: newLabels });
        refreshTasks().catch(() => {});
      } catch {
        onTasksChange(prevTasks);
        setStatusMessage("Failed to update labels");
      }
    },
    [selectedTask, tasks, onTasksChange, refreshTasks],
  );

  const handleEditTaskFull = useCallback(
    async (params: UpdateTaskParams) => {
      if (!selectedTask) return;
      setModal("none");
      const taskId = selectedTask.id;
      const prevTasks = [...tasks];
      // Optimistic: apply all changed fields instantly
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
      setStatusMessage("Task updated!");
      try {
        await updateTask(taskId, params);
        refreshTasks().catch(() => {});
      } catch {
        onTasksChange(prevTasks);
        setStatusMessage("Failed to update task");
      }
    },
    [selectedTask, tasks, onTasksChange, refreshTasks],
  );

  const handleOpenInBrowser = useCallback(() => {
    if (!selectedTask) return;
    try {
      openUrl(selectedTask.url);
      setStatusMessage("Opened in browser");
    } catch {
      setStatusMessage("Failed to open in browser");
    }
  }, [selectedTask]);

  const handleSortSelect = useCallback((field: SortField) => {
    if (field === sortField) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setModal("none");
    setTaskIndex(0);
  }, [sortField]);

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
      setStatusMessage("Range select started. Move cursor then press v again.");
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
    setStatusMessage(`${end - start + 1} tasks selected`);
  }, [rangeSelectAnchor, taskIndex, filteredTasks, selectedTask]);

  // Build command palette commands
  const commands = useMemo((): Command[] => {
    const cmds: Command[] = [
      { name: "add", description: "Add a new task", action: () => setModal("add") },
      { name: "search", description: "Search tasks", action: () => setModal("search") },
      { name: "filter", description: "API filter query", action: () => setModal("filter") },
      { name: "sort", description: "Change sort order", action: () => setModal("sort") },
      { name: "refresh", description: "Refresh task list", action: () => { refreshTasks(); setStatusMessage("Refreshing..."); setModal("none"); } },
      { name: "help", description: "Show keyboard shortcuts", action: () => setModal("help") },
      { name: "quit", description: "Exit application", action: () => { setModal("none"); onQuit(); } },
    ];
    if (selectedTask) {
      cmds.push(
        { name: "edit", description: `Edit "${selectedTask.content}"`, action: () => { setModal("editFull"); } },
        { name: "complete", description: `Complete "${selectedTask.content}"`, action: () => { setModal("none"); handleCompleteTask(); } },
        { name: "delete", description: `Delete "${selectedTask.content}"`, action: () => { setModal("none"); setModal("delete"); } },
        { name: "open", description: `Open "${selectedTask.content}" detail`, action: () => { setModal("none"); onOpenTask?.(selectedTask); } },
        { name: "due", description: `Set due date for "${selectedTask.content}"`, action: () => { setModal("due"); } },
        { name: "deadline", description: `Set deadline for "${selectedTask.content}"`, action: () => { setModal("deadline"); } },
        { name: "move", description: `Move "${selectedTask.content}" to project`, action: () => { setModal("move"); } },
        { name: "labels", description: `Edit labels for "${selectedTask.content}"`, action: () => { setModal("label"); } },
        { name: "subtask", description: `Add subtask to "${selectedTask.content}"`, action: () => { setModal("addSubtask"); } },
        { name: "browser", description: `Open "${selectedTask.content}" in browser`, action: () => { setModal("none"); handleOpenInBrowser(); } },
      );
    }
    if (selectedIds.size > 0) {
      cmds.push(
        { name: "complete-selected", description: `Complete ${selectedIds.size} selected tasks`, action: () => { setModal("none"); handleBulkComplete(); } },
        { name: "delete-selected", description: `Delete ${selectedIds.size} selected tasks`, action: () => { setModal("none"); setModal("bulkDelete"); } },
        { name: "clear-selection", description: "Clear all selections", action: () => { setSelectedIds(new Set()); setRangeSelectAnchor(null); setModal("none"); } },
      );
    }
    // View commands
    cmds.push(
      { name: "inbox", description: "Show Inbox", action: () => { setFilterProjectId(undefined); setFilterLabel(undefined); setFilterView("Inbox"); setTaskIndex(0); setModal("none"); } },
      { name: "today", description: "Show Today", action: () => { setFilterProjectId(undefined); setFilterLabel(undefined); setFilterView("Today"); setTaskIndex(0); setModal("none"); } },
      { name: "upcoming", description: "Show Upcoming", action: () => { setFilterProjectId(undefined); setFilterLabel(undefined); setFilterView("Upcoming"); setTaskIndex(0); setModal("none"); } },
    );
    // Dashboard views
    if (onNavigate) {
      cmds.push(
        { name: "stats", description: "Productivity stats dashboard", action: () => { setModal("none"); onNavigate("stats"); } },
        { name: "completed", description: "View completed tasks", action: () => { setModal("none"); onNavigate("completed"); } },
        { name: "activity", description: "Activity log", action: () => { setModal("none"); onNavigate("activity"); } },
        { name: "log", description: "Activity log (alias)", action: () => { setModal("none"); onNavigate("activity"); } },
      );
    }
    // Project commands
    for (const p of projects) {
      if (!p.is_inbox_project) {
        cmds.push({
          name: `project:${p.name}`,
          description: `Switch to project ${p.name}`,
          action: () => { setFilterLabel(undefined); setFilterView(""); setFilterProjectId(p.id); setTaskIndex(0); setModal("none"); },
        });
      }
    }
    return cmds;
  }, [selectedTask, selectedIds, projects, refreshTasks, onQuit, onOpenTask, onNavigate, handleCompleteTask, handleBulkComplete]);

  useInput((input, key) => {
    if (modal === "search" || modal === "command") {
      // Input handled by respective components
      return;
    }
    if (modal !== "none") return;

    if (key.tab) {
      setActivePanel((p) => (p === "sidebar" ? "tasks" : "sidebar"));
      return;
    }
    if (input === "q") {
      if (selectedIds.size > 0 && !pendingQuit) {
        setPendingQuit(true);
        setStatusMessage("Press q again to quit (selections will be lost)");
        if (pendingQuitTimerRef.current) clearTimeout(pendingQuitTimerRef.current);
        pendingQuitTimerRef.current = setTimeout(() => setPendingQuit(false), 2000);
        return;
      }
      if (pendingQuitTimerRef.current) clearTimeout(pendingQuitTimerRef.current);
      onQuit();
      return;
    }
    if (activePanel === "tasks") {
      // Reset pending quit on any non-q key
      if (input !== "q" && pendingQuit) {
        setPendingQuit(false);
        if (pendingQuitTimerRef.current) clearTimeout(pendingQuitTimerRef.current);
      }
      if (key.escape) {
        if (rangeSelectAnchor !== null) {
          setRangeSelectAnchor(null);
          setStatusMessage("");
          return;
        }
        if (selectedIds.size > 0) {
          setSelectedIds(new Set());
          setStatusMessage("");
          return;
        }
        if (searchQuery) {
          setSearchQuery("");
          setStatusMessage("");
          return;
        }
        if (apiFilteredTasks !== null) {
          setApiFilteredTasks(null);
          setFilterView("Inbox");
          setTaskIndex(0);
          setStatusMessage("");
          return;
        }
        return;
      }
      // Ctrl-a: select all visible tasks
      if (key.ctrl && input === "a") {
        const allIds = new Set(filteredTasks.map((t) => t.id));
        setSelectedIds(allIds);
        setStatusMessage(`${allIds.size} tasks selected`);
        return;
      }
      // Ctrl-n: clear all selection
      if (key.ctrl && input === "n") {
        setSelectedIds(new Set());
        setRangeSelectAnchor(null);
        setStatusMessage("");
        return;
      }
      if (input === " ") {
        toggleSelection();
        return;
      }
      if (input === "v") {
        handleRangeSelect();
        return;
      }
      if (key.return && selectedTask && onOpenTask) {
        onOpenTask(selectedTask);
        return;
      }
      // Priority keys 1-4
      if (input === "1" || input === "2" || input === "3" || input === "4") {
        handleSetPriority(Number(input) as 1 | 2 | 3 | 4);
        return;
      }
      // Undo
      if (input === "u") {
        handleUndo();
        return;
      }
      if (input === "a") {
        setModal("add");
      } else if (input === "N") {
        setModal("createFull");
      } else if (input === "A") {
        if (selectedTask) {
          setModal("addSubtask");
        }
      } else if (input === "c") {
        if (selectedIds.size > 0) {
          handleBulkComplete();
        } else if (selectedTask) {
          handleCompleteTask();
        }
      } else if (input === "d") {
        if (selectedIds.size > 0) {
          setModal("bulkDelete");
        } else if (selectedTask) {
          setModal("delete");
        }
      } else if (input === "D") {
        if (selectedTask || selectedIds.size > 0) {
          setModal("deadline");
        }
      } else if (input === "t") {
        if (selectedTask || selectedIds.size > 0) {
          setModal("due");
        }
      } else if (input === "m") {
        if (selectedTask || selectedIds.size > 0) {
          setModal("move");
        }
      } else if (input === "l") {
        if (selectedTask) {
          setModal("label");
        }
      } else if (input === "o") {
        handleOpenInBrowser();
      } else if (input === "/") {
        setModal("search");
      } else if (input === "f") {
        setModal("filter");
      } else if (input === "s") {
        setModal("sort");
      } else if (input === "?") {
        setModal("help");
      } else if (input === ":") {
        setModal("command");
      } else if (input === "e") {
        if (selectedTask) {
          setModal("editFull");
        }
      } else if (input === "r") {
        refreshTasks();
        setStatusMessage("Refreshing...");
      } else if (input === "!") {
        setFilterProjectId(undefined);
        setFilterLabel(undefined);
        setFilterView("Inbox");
        setApiFilteredTasks(null);
        setTaskIndex(0);
      } else if (input === "@") {
        setFilterProjectId(undefined);
        setFilterLabel(undefined);
        setFilterView("Today");
        setApiFilteredTasks(null);
        setTaskIndex(0);
      } else if (input === "#") {
        setFilterProjectId(undefined);
        setFilterLabel(undefined);
        setFilterView("Upcoming");
        setApiFilteredTasks(null);
        setTaskIndex(0);
      }
    }
  });

  const currentViewLabel =
    filterProjectId
      ? projects.find((p) => p.id === filterProjectId)?.name ?? "Project"
      : filterLabel
        ? `@${filterLabel}`
        : filterView;

  const hasSelection = selectedIds.size > 0;
  const isSearching = modal === "search" || searchQuery !== "";
  const isRangeSelecting = rangeSelectAnchor !== null;

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="row" flexGrow={1}>
        <Sidebar
          projects={projects}
          labels={labels}
          tasks={tasks}
          activeProjectId={filterProjectId}
          selectedIndex={sidebarIndex}
          isFocused={activePanel === "sidebar"}
          onSelect={handleSidebarSelect}
          onIndexChange={setSidebarIndex}
          onNavigate={onNavigate ? (viewName: string) => {
            onNavigate(viewName);
          } : undefined}
        />
        <Box flexDirection="column" flexGrow={1}>
          <Box paddingX={1} justifyContent="space-between">
            <Box>
              <Text bold color="white">{currentViewLabel}</Text>
              <Text color="gray">{` | Sort: ${sortLabels[sortField]} ${sortDirection === "asc" ? "\u2191" : "\u2193"}`}</Text>
            </Box>
            {searchQuery && (
              <Text color="cyan">
                Search: "{searchQuery}" ({filteredTasks.length} of {baseTasks.length} tasks)
              </Text>
            )}
          </Box>
          {filteredTasks.length === 0 && apiFilteredTasks !== null ? (
            <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={activePanel === "tasks" ? "blue" : "gray"} paddingX={1} justifyContent="center" alignItems="center">
              <Text color="gray">No tasks match filter. Press Esc to clear.</Text>
            </Box>
          ) : (
            <TaskList
              tasks={filteredTasks}
              selectedIndex={taskIndex}
              isFocused={activePanel === "tasks"}
              onIndexChange={setTaskIndex}
              selectedIds={selectedIds}
            />
          )}
        </Box>
      </Box>

      {modal === "add" && (
        <InputPrompt
          prompt="New task"
          placeholder="Buy milk tomorrow #Shopping p1 @errands"
          onSubmit={handleAddTask}
          onCancel={() => setModal("none")}
          onCtrlE={() => setModal("createFull")}
          onPreview={renderQuickAddPreview}
          footer={
            <Text color="gray" dimColor>
              [Enter] create & continue  [Ctrl-E] full editor  [Esc] close
            </Text>
          }
        />
      )}
      {modal === "createFull" && (
        <EditTaskModal
          projects={projects}
          labels={labels}
          onSave={() => {}}
          onCreate={handleCreateTaskFull}
          onCancel={() => setModal("none")}
          defaultProjectId={filterProjectId}
          defaultDue={filterView === "Today" ? "today" : undefined}
        />
      )}
      {modal === "addSubtask" && selectedTask && (
        <InputPrompt
          prompt={`Subtask of "${selectedTask.content}"`}
          onSubmit={handleAddSubtask}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "edit" && selectedTask && (
        <InputPrompt
          prompt="Edit task"
          defaultValue={selectedTask.content}
          onSubmit={handleEditTask}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "editFull" && selectedTask && (
        <EditTaskModal
          task={selectedTask}
          projects={projects}
          labels={labels}
          onSave={handleEditTaskFull}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "due" && (
        <InputPrompt
          prompt="Due date"
          onSubmit={handleSetDueDate}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "deadline" && (
        <InputPrompt
          prompt="Deadline (YYYY-MM-DD)"
          onSubmit={handleSetDeadline}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "move" && (
        <ProjectPicker
          projects={projects}
          onSelect={handleMoveToProject}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "label" && selectedTask && (
        <LabelPicker
          labels={labels}
          currentLabels={selectedTask.labels}
          onSave={handleLabelsSave}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "delete" && selectedTask && (
        <ConfirmDialog
          message={`Delete "${selectedTask.content}"?`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "bulkDelete" && (
        <ConfirmDialog
          message={`Delete ${selectedIds.size} selected tasks?`}
          onConfirm={handleBulkDeleteConfirm}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "filter" && (
        <InputPrompt
          prompt="Filter"
          onSubmit={handleFilterInput}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "search" && (
        <InputPrompt
          prompt="Search"
          defaultValue={searchQuery}
          onSubmit={(val) => {
            setSearchQuery(val);
            handleSearchSubmit(val);
          }}
          onCancel={handleSearchCancel}
        />
      )}
      {modal === "help" && (
        <HelpOverlay onClose={() => setModal("none")} />
      )}
      {modal === "sort" && (
        <SortMenu
          currentSort={sortField}
          onSelect={handleSortSelect}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "command" && (
        <CommandPalette
          commands={commands}
          onCancel={() => setModal("none")}
        />
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
        <Text>
          {modal === "command" ? (
            <>
              <Text color="gray">[Esc]</Text><Text> cancel  </Text>
              <Text color="gray">[Enter]</Text><Text> execute  </Text>
              <Text color="gray">[Up/Down]</Text><Text> navigate</Text>
            </>
          ) : isSearching ? (
            <>
              <Text color="gray">[Esc]</Text><Text> cancel  </Text>
              <Text color="gray">[Enter]</Text><Text> confirm</Text>
            </>
          ) : isRangeSelecting ? (
            <>
              <Text color="cyan">[v]</Text><Text> end range  </Text>
              <Text color="gray">[j/k]</Text><Text> move  </Text>
              <Text color="gray">[Esc]</Text><Text> cancel range</Text>
            </>
          ) : hasSelection ? (
            <>
              <Text color="yellow">[c]</Text><Text>omplete </Text>
              <Text color="red">[d]</Text><Text>elete </Text>
              <Text color="cyan">[1-4]</Text><Text>prio </Text>
              <Text color="green">[t]</Text><Text>due </Text>
              <Text color="blue">[m]</Text><Text>ove </Text>
              <Text color="cyan">[v]</Text><Text> range </Text>
              <Text color="gray">[Esc]</Text><Text> clear  </Text>
              <Text color="magenta">({selectedIds.size} selected)</Text>
            </>
          ) : (
            <>
              <Text color="green">[a]</Text><Text>dd </Text>
              <Text color="green">[N]</Text><Text>ew </Text>
              <Text color="blue">[e]</Text><Text>dit </Text>
              <Text color="yellow">[c]</Text><Text>omplete </Text>
              <Text color="red">[d]</Text><Text>elete </Text>
              <Text color="cyan">[1-4]</Text><Text>prio </Text>
              <Text color="green">[t]</Text><Text>due </Text>
              <Text color="blue">[m]</Text><Text>ove </Text>
              <Text color="magenta">[l]</Text><Text>abel </Text>
              <Text color="cyan">[/]</Text><Text>search </Text>
              <Text color="white">[?]</Text><Text>help </Text>
              <Text color="gray">[q]</Text><Text>uit</Text>
            </>
          )}
        </Text>
        {undoCountdown > 0 && lastAction ? (
          <Text color="green">[u]ndo ({undoCountdown}s)</Text>
        ) : statusMessage ? (
          <Text color="yellow">{statusMessage}</Text>
        ) : isLoading ? (
          <Text color="cyan" dimColor>Syncing...</Text>
        ) : null}
      </Box>
    </Box>
  );
}
