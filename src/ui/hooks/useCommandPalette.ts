import { useMemo } from "react";
import type { Task, Project } from "../../api/types.ts";
import type { Command } from "../components/CommandPalette.tsx";
import type { Modal } from "../components/ModalManager.tsx";
import type { PaletteRegistry, PluginContext } from "../../plugins/types.ts";
import { createTask } from "../../api/tasks.ts";
import { getTemplates } from "../../config/index.ts";

interface UseCommandPaletteOptions {
  selectedTask: Task | undefined;
  selectedIds: Set<string>;
  projects: Project[];
  filterProjectId: string | undefined;
  filterView: string;
  setModal: (modal: Modal) => void;
  setFilterProjectId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setFilterLabel: React.Dispatch<React.SetStateAction<string | undefined>>;
  setFilterSectionId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setFilterView: React.Dispatch<React.SetStateAction<string>>;
  setTaskIndex: React.Dispatch<React.SetStateAction<number>>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setRangeSelectAnchor: React.Dispatch<React.SetStateAction<number | null>>;
  setPendingPluginInput: React.Dispatch<React.SetStateAction<{
    label: string;
    placeholder?: string;
    formatPreview?: (value: string) => string;
    execute: (input: string) => void;
  } | null>>;
  refreshTasks: () => Promise<void>;
  showStatus: (msg: string) => void;
  onQuit: () => void;
  onOpenTask?: (task: Task) => void;
  onNavigate?: (view: string) => void;
  handleCompleteTask: () => Promise<void>;
  handleBulkComplete: () => Promise<void>;
  handleOpenInBrowser: () => void;
  pluginPalette?: PaletteRegistry | null;
  pluginPaletteContextMap?: Map<string, PluginContext>;
}

export function useCommandPalette({
  selectedTask,
  selectedIds,
  projects,
  filterProjectId,
  filterView,
  setModal,
  setFilterProjectId,
  setFilterLabel,
  setFilterSectionId,
  setFilterView,
  setTaskIndex,
  setSelectedIds,
  setRangeSelectAnchor,
  setPendingPluginInput,
  refreshTasks,
  showStatus,
  onQuit,
  onOpenTask,
  onNavigate,
  handleCompleteTask,
  handleBulkComplete,
  handleOpenInBrowser,
  pluginPalette,
  pluginPaletteContextMap,
}: UseCommandPaletteOptions): Command[] {
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
        { name: "delete", description: `Delete "${selectedTask.content}"`, shortcut: "d", action: () => { setModal("delete"); }, category: "task" },
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
        { name: "delete-selected", description: `Delete ${selectedIds.size} selected tasks`, action: () => { setModal("bulkDelete"); }, category: "bulk" },
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
              // Command needs user input -- show input modal
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
  }, [selectedTask, selectedIds, projects, refreshTasks, onQuit, onOpenTask, onNavigate, handleCompleteTask, handleBulkComplete, handleOpenInBrowser, filterProjectId, pluginPalette, pluginPaletteContextMap, showStatus, setPendingPluginInput, setModal, setFilterProjectId, setFilterLabel, setFilterSectionId, setFilterView, setTaskIndex, setSelectedIds, setRangeSelectAnchor, filterView]);

  return commands;
}
