import React from "react";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import type { Task, Project, Label, Section } from "../../api/types.ts";
import { Sidebar } from "../components/Sidebar.tsx";
import type { SidebarItem } from "../components/Sidebar.tsx";
import { TaskList } from "../components/TaskList.tsx";
import type { SortField } from "../components/SortMenu.tsx";
import type { Command } from "../components/CommandPalette.tsx";
import { sortTasks } from "../../utils/sorting.ts";
import { getTasks, createTask } from "../../api/tasks.ts";
import { parseQuickAdd } from "../../utils/quick-add.ts";
import { openUrl } from "../../utils/open-url.ts";
import { getTemplates } from "../../config/index.ts";
import { createProject } from "../../api/projects.ts";
import { createLabel } from "../../api/labels.ts";
import { getProjects } from "../../api/projects.ts";
import { getLabels } from "../../api/labels.ts";
import { Breadcrumb } from "../components/Breadcrumb.tsx";
import { PRIORITY_COLORS, PRIORITY_LABELS } from "../constants.ts";
import { ModalManager } from "../components/ModalManager.tsx";
import type { Modal } from "../components/ModalManager.tsx";
import type { ExtensionRegistry, PaletteRegistry, ViewRegistry, PluginContext, HookRegistry } from "../../plugins/types.ts";
import { StatusBar } from "../components/StatusBar.tsx";
import { useStatusMessage } from "../hooks/useStatusMessage.ts";
import { useUndoSystem } from "../hooks/useUndoSystem.ts";
import { useTaskOperations } from "../hooks/useTaskOperations.ts";
import { useKeyboardHandler } from "../hooks/useKeyboardHandler.ts";

type Panel = "sidebar" | "tasks";

