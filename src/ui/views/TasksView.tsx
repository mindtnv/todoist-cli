import React from "react";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Box, Text } from "ink";
import type { Task, Project, Label, Section } from "../../api/types.ts";
import { Sidebar } from "../components/Sidebar.tsx";
import { TaskList } from "../components/TaskList.tsx";
import type { SortField } from "../components/SortMenu.tsx";
import { getTasks } from "../../api/tasks.ts";
import { parseQuickAdd } from "../../utils/quick-add.ts";
import { openUrl } from "../../utils/open-url.ts";
import { createProject } from "../../api/projects.ts";
import { createLabel } from "../../api/labels.ts";
import { getProjects } from "../../api/projects.ts";
import { getLabels } from "../../api/labels.ts";
import { Breadcrumb } from "../components/Breadcrumb.tsx";
import { PRIORITY_COLORS, PRIORITY_NAMES } from "../constants.ts";
import { ModalManager } from "../components/ModalManager.tsx";
import type { Modal } from "../components/ModalManager.tsx";
import { TasksViewProvider } from "../contexts/TasksViewContext.tsx";
import type { TasksViewContextValue } from "../contexts/TasksViewContext.tsx";
import type { ExtensionRegistry, PaletteRegistry, ViewRegistry, PluginContext, HookRegistry } from "../../plugins/types.ts";
import { StatusBar } from "../components/StatusBar.tsx";
import { useStatusMessage } from "../hooks/useStatusMessage.ts";
import { useUndoSystem } from "../hooks/useUndoSystem.ts";
import { useTaskOperations } from "../hooks/useTaskOperations.ts";
import { useKeyboardHandler } from "../hooks/useKeyboardHandler.ts";
import { useFilterState } from "../hooks/useFilterState.ts";
import { useSelectionState } from "../hooks/useSelectionState.ts";
import { useCommandPalette } from "../hooks/useCommandPalette.ts";

