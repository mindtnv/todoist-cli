import React from "react";
import { Box, Text } from "ink";
import { InputPrompt } from "./InputPrompt.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { HelpOverlay } from "./HelpOverlay.tsx";
import { SortMenu } from "./SortMenu.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { ProjectPicker } from "./ProjectPicker.tsx";
import { LabelPicker } from "./LabelPicker.tsx";
import { EditTaskModal } from "./EditTaskModal.tsx";
import { useTasksViewContext } from "../contexts/TasksViewContext.tsx";
import type { TasksViewContextValue } from "../contexts/TasksViewContext.tsx";

type BuiltinModal = "none" | "add" | "addSubtask" | "edit" | "delete" | "filter" | "search" | "help" | "sort" | "bulkDelete" | "command" | "due" | "deadline" | "move" | "label" | "editFull" | "createFull" | "rename" | "pluginInput" | "createProject" | "createLabel";
type Modal = BuiltinModal | `plugin:${string}`;

const MODAL_REGISTRY: Record<string, (ctx: TasksViewContextValue) => React.ReactNode | null> = {
  none: () => null,

  add: (ctx) => (
    <InputPrompt
      prompt="New task"
      placeholder="Buy milk tomorrow #Shopping p1 @errands"
      onSubmit={ctx.handlers.handleAddTask}
      onCancel={() => ctx.setModal("none")}
      onCtrlE={() => ctx.setModal("createFull")}
      onPreview={ctx.handlers.renderQuickAddPreview}
      footer={
        <Text color="gray" dimColor>
          [Enter] create & continue  [Ctrl-E] full editor  [Esc] close
        </Text>
      }
    />
  ),

  createFull: (ctx) => (
    <EditTaskModal
      projects={ctx.projects}
      labels={ctx.labels}
      onSave={() => {}}
      onCreate={ctx.handlers.handleCreateTaskFull}
      onCancel={() => ctx.setModal("none")}
      defaultProjectId={ctx.filterProjectId}
      defaultDue={ctx.filterView === "Today" ? "today" : undefined}
    />
  ),

  addSubtask: (ctx) => {
    if (!ctx.selectedTask) return null;
    return (
      <InputPrompt
        prompt={`Subtask of "${ctx.selectedTask.content}"`}
        onSubmit={ctx.handlers.handleAddSubtask}
        onCancel={() => ctx.setModal("none")}
      />
    );
  },

  edit: (ctx) => {
    if (!ctx.selectedTask) return null;
    return (
      <InputPrompt
        prompt="Edit task"
        defaultValue={ctx.selectedTask.content}
        onSubmit={ctx.handlers.handleEditTask}
        onCancel={() => ctx.setModal("none")}
      />
    );
  },

  rename: (ctx) => {
    if (!ctx.selectedTask) return null;
    return (
      <InputPrompt
        prompt="Rename"
        defaultValue={ctx.selectedTask.content}
        onSubmit={ctx.handlers.handleRenameTask}
        onCancel={() => ctx.setModal("none")}
      />
    );
  },

  editFull: (ctx) => {
    if (!ctx.selectedTask) return null;
    return (
      <EditTaskModal
        task={ctx.selectedTask}
        projects={ctx.projects}
        labels={ctx.labels}
        onSave={ctx.handlers.handleEditTaskFull}
        onCancel={() => ctx.setModal("none")}
      />
    );
  },

  due: (ctx) => (
    <InputPrompt
      prompt="Due date"
      onSubmit={ctx.handlers.handleSetDueDate}
      onCancel={() => ctx.setModal("none")}
    />
  ),

  deadline: (ctx) => (
    <InputPrompt
      prompt="Deadline (YYYY-MM-DD)"
      onSubmit={ctx.handlers.handleSetDeadline}
      onCancel={() => ctx.setModal("none")}
    />
  ),

  move: (ctx) => (
    <ProjectPicker
      projects={ctx.projects}
      onSelect={ctx.handlers.handleMoveToProject}
      onCancel={() => ctx.setModal("none")}
    />
  ),

  label: (ctx) => {
    if (!ctx.selectedTask && ctx.selectedIds.size === 0) return null;
    return (
      <LabelPicker
        labels={ctx.labels}
        currentLabels={ctx.selectedTask?.labels ?? []}
        onSave={ctx.handlers.handleLabelsSave}
        onCancel={() => ctx.setModal("none")}
      />
    );
  },

  delete: (ctx) => {
    if (!ctx.selectedTask) return null;
    return (
      <ConfirmDialog
        message={`Delete "${ctx.selectedTask.content}"?`}
        onConfirm={ctx.handlers.handleDeleteConfirm}
        onCancel={() => ctx.setModal("none")}
      />
    );
  },

  bulkDelete: (ctx) => (
    <ConfirmDialog
      message={`Delete ${ctx.selectedIds.size} selected tasks?`}
      onConfirm={ctx.handlers.handleBulkDeleteConfirm}
      onCancel={() => ctx.setModal("none")}
    />
  ),

  filter: (ctx) => (
    <InputPrompt
      prompt="Filter"
      onSubmit={ctx.handlers.handleFilterInput}
      onCancel={() => ctx.setModal("none")}
    />
  ),

  search: (ctx) => (
    <InputPrompt
      prompt="Search"
      defaultValue={ctx.searchQuery}
      onSubmit={(val) => {
        ctx.setSearchQuery(val);
        ctx.handlers.handleSearchSubmit(val);
      }}
      onCancel={ctx.handlers.handleSearchCancel}
    />
  ),

  help: (ctx) => (
    <HelpOverlay onClose={() => ctx.setModal("none")} pluginKeybindings={ctx.pluginExtensions?.getKeybindings()} />
  ),

  sort: (ctx) => (
    <SortMenu
      currentSort={ctx.sortField}
      currentDirection={ctx.sortDirection}
      onSelect={ctx.handlers.handleSortSelect}
      onCancel={() => ctx.setModal("none")}
    />
  ),

  pluginInput: (ctx) => {
    if (!ctx.pendingPluginInput || !ctx.handlers.handlePluginInput) return null;
    const pluginInput = ctx.pendingPluginInput;
    return (
      <InputPrompt
        prompt={pluginInput.label}
        placeholder={pluginInput.placeholder}
        onSubmit={(val) => {
          ctx.handlers.handlePluginInput!(val);
        }}
        onCancel={() => ctx.setModal("none")}
        onPreview={pluginInput.formatPreview ? (val: string) => {
          const preview = pluginInput.formatPreview!(val);
          return <Text color={preview.startsWith("Invalid") || preview.startsWith("!") ? "red" : "green"}>{preview}</Text>;
        } : undefined}
        footer={
          <Text color="gray" dimColor>
            [Enter] confirm  [Esc] cancel
          </Text>
        }
      />
    );
  },

  createProject: (ctx) => (
    <InputPrompt
      prompt="New project name"
      placeholder="My Project"
      onSubmit={ctx.handlers.handleCreateProject}
      onCancel={() => ctx.setModal("none")}
    />
  ),

  createLabel: (ctx) => (
    <InputPrompt
      prompt="New label name"
      placeholder="my-label"
      onSubmit={ctx.handlers.handleCreateLabel}
      onCancel={() => ctx.setModal("none")}
    />
  ),

  command: (ctx) => (
    <CommandPalette
      commands={ctx.commands}
      onCancel={() => ctx.setModal("none")}
    />
  ),
};

export function ModalManager() {
  const ctx = useTasksViewContext();

  // Check built-in modals first
  const renderer = MODAL_REGISTRY[ctx.modal];
  if (renderer) {
    const result = renderer(ctx);
    return result ? <>{result}</> : null;
  }

  // Fall back to plugin-registered modals for "plugin:<id>" modal names
  if (ctx.modal.startsWith("plugin:") && ctx.pluginExtensions) {
    const pluginModalId = ctx.modal.slice("plugin:".length);
    const pluginModal = ctx.pluginExtensions.getModals().find(m => m.id === pluginModalId);
    if (pluginModal) {
      const PluginComponent = pluginModal.component;
      return (
        <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1}>
          <PluginComponent onClose={() => ctx.setModal("none")} currentTask={ctx.selectedTask ?? null} />
        </Box>
      );
    }
  }

  return null;
}

export type { Modal, BuiltinModal };