const PRIORITY_NAMES: Record<number, string> = {
  1: "Normal",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

export interface ListViewState {
  taskIndex: number;
  sidebarIndex: number;
  activePanel: Panel;
  filterView: string;
  filterProjectId?: string;
  filterSectionId?: string;
  filterLabel?: string;
  sortField: SortField;
  sortDirection: "asc" | "desc";
  searchQuery: string;
}

interface TasksViewProps {
  tasks: Task[];
  projects: Project[];
  labels: Label[];
  sections?: Section[];
  onTasksChange: (tasks: Task[]) => void;
  onProjectsChange?: (projects: Project[]) => void;
  onLabelsChange?: (labels: Label[]) => void;
  onQuit: () => void;
  onOpenTask?: (task: Task) => void;
  onNavigate?: (view: string) => void;
  initialStatus?: string;
  onStatusClear?: () => void;
  savedStateRef?: React.RefObject<ListViewState | null>;
  pluginExtensions?: ExtensionRegistry | null;
  pluginPalette?: PaletteRegistry | null;
  pluginViews?: ViewRegistry | null;
  pluginKeybindingContextMap?: Map<string, PluginContext>;
  pluginColumnContextMap?: Map<string, PluginContext>;
  pluginPaletteContextMap?: Map<string, PluginContext>;
  pluginStatusBarContextMap?: Map<string, PluginContext>;
  pluginHooks?: HookRegistry | null;
}

const sortLabels: Record<SortField, string> = {
  priority: "Priority",
  due: "Due date",
  date: "Due date",
  name: "Name",
  content: "Name",
  project: "Project",
};

export function TasksView({ tasks, projects, labels, sections, onTasksChange, onProjectsChange, onLabelsChange, onQuit, onOpenTask, onNavigate, initialStatus, onStatusClear, savedStateRef, pluginExtensions, pluginPalette, pluginViews, pluginKeybindingContextMap, pluginColumnContextMap, pluginPaletteContextMap, pluginStatusBarContextMap, pluginHooks }: TasksViewProps) {
  const saved = savedStateRef?.current;
  const [activePanel, setActivePanel] = useState<Panel>(saved?.activePanel ?? "tasks");
  const [taskIndex, setTaskIndex] = useState(saved?.taskIndex ?? 0);
  const [sidebarIndex, setSidebarIndex] = useState(saved?.sidebarIndex ?? 0);
  const [modal, setModal] = useState<Modal>("none");
  const [filterLabel, setFilterLabel] = useState<string | undefined>(saved?.filterLabel);
  const [filterProjectId, setFilterProjectId] = useState<string | undefined>(saved?.filterProjectId);
  const [filterSectionId, setFilterSectionId] = useState<string | undefined>(saved?.filterSectionId);
  const [filterView, setFilterView] = useState(saved?.filterView ?? "Inbox");
  const [searchQuery, setSearchQuery] = useState(saved?.searchQuery ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>(saved?.sortField ?? "priority");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(saved?.sortDirection ?? "asc");
  const [rangeSelectAnchor, setRangeSelectAnchor] = useState<number | null>(null);
  const [apiFilteredTasks, setApiFilteredTasks] = useState<Task[] | null>(null);
  const modalRef = useRef(modal);
  useEffect(() => { modalRef.current = modal; }, [modal]);
  const [pendingQuit, setPendingQuit] = useState(false);
  const pendingQuitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingPluginInput, setPendingPluginInput] = useState<{
    label: string;
    placeholder?: string;
    formatPreview?: (value: string) => string;
    execute: (input: string) => void;
  } | null>(null);

  // Persist navigational state to ref so it survives view switches
  useEffect(() => {
    if (savedStateRef) {
      savedStateRef.current = {
        taskIndex, sidebarIndex, activePanel, filterView,
        filterProjectId, filterSectionId, filterLabel,
        sortField, sortDirection, searchQuery,
      };
    }
  }, [taskIndex, sidebarIndex, activePanel, filterView, filterProjectId, filterSectionId, filterLabel, sortField, sortDirection, searchQuery, savedStateRef]);

  const { message: statusMessage, show: showStatus } = useStatusMessage({
    initialMessage: initialStatus,
    autoClearMs: 3000,
    onInitialClear: onStatusClear,
  });

  const baseTasks = useMemo(() => {
    if (filterView.startsWith("Filter: ") && apiFilteredTasks !== null) {
      return apiFilteredTasks;
    }
    const today = new Date();
    const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return tasks.filter((t) => {
      if (filterSectionId && filterProjectId) return t.project_id === filterProjectId && t.section_id === filterSectionId;
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
  }, [tasks, filterProjectId, filterSectionId, filterLabel, filterView, projects, apiFilteredTasks]);

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

  const breadcrumbSegments = useMemo(() => {
    const segments: Array<{ label: string; color?: string }> = [
      { label: "Todoist", color: "green" },
    ];
    if (filterProjectId) {
      segments.push({ label: "Projects", color: "gray" });
      segments.push({ label: projects.find((p) => p.id === filterProjectId)?.name ?? "Project", color: "cyan" });
      if (filterSectionId && sections) {
        const section = sections.find((s) => s.id === filterSectionId);
        if (section) {
          segments.push({ label: section.name, color: "cyan" });
        }
      }
    } else if (filterLabel) {
      segments.push({ label: `@${filterLabel}`, color: "magenta" });
    } else if (filterView.startsWith("Filter: ")) {
      segments.push({ label: filterView, color: "yellow" });
    } else {
      segments.push({ label: filterView || "Inbox" });
    }
    return segments;
  }, [filterProjectId, filterSectionId, filterLabel, filterView, projects, sections]);

  const selectedTask = filteredTasks[taskIndex];

  const refreshTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const newTasks = await getTasks();
      onTasksChange(newTasks);
    } catch {
      showStatus("Failed to refresh tasks");
    } finally {
      setIsLoading(false);
    }
  }, [onTasksChange, showStatus]);

  const { lastAction, lastActionRef, undoCountdown, startUndoTimer, handleUndo, clearUndo, lastRedo, redoCountdown, handleRedo } = useUndoSystem({
    tasks,
    onTasksChange,
    showStatus,
    refreshTasks,
  });

  const {
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
  } = useTaskOperations({
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
    setModal: setModal as React.Dispatch<React.SetStateAction<string>>,
    filteredTasksLength: filteredTasks.length,
    filterProjectId,
    filterView,
    projects,
    pluginHooks,
  });

  const handleSidebarSelect = useCallback(
    (item: SidebarItem) => {
      setTaskIndex(0);
      setApiFilteredTasks(null);
      if (item.type === "builtin") {
        setFilterProjectId(undefined);
        setFilterLabel(undefined);
        setFilterSectionId(undefined);
        setFilterView(item.label);
      } else if (item.type === "project") {
        setFilterLabel(undefined);
        setFilterSectionId(undefined);
        setFilterView("");
        setFilterProjectId(item.id);
      } else if (item.type === "label") {
        setFilterProjectId(undefined);
        setFilterSectionId(undefined);
        setFilterView("");
        const labelObj = labels.find((l) => l.id === item.id);
        setFilterLabel(labelObj?.name);
      } else if (item.type === "section") {
        const sectionId = item.id.replace("section-", "");
        setFilterLabel(undefined);
        setFilterView("");
        setFilterSectionId(sectionId);
        // Keep the current filterProjectId
      }
      setActivePanel("tasks");
    },
    [labels],
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

  const handleFilterInput = useCallback(
    async (query: string) => {
      setModal("none");
      try {
        showStatus(`Filtering: ${query}`);
        const filtered = await getTasks({ filter: query });
        setApiFilteredTasks(filtered);
        setFilterView(`Filter: ${query}`);
        setFilterProjectId(undefined);
        setFilterLabel(undefined);
        setTaskIndex(0);
      } catch {
        showStatus("Invalid filter");
      }
    },
    [showStatus],
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

  const handleOpenInBrowser = useCallback(() => {
    if (!selectedTask) return;
    try {
      openUrl(selectedTask.url);
      showStatus("Opened in browser");
    } catch {
      showStatus("Failed to open in browser");
    }
  }, [selectedTask, showStatus]);

  const handleCopyUrl = useCallback(() => {
    if (!selectedTask) return;
    try {
      const { execSync } = require("child_process");
      const url = selectedTask.url;
      try {
        execSync("pbcopy", { input: url, stdio: ["pipe", "ignore", "ignore"] });
      } catch {
        try {
          execSync("xclip -selection clipboard", { input: url, stdio: ["pipe", "ignore", "ignore"] });
        } catch {
          process.stdout.write(`\x1b]52;c;${Buffer.from(url).toString("base64")}\x07`);
        }
      }
      showStatus("URL copied to clipboard!");
    } catch {
      showStatus("Failed to copy URL");
    }
  }, [selectedTask, showStatus]);

  const handleCreateProject = useCallback(async (name: string) => {
    setModal("none");
    try {
      await createProject({ name });
      showStatus(`Project created: ${name}`);
      // Refresh projects list
      try {
        const newProjects = await getProjects();
        onProjectsChange?.(newProjects);
      } catch {
        // non-critical
      }
    } catch {
      showStatus("Failed to create project");
    }
  }, [showStatus, onProjectsChange]);

  const handleCreateLabel = useCallback(async (name: string) => {
    setModal("none");
    try {
      await createLabel({ name });
      showStatus(`Label created: ${name}`);
      // Refresh labels list
      try {
        const newLabels = await getLabels();
        onLabelsChange?.(newLabels);
      } catch {
        // non-critical
      }
    } catch {
      showStatus("Failed to create label");
    }
  }, [showStatus, onLabelsChange]);

  const handlePluginInput = useCallback((value: string) => {
    setModal("none");
    if (pendingPluginInput) {
      pendingPluginInput.execute(value);
      setPendingPluginInput(null);
    }
  }, [pendingPluginInput]);

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

  // Build command palette commands
  const commands = useMemo((): Command[] => {
    const cmds: Command[] = [
      { name: "add", description: "Add a new task", shortcut: "a", action: () => setModal("add"), category: "task" },
      { name: "search", description: "Search tasks", shortcut: "/", action: () => setModal("search"), category: "navigation" },
      { name: "filter", description: "API filter query", shortcut: "f", action: () => setModal("filter"), category: "navigation" },
      { name: "sort", description: "Change sort order", shortcut: "s", action: () => setModal("sort"), category: "navigation" },
      { name: "refresh", description: "Refresh task list", shortcut: "r", action: () => { refreshTasks(); showStatus("Refreshing..."); setModal("none"); }, category: "general" },
      { name: "help", description: "Show keyboard shortcuts", shortcut: "?", action: () => setModal("help"), category: "general" },
      { name: "quit", description: "Exit application", shortcut: "q", action: () => { setModal("none"); onQuit(); }, category: "general" },
    ];
    if (selectedTask) {
      cmds.push(
        { name: "edit", description: `Edit "${selectedTask.content}"`, shortcut: "e", action: () => { setModal("editFull"); }, category: "task" },
        { name: "rename", description: `Rename "${selectedTask.content}"`, shortcut: "R", action: () => { setModal("rename"); }, category: "task" },
        { name: "complete", description: `Complete "${selectedTask.content}"`, shortcut: "c", action: () => { setModal("none"); handleCompleteTask(); }, category: "task" },
        { name: "delete", description: `Delete "${selectedTask.content}"`, shortcut: "d", action: () => { setModal("none"); setModal("delete"); }, category: "task" },
        { name: "open", description: `Open "${selectedTask.content}" detail`, shortcut: "Enter", action: () => { setModal("none"); onOpenTask?.(selectedTask); }, category: "task" },
        { name: "due", description: `Set due date for "${selectedTask.content}"`, shortcut: "t", action: () => { setModal("due"); }, category: "task" },
        { name: "deadline", description: `Set deadline for "${selectedTask.content}"`, shortcut: "D", action: () => { setModal("deadline"); }, category: "task" },
        { name: "move", description: `Move "${selectedTask.content}" to project`, shortcut: "m", action: () => { setModal("move"); }, category: "task" },
        { name: "labels", description: `Edit labels for "${selectedTask.content}"`, shortcut: "l", action: () => { setModal("label"); }, category: "task" },
        { name: "subtask", description: `Add subtask to "${selectedTask.content}"`, shortcut: "S", action: () => { setModal("addSubtask"); }, category: "task" },
        { name: "browser", description: `Open "${selectedTask.content}" in browser`, shortcut: "y", action: () => { setModal("none"); handleOpenInBrowser(); }, category: "task" },
      );
    }
    if (selectedIds.size > 0) {
      cmds.push(
        { name: "complete-selected", description: `Complete ${selectedIds.size} selected tasks`, action: () => { setModal("none"); handleBulkComplete(); }, category: "bulk" },
        { name: "delete-selected", description: `Delete ${selectedIds.size} selected tasks`, action: () => { setModal("none"); setModal("bulkDelete"); }, category: "bulk" },
        { name: "labels-selected", description: `Edit labels for ${selectedIds.size} selected tasks`, action: () => { setModal("label"); }, category: "bulk" },
        { name: "clear-selection", description: "Clear all selections", action: () => { setSelectedIds(new Set()); setRangeSelectAnchor(null); setModal("none"); }, category: "bulk" },
      );
    }
    // View commands
    cmds.push(
      { name: "inbox", description: "Show Inbox", action: () => { setFilterProjectId(undefined); setFilterLabel(undefined); setFilterSectionId(undefined); setFilterView("Inbox"); setTaskIndex(0); setModal("none"); }, category: "view" },
      { name: "today", description: "Show Today", action: () => { setFilterProjectId(undefined); setFilterLabel(undefined); setFilterSectionId(undefined); setFilterView("Today"); setTaskIndex(0); setModal("none"); }, category: "view" },
      { name: "upcoming", description: "Show Upcoming", action: () => { setFilterProjectId(undefined); setFilterLabel(undefined); setFilterSectionId(undefined); setFilterView("Upcoming"); setTaskIndex(0); setModal("none"); }, category: "view" },
    );
    // Dashboard views
    if (onNavigate) {
      cmds.push(
        { name: "stats", description: "Productivity stats dashboard", action: () => { setModal("none"); onNavigate("stats"); }, category: "view" },
        { name: "completed", description: "View completed tasks", action: () => { setModal("none"); onNavigate("completed"); }, category: "view" },
        { name: "activity", description: "Activity log", action: () => { setModal("none"); onNavigate("activity"); }, category: "view" },
        { name: "log", description: "Activity log (alias)", action: () => { setModal("none"); onNavigate("activity"); }, category: "view" },
      );
    }
    // Project commands
    for (const p of projects) {
      if (!p.is_inbox_project) {
        cmds.push({
          name: `project:${p.name}`,
          description: `Switch to project ${p.name}`,
          action: () => { setFilterLabel(undefined); setFilterView(""); setFilterProjectId(p.id); setTaskIndex(0); setModal("none"); },
          category: "project",
        });
      }
    }
    // Template commands
    try {
      const templates = getTemplates();
      for (const template of templates) {
        cmds.push({
          name: `template:${template.name}`,
          description: `Apply template: ${template.name}`,
          category: "template",
          action: async () => {
            setModal("none");
            try {
              await createTask({
                content: template.content,
                description: template.description,
                priority: template.priority,
                labels: template.labels,
                due_string: template.due_string,
                project_id: filterProjectId,
              });
              showStatus(`Task created from template "${template.name}"`);
              refreshTasks().catch(() => {});
            } catch {
              showStatus(`Failed to apply template "${template.name}"`);
            }
          },
        });
      }
    } catch {
      // Template loading failure is non-critical
    }
    // Create project command
    cmds.push({
      name: "create-project",
      description: "Create a new project",
      category: "project",
      action: () => {
        setModal("createProject" as Modal);
      },
    });
    // Create label command
    cmds.push({
      name: "create-label",
      description: "Create a new label",
      category: "general",
      action: () => {
        setModal("createLabel" as Modal);
      },
    });
    // Plugin palette commands
    if (pluginPalette) {
      for (const cmd of pluginPalette.getCommands()) {
        cmds.push({
          name: cmd.label.toLowerCase().replace(/\s+/g, "-"),
          description: cmd.label,
          category: cmd.category,
          shortcut: cmd.shortcut,
          action: () => {
            const ctx = pluginPaletteContextMap?.get(cmd.label);
            if (!ctx) { setModal("none"); return; }
            if (cmd.inputPrompt) {
              // Command needs user input — show input modal
              setModal("none");
              setPendingPluginInput({
                label: cmd.inputPrompt.label,
                placeholder: cmd.inputPrompt.placeholder,
                formatPreview: cmd.inputPrompt.formatPreview,
                execute: (input: string) => {
                  const result = cmd.action(ctx, selectedTask ?? null, onNavigate ?? (() => {}), input);
                  if (result instanceof Promise) {
                    result.catch(() => showStatus(`Failed: ${cmd.label}`));
                  }
                },
              });
              setTimeout(() => setModal("pluginInput"), 0);
            } else {
              setModal("none");
              const result = cmd.action(ctx, selectedTask ?? null, onNavigate ?? (() => {}));
              if (result instanceof Promise) {
                result.catch(() => showStatus(`Failed: ${cmd.label}`));
              }
            }
          },
        });
      }
    }
    return cmds;
  }, [selectedTask, selectedIds, projects, refreshTasks, onQuit, onOpenTask, onNavigate, handleCompleteTask, handleBulkComplete, handleOpenInBrowser, filterProjectId, pluginPalette, pluginPaletteContextMap, showStatus, setPendingPluginInput]);

  useKeyboardHandler({
    modal,
    activePanel,
    setActivePanel,
    setModal,
    selectedTask,
    selectedIds,
    setSelectedIds,
    filteredTasks,
    taskIndex,
    rangeSelectAnchor,
    setRangeSelectAnchor,
    searchQuery,
    setSearchQuery,
    apiFilteredTasks,
    setApiFilteredTasks,
    setFilterProjectId,
    setFilterSectionId,
    setFilterLabel,
    setFilterView,
    setTaskIndex,
    pendingQuit,
    setPendingQuit,
    pendingQuitTimerRef,
    showStatus,
    onQuit,
    onOpenTask,
    refreshTasks,
    handleCompleteTask,
    handleBulkComplete,
    handleSetPriority,
    handleUndo,
    handleRedo,
    handleDuplicateTask,
    handleOpenInBrowser,
    handleCopyUrl,
    toggleSelection,
    handleRangeSelect,
    pluginExtensions,
    pluginKeybindingContextMap,
  });

  // Auto-refresh every 60 seconds when idle
  useEffect(() => {
    const interval = setInterval(() => {
      if (modalRef.current === "none" && !lastActionRef.current) {
        getTasks()
          .then((newTasks) => onTasksChange(newTasks))
          .catch(() => {});
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [onTasksChange]);

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
          isFocused={activePanel === "sidebar" && modal === "none"}
          onSelect={handleSidebarSelect}
          onIndexChange={setSidebarIndex}
          onNavigate={onNavigate ? (viewName: string) => {
            onNavigate(viewName);
          } : undefined}
          pluginViews={pluginViews?.getViews()}
        />
        <Box flexDirection="column" flexGrow={1}>
          <Box paddingX={1} justifyContent="space-between">
            <Box>
              <Breadcrumb segments={breadcrumbSegments} />
              <Text color="gray">{` | Sort: ${sortLabels[sortField]} ${sortDirection === "asc" ? "\u2191" : "\u2193"}`}</Text>
            </Box>
            <Box>
              {searchQuery && (
                <Text color="cyan">{`Search: "${searchQuery}" (${filteredTasks.length})`} </Text>
              )}
              <Text color="gray" dimColor>{filteredTasks.length} tasks</Text>
            </Box>
          </Box>
          {filteredTasks.length === 0 && apiFilteredTasks !== null ? (
            <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor={activePanel === "tasks" ? "blue" : "gray"} paddingX={1} justifyContent="center" alignItems="center">
              <Text color="gray">No tasks match filter. Press Esc to clear.</Text>
            </Box>
          ) : (
            <TaskList
              tasks={filteredTasks}
              selectedIndex={taskIndex}
              isFocused={activePanel === "tasks" && modal === "none"}
              onIndexChange={setTaskIndex}
              selectedIds={selectedIds}
              sortField={sortField}
              searchQuery={searchQuery}
              pluginColumns={pluginExtensions?.getTaskColumns()}
              pluginColumnContextMap={pluginColumnContextMap}
            />
          )}
        </Box>
      </Box>

      <ModalManager
        modal={modal}
        setModal={setModal}
        selectedTask={selectedTask}
        selectedIds={selectedIds}
        projects={projects}
        labels={labels}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sortField={sortField}
        sortDirection={sortDirection}
        filterProjectId={filterProjectId}
        filterView={filterView}
        commands={commands}
        pluginExtensions={pluginExtensions}
        handleAddTask={handleAddTask}
        handleCreateTaskFull={handleCreateTaskFull}
        handleAddSubtask={handleAddSubtask}
        handleEditTask={handleEditTask}
        handleRenameTask={handleRenameTask}
        handleEditTaskFull={handleEditTaskFull}
        handleDeleteConfirm={handleDeleteConfirm}
        handleBulkDeleteConfirm={handleBulkDeleteConfirm}
        handleSetDueDate={handleSetDueDate}
        handleSetDeadline={handleSetDeadline}
        handleMoveToProject={handleMoveToProject}
        handleLabelsSave={handleLabelsSave}
        handleFilterInput={handleFilterInput}
        handleSortSelect={handleSortSelect}
        handleSearchSubmit={handleSearchSubmit}
        handleSearchCancel={handleSearchCancel}
        handleCreateProject={handleCreateProject}
        handleCreateLabel={handleCreateLabel}
        renderQuickAddPreview={renderQuickAddPreview}
        pendingPluginInput={pendingPluginInput}
        handlePluginInput={handlePluginInput}
      />

      {pluginExtensions && pluginStatusBarContextMap && pluginExtensions.getStatusBarItems().length > 0 && (
        <StatusBar
          items={pluginExtensions.getStatusBarItems()}
          contextMap={pluginStatusBarContextMap}
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
              <Text color="magenta">[l]</Text><Text>abel </Text>
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
              <Text color="green">[y]</Text><Text>url </Text>
              <Text color="cyan">[/]</Text><Text>search </Text>
              <Text color="white">[?]</Text><Text>help </Text>
              <Text color="gray">[q]</Text><Text>uit</Text>
            </>
          )}
        </Text>
        <Box>
          {filteredTasks.length > 0 && (
            <Text color="gray" dimColor>{taskIndex + 1}/{filteredTasks.length} </Text>
          )}
          {undoCountdown > 0 && lastAction ? (
            <Text color="green" bold>[u]ndo ({undoCountdown}s)</Text>
          ) : redoCountdown > 0 && lastRedo ? (
            <Text color="blue" bold>(U)redo ({redoCountdown}s)</Text>
          ) : statusMessage ? (
            <Text color="yellow">{statusMessage}</Text>
          ) : isLoading ? (
            <Text color="cyan" dimColor>Syncing...</Text>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}
