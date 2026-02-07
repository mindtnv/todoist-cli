import React from "react";
import { Text } from "ink";
import type { Task, Project, Label, CreateTaskParams, UpdateTaskParams } from "../../api/types.ts";
import { InputPrompt } from "./InputPrompt.tsx";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { HelpOverlay } from "./HelpOverlay.tsx";
import { SortMenu } from "./SortMenu.tsx";
import type { SortField } from "./SortMenu.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import type { Command } from "./CommandPalette.tsx";
import { ProjectPicker } from "./ProjectPicker.tsx";
import { LabelPicker } from "./LabelPicker.tsx";
import { EditTaskModal } from "./EditTaskModal.tsx";
import type { ExtensionRegistry } from "../../plugins/types.ts";

type Modal = "none" | "add" | "addSubtask" | "edit" | "delete" | "filter" | "search" | "help" | "sort" | "bulkDelete" | "command" | "due" | "deadline" | "move" | "label" | "editFull" | "createFull" | "rename" | "pluginInput" | "createProject" | "createLabel";

interface ModalManagerProps {
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
  commands: Command[];
  pluginExtensions?: ExtensionRegistry | null;
  // Handlers
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
  renderQuickAddPreview: (value: string) => React.ReactNode;
  handleCreateProject: (name: string) => Promise<void>;
  handleCreateLabel: (name: string) => Promise<void>;
  pendingPluginInput?: {
    label: string;
    placeholder?: string;
    formatPreview?: (value: string) => string;
  } | null;
  handlePluginInput?: (value: string) => void;
}

export function ModalManager({
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
  commands,
  pluginExtensions,
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
  pendingPluginInput,
  handlePluginInput,
}: ModalManagerProps) {
  return (
    <>
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
      {modal === "rename" && selectedTask && (
        <InputPrompt
          prompt="Rename"
          defaultValue={selectedTask.content}
          onSubmit={handleRenameTask}
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
      {modal === "label" && (selectedTask || selectedIds.size > 0) && (
        <LabelPicker
          labels={labels}
          currentLabels={selectedTask?.labels ?? []}
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
        <HelpOverlay onClose={() => setModal("none")} pluginKeybindings={pluginExtensions?.getKeybindings()} />
      )}
      {modal === "sort" && (
        <SortMenu
          currentSort={sortField}
          currentDirection={sortDirection}
          onSelect={handleSortSelect}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "pluginInput" && pendingPluginInput && handlePluginInput && (
        <InputPrompt
          prompt={pendingPluginInput.label}
          placeholder={pendingPluginInput.placeholder}
          onSubmit={(val) => {
            handlePluginInput(val);
          }}
          onCancel={() => setModal("none")}
          onPreview={pendingPluginInput.formatPreview ? (val: string) => {
            const preview = pendingPluginInput.formatPreview!(val);
            return <Text color={preview.startsWith("Invalid") || preview.startsWith("!") ? "red" : "green"}>{preview}</Text>;
          } : undefined}
          footer={
            <Text color="gray" dimColor>
              [Enter] confirm  [Esc] cancel
            </Text>
          }
        />
      )}
      {modal === "createProject" && (
        <InputPrompt
          prompt="New project name"
          placeholder="My Project"
          onSubmit={handleCreateProject}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "createLabel" && (
        <InputPrompt
          prompt="New label name"
          placeholder="my-label"
          onSubmit={handleCreateLabel}
          onCancel={() => setModal("none")}
        />
      )}
      {modal === "command" && (
        <CommandPalette
          commands={commands}
          onCancel={() => setModal("none")}
        />
      )}
    </>
  );
}

export type { Modal };
