import React, { createContext, useContext } from "react";
import type { Task, Project, Label, CreateTaskParams, UpdateTaskParams } from "../../api/types.ts";
import type { Modal } from "../components/ModalManager.tsx";
import type { SortField } from "../components/SortMenu.tsx";
import type { Command } from "../components/CommandPalette.tsx";
import type { ExtensionRegistry, PluginUiApi } from "../../plugins/types.ts";

// Group handler callbacks
export interface TaskHandlers {
  handleAddTask: (input: string) => Promise<void>;
  handleCreateTaskFull: (params: CreateTaskParams) => Promise<void>;
  handleAddSubtask: (input: string) => Promise<void>;
  handleEditTask: (content: string) => Promise<void>;
  handleRenameTask: (content: string) => Promise<void>;
  handleEditTaskFull: (params: UpdateTaskParams) => Promise<void>;
  handleDeleteConfirm: () => Promise<void>;
  handleBulkDeleteConfirm: () => Promise<void>;
  handleSetDueDate: (due: string) => Promise<void>;
  handleSetDeadline: (deadline: string) => Promise<void>;
  handleMoveToProject: (projectId: string) => Promise<void>;
  handleLabelsSave: (labels: string[]) => Promise<void>;
  handleFilterInput: (query: string) => Promise<void>;
  handleSortSelect: (field: SortField) => void;
  handleSearchSubmit: (value: string) => void;
  handleSearchCancel: () => void;
  handleCreateProject: (name: string) => Promise<void>;
  handleCreateLabel: (name: string) => Promise<void>;
  renderQuickAddPreview: (value: string) => React.ReactNode;
  handlePluginInput?: (value: string) => void;
}

export interface TasksViewContextValue {
  modal: Modal;
  setModal: (modal: Modal) => void;
  selectedTask: Task | undefined;
  selectedIds: Set<string>;
  projects: Project[];
  labels: Label[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortField: SortField;
  sortDirection: "asc" | "desc";
  filterProjectId: string | undefined;
  filterView: string;
  handlers: TaskHandlers;
  commands: Command[];
  pluginExtensions?: ExtensionRegistry | null;
  pendingPluginInput?: {
    label: string;
    placeholder?: string;
    formatPreview?: (value: string) => string;
  } | null;
  showStatus?: (message: string) => void;
  notify?: (message: string, opts?: { level?: "info" | "success" | "warning" | "error"; duration?: number; persistent?: boolean }) => void;
  navigate?: (view: string) => void;
  refreshTasks?: () => Promise<void>;
}

const TasksViewContext = createContext<TasksViewContextValue | null>(null);

export function TasksViewProvider({ children, value }: { children: React.ReactNode; value: TasksViewContextValue }) {
  return <TasksViewContext.Provider value={value}>{children}</TasksViewContext.Provider>;
}

export function useTasksViewContext(): TasksViewContextValue {
  const ctx = useContext(TasksViewContext);
  if (!ctx) throw new Error("useTasksViewContext must be used within TasksViewProvider");
  return ctx;
}

/**
 * Maps the TasksViewContext methods to the PluginUiApi interface.
 * Used when creating PluginContext instances for plugins running in TUI mode.
 */
export function createPluginUiApi(ctx: TasksViewContextValue): PluginUiApi {
  return {
    showStatus(message: string) {
      ctx.showStatus?.(message);
    },
    notify(message: string, opts?: { level?: "info" | "success" | "warning" | "error"; duration?: number; persistent?: boolean }) {
      ctx.notify?.(message, opts);
    },
    navigate(view: string) {
      ctx.navigate?.(view);
    },
    openModal(modalId: string) {
      ctx.setModal(`plugin:${modalId}` as Modal);
    },
    refreshTasks() {
      ctx.refreshTasks?.();
    },
  };
}