type Panel = "sidebar" | "tasks";

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

  const { message: statusMessage, show: showStatus } = useStatusMessage({
    initialMessage: initialStatus,
    autoClearMs: 3000,
    onInitialClear: onStatusClear,
  });

  // --- Filter state hook ---
  const {
    filterLabel, setFilterLabel,
    filterProjectId, setFilterProjectId,
    filterSectionId, setFilterSectionId,
    filterView, setFilterView,
    searchQuery, setSearchQuery,
    apiFilteredTasks, setApiFilteredTasks,
    sortField, sortDirection,
    filteredTasks, breadcrumbSegments,
    handleSidebarSelect: handleSidebarSelectBase,
    handleFilterInput, handleSearchSubmit, handleSearchCancel, handleSortSelect,
  } = useFilterState({
    tasks, projects, labels, sections,
    showStatus, setModal, setTaskIndex,
    initialState: {
      filterLabel: saved?.filterLabel,
      filterProjectId: saved?.filterProjectId,
      filterSectionId: saved?.filterSectionId,
      filterView: saved?.filterView,
      searchQuery: saved?.searchQuery,
      sortField: saved?.sortField,
      sortDirection: saved?.sortDirection,
    },
  });

  // Wrap sidebar select to also switch active panel
  const handleSidebarSelect = useCallback(
    (item: import("../components/Sidebar.tsx").SidebarItem) => {
      handleSidebarSelectBase(item);
      setActivePanel("tasks");
    },
    [handleSidebarSelectBase],
  );

  // --- Selection state hook ---
  const {
    selectedIds, setSelectedIds,
    rangeSelectAnchor, setRangeSelectAnchor,
    selectedTask,
    toggleSelection, handleRangeSelect,
  } = useSelectionState({
    filteredTasks, taskIndex, showStatus,
  });

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
    tasks, onTasksChange, showStatus, refreshTasks,
  });

  const {
    handleCompleteTask, handleDeleteConfirm, handleEditTask, handleRenameTask,
    handleBulkComplete, handleBulkDeleteConfirm, handleSetPriority,
    handleSetDueDate, handleSetDeadline, handleAddTask, handleCreateTaskFull,
    handleAddSubtask, handleMoveToProject, handleLabelsSave,
    handleEditTaskFull, handleDuplicateTask,
  } = useTaskOperations({
    tasks, onTasksChange, showStatus, startUndoTimer, clearUndo, lastActionRef,
    refreshTasks, selectedTask, selectedIds, setSelectedIds, setRangeSelectAnchor,
    setTaskIndex, setModal: setModal as React.Dispatch<React.SetStateAction<string>>,
    filteredTasksLength: filteredTasks.length,
    filterProjectId, filterView, projects, pluginHooks,
  });

  // --- Misc handlers (kept in TasksView as they're small and view-specific) ---

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
    const url = selectedTask.url;
    const { execFile } = require("child_process") as typeof import("child_process");
    const child = execFile("pbcopy", [], (err: Error | null) => {
      if (err) {
        const child2 = execFile("xclip", ["-selection", "clipboard"], (err2: Error | null) => {
          if (err2) {
            // OSC52 fallback for terminals that support it
            process.stdout.write(`\x1b]52;c;${Buffer.from(url).toString("base64")}\x07`);
          }
          showStatus("URL copied to clipboard!");
        });
        child2.stdin?.write(url);
        child2.stdin?.end();
        return;
      }
      showStatus("URL copied to clipboard!");
    });
    child.stdin?.write(url);
    child.stdin?.end();
  }, [selectedTask, showStatus]);

  const handleCreateProject = useCallback(async (name: string) => {
    setModal("none");
    try {
      await createProject({ name });
      showStatus(`Project created: ${name}`);
      try {
        const newProjects = await getProjects();
        onProjectsChange?.(newProjects);
      } catch { /* non-critical */ }
    } catch {
      showStatus("Failed to create project");
    }
  }, [showStatus, onProjectsChange]);

  const handleCreateLabel = useCallback(async (name: string) => {
    setModal("none");
    try {
      await createLabel({ name });
      showStatus(`Label created: ${name}`);
      try {
        const newLabels = await getLabels();
        onLabelsChange?.(newLabels);
      } catch { /* non-critical */ }
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

  // --- Command palette hook ---
  const commands = useCommandPalette({
    selectedTask, selectedIds, projects, filterProjectId, filterView,
    setModal, setFilterProjectId, setFilterLabel, setFilterSectionId,
    setFilterView, setTaskIndex, setSelectedIds, setRangeSelectAnchor,
    setPendingPluginInput, refreshTasks, showStatus, onQuit, onOpenTask,
    onNavigate, handleCompleteTask, handleBulkComplete, handleOpenInBrowser,
    pluginPalette, pluginPaletteContextMap,
  });

  // --- Keyboard handler (not extracted by this refactor) ---
  useKeyboardHandler({
    modal, activePanel, setActivePanel, setModal, selectedTask,
    selectedIds, setSelectedIds, filteredTasks, taskIndex,
    rangeSelectAnchor, setRangeSelectAnchor, searchQuery, setSearchQuery,
    apiFilteredTasks, setApiFilteredTasks, setFilterProjectId,
    setFilterSectionId, setFilterLabel, setFilterView, setTaskIndex,
    pendingQuit, setPendingQuit, pendingQuitTimerRef, showStatus,
    onQuit, onOpenTask, refreshTasks, handleCompleteTask, handleBulkComplete,
    handleSetPriority, handleUndo, handleRedo, handleDuplicateTask,
    handleOpenInBrowser, handleCopyUrl, toggleSelection, handleRangeSelect,
    pluginExtensions, pluginKeybindingContextMap,
  });

  // Auto-refresh every 60 seconds when idle
  useEffect(() => {
    const interval = setInterval(() => {
      if (modalRef.current === "none" && !lastActionRef.current) {
        refreshTasks();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [refreshTasks]);

  const hasSelection = selectedIds.size > 0;
  const isSearching = modal === "search" || searchQuery !== "";
  const isRangeSelecting = rangeSelectAnchor !== null;

  // Build context value for ModalManager (and future consumers)
  const tasksViewContextValue = useMemo<TasksViewContextValue>(() => ({
    modal,
    setModal,
    selectedTask,
    selectedIds,
    projects,
    labels,
    searchQuery,
    setSearchQuery,
    sortField,
    sortDirection,
    filterProjectId,
    filterView,
    handlers: {
      handleAddTask,
      handleCreateTaskFull,
      handleAddSubtask,
      handleEditTask,
      handleRenameTask,
      handleEditTaskFull,
      handleDeleteConfirm,
      handleBulkDeleteConfirm,
      handleSetDueDate,
      handleSetDeadline,
      handleMoveToProject,
      handleLabelsSave,
      handleFilterInput,
      handleSortSelect,
      handleSearchSubmit,
      handleSearchCancel,
      handleCreateProject,
      handleCreateLabel,
      renderQuickAddPreview,
      handlePluginInput,
    },
    commands,
    pluginExtensions,
    pendingPluginInput,
  }), [
    modal, setModal, selectedTask, selectedIds, projects, labels,
    searchQuery, setSearchQuery, sortField, sortDirection,
    filterProjectId, filterView,
    handleAddTask, handleCreateTaskFull, handleAddSubtask,
    handleEditTask, handleRenameTask, handleEditTaskFull,
    handleDeleteConfirm, handleBulkDeleteConfirm,
    handleSetDueDate, handleSetDeadline, handleMoveToProject,
    handleLabelsSave, handleFilterInput, handleSortSelect,
    handleSearchSubmit, handleSearchCancel,
    handleCreateProject, handleCreateLabel,
    renderQuickAddPreview, handlePluginInput,
    commands, pluginExtensions, pendingPluginInput,
  ]);

  return (
    <TasksViewProvider value={tasksViewContextValue}>
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

        <ModalManager />

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
    </TasksViewProvider>
  );
}
