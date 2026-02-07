import { useInput } from "ink";
import type { Task } from "../../api/types.ts";
import type { ExtensionRegistry, PluginContext } from "../../plugins/types.ts";
import type { Modal } from "../components/ModalManager.tsx";

type Panel = "sidebar" | "tasks";

interface UseKeyboardHandlerOptions {
  modal: Modal;
  activePanel: Panel;
  setActivePanel: React.Dispatch<React.SetStateAction<Panel>>;
  setModal: (modal: Modal) => void;
  selectedTask: Task | undefined;
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  filteredTasks: Task[];
  taskIndex: number;
  rangeSelectAnchor: number | null;
  setRangeSelectAnchor: React.Dispatch<React.SetStateAction<number | null>>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  apiFilteredTasks: Task[] | null;
  setApiFilteredTasks: React.Dispatch<React.SetStateAction<Task[] | null>>;
  setFilterProjectId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setFilterSectionId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setFilterLabel: React.Dispatch<React.SetStateAction<string | undefined>>;
  setFilterView: React.Dispatch<React.SetStateAction<string>>;
  setTaskIndex: React.Dispatch<React.SetStateAction<number>>;
  pendingQuit: boolean;
  setPendingQuit: React.Dispatch<React.SetStateAction<boolean>>;
  pendingQuitTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  showStatus: (msg: string) => void;
  onQuit: () => void;
  onOpenTask?: (task: Task) => void;
  refreshTasks: () => Promise<void>;
  // Handlers
  handleCompleteTask: () => Promise<void>;
  handleBulkComplete: () => Promise<void>;
  handleSetPriority: (priority: 1 | 2 | 3 | 4) => Promise<void>;
  handleUndo: () => Promise<void>;
  handleRedo: () => Promise<void>;
  handleDuplicateTask: () => Promise<void>;
  handleOpenInBrowser: () => void;
  handleCopyUrl: () => void;
  toggleSelection: () => void;
  handleRangeSelect: () => void;
  // Plugin
  pluginExtensions?: ExtensionRegistry | null;
  pluginKeybindingContextMap?: Map<string, PluginContext>;
}

export interface KeyBinding {
  key: string;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  condition?: () => boolean;
  action: () => void;
  description?: string;
}

function buildKeybindings(opts: UseKeyboardHandlerOptions): KeyBinding[] {
  const {
    setModal,
    selectedTask,
    selectedIds,
    handleCompleteTask,
    handleBulkComplete,
    handleSetPriority,
    handleUndo,
    handleRedo,
    handleDuplicateTask,
    handleOpenInBrowser,
    handleCopyUrl,
    refreshTasks,
    showStatus,
    setFilterProjectId,
    setFilterSectionId,
    setFilterLabel,
    setFilterView,
    setApiFilteredTasks,
    setTaskIndex,
  } = opts;

  const hasSelection = selectedIds.size > 0;
  const hasTask = !!selectedTask;
  const hasTaskOrSelection = hasTask || hasSelection;

  const resetFilters = () => {
    setFilterProjectId(undefined);
    setFilterSectionId(undefined);
    setFilterLabel(undefined);
    setApiFilteredTasks(null);
    setTaskIndex(0);
  };

  return [
    // Priority keys
    { key: "1", action: () => handleSetPriority(1), description: "Set priority 1 (normal)" },
    { key: "2", action: () => handleSetPriority(2), description: "Set priority 2" },
    { key: "3", action: () => handleSetPriority(3), description: "Set priority 3" },
    { key: "4", action: () => handleSetPriority(4), description: "Set priority 4 (urgent)" },

    // Undo/Redo
    { key: "u", action: () => { handleUndo(); }, description: "Undo last action" },
    { key: "U", shift: true, action: () => { handleRedo(); }, description: "Redo last action" },

    // Duplicate
    { key: "Y", shift: true, action: () => { handleDuplicateTask(); }, description: "Duplicate task" },

    // Add/Create
    { key: "a", action: () => setModal("add"), description: "Quick add task" },
    { key: "N", shift: true, action: () => setModal("createFull"), description: "Create task (full editor)" },
    { key: "A", shift: true, action: () => setModal("addSubtask"), condition: () => hasTask, description: "Add subtask" },

    // Complete
    {
      key: "c",
      action: () => {
        if (hasSelection) {
          handleBulkComplete();
        } else if (hasTask) {
          handleCompleteTask();
        }
      },
      description: "Complete task(s)",
    },

    // Delete
    {
      key: "d",
      action: () => {
        if (hasSelection) {
          setModal("bulkDelete");
        } else if (hasTask) {
          setModal("delete");
        }
      },
      description: "Delete task(s)",
    },

    // Deadline
    { key: "D", shift: true, action: () => setModal("deadline"), condition: () => hasTaskOrSelection, description: "Set deadline" },

    // Due date
    { key: "t", action: () => setModal("due"), condition: () => hasTaskOrSelection, description: "Set due date" },

    // Move
    { key: "m", action: () => setModal("move"), condition: () => hasTaskOrSelection, description: "Move task(s)" },

    // Label
    { key: "l", action: () => setModal("label"), condition: () => hasTaskOrSelection, description: "Set label" },

    // Open in browser
    { key: "o", action: () => handleOpenInBrowser(), description: "Open in browser" },

    // Copy URL
    { key: "y", action: () => handleCopyUrl(), description: "Copy task URL" },

    // Search
    { key: "/", action: () => setModal("search"), description: "Search tasks" },

    // Filter
    { key: "f", action: () => setModal("filter"), description: "Filter tasks" },

    // Sort
    { key: "s", action: () => setModal("sort"), description: "Sort tasks" },

    // Help
    { key: "?", action: () => setModal("help"), description: "Show help" },

    // Command palette
    { key: ":", action: () => setModal("command"), description: "Command palette" },

    // Edit
    { key: "e", action: () => setModal("editFull"), condition: () => hasTask, description: "Edit task (full editor)" },

    // Rename
    { key: "r", action: () => setModal("rename"), condition: () => hasTask, description: "Rename task" },

    // Refresh
    {
      key: "R",
      shift: true,
      action: () => {
        refreshTasks();
        showStatus("Refreshing...");
      },
      description: "Refresh tasks",
    },

    // Quick view filters
    {
      key: "!",
      action: () => {
        resetFilters();
        setFilterView("Inbox");
      },
      description: "View: Inbox",
    },
    {
      key: "@",
      action: () => {
        resetFilters();
        setFilterView("Today");
      },
      description: "View: Today",
    },
    {
      key: "#",
      action: () => {
        resetFilters();
        setFilterView("Upcoming");
      },
      description: "View: Upcoming",
    },
  ];
}

export function useKeyboardHandler(opts: UseKeyboardHandlerOptions) {
  const {
    modal,
    activePanel,
    setActivePanel,
    selectedTask,
    selectedIds,
    setSelectedIds,
    filteredTasks,
    rangeSelectAnchor,
    setRangeSelectAnchor,
    searchQuery,
    setSearchQuery,
    apiFilteredTasks,
    setApiFilteredTasks,
    setFilterView,
    setTaskIndex,
    pendingQuit,
    setPendingQuit,
    pendingQuitTimerRef,
    showStatus,
    onQuit,
    onOpenTask,
    toggleSelection,
    handleRangeSelect,
    pluginExtensions,
    pluginKeybindingContextMap,
  } = opts;

  const bindings = buildKeybindings(opts);

  useInput((input, key) => {
    if (modal === "search" || modal === "command") {
      return;
    }
    if (modal !== "none") return;

    // --- Navigation & special keys (kept as direct if/else) ---

    if (key.tab) {
      setActivePanel((p) => (p === "sidebar" ? "tasks" : "sidebar"));
      return;
    }
    if (input === "h" && activePanel === "tasks") {
      setActivePanel("sidebar");
      return;
    }
    if (input === "l" && activePanel === "sidebar") {
      setActivePanel("tasks");
      return;
    }
    if (input === "q") {
      if (selectedIds.size > 0 && !pendingQuit) {
        setPendingQuit(true);
        showStatus("Press q again to quit (selections will be lost)");
        if (pendingQuitTimerRef.current) clearTimeout(pendingQuitTimerRef.current);
        pendingQuitTimerRef.current = setTimeout(() => setPendingQuit(false), 2000);
        return;
      }
      if (pendingQuitTimerRef.current) clearTimeout(pendingQuitTimerRef.current);
      onQuit();
      return;
    }

    if (activePanel === "tasks") {
      if (input !== "q" && pendingQuit) {
        setPendingQuit(false);
        if (pendingQuitTimerRef.current) clearTimeout(pendingQuitTimerRef.current);
      }

      // Escape handling (complex interaction logic)
      if (key.escape) {
        if (rangeSelectAnchor !== null) {
          setRangeSelectAnchor(null);
          showStatus("");
          return;
        }
        if (selectedIds.size > 0) {
          setSelectedIds(new Set());
          showStatus("");
          return;
        }
        if (searchQuery) {
          setSearchQuery("");
          showStatus("");
          return;
        }
        if (apiFilteredTasks !== null) {
          setApiFilteredTasks(null);
          setFilterView("Inbox");
          setTaskIndex(0);
          showStatus("");
          return;
        }
        return;
      }

      // Ctrl+A: select all
      if (key.ctrl && input === "a") {
        const allIds = new Set(filteredTasks.map((t) => t.id));
        setSelectedIds(allIds);
        showStatus(`${allIds.size} tasks selected`);
        return;
      }

      // Ctrl+N: deselect all
      if (key.ctrl && input === "n") {
        setSelectedIds(new Set());
        setRangeSelectAnchor(null);
        showStatus("");
        return;
      }

      // Space: toggle selection
      if (input === " ") {
        toggleSelection();
        return;
      }

      // v: range select
      if (input === "v") {
        handleRangeSelect();
        return;
      }

      // Enter: open task
      if (key.return && selectedTask && onOpenTask) {
        onOpenTask(selectedTask);
        return;
      }

      // --- Keybinding registry lookup for action keys ---
      const binding = bindings.find((b) => {
        if (b.key !== input) return false;
        if (b.shift && !key.shift) return false;
        if (b.ctrl && !key.ctrl) return false;
        if (b.meta && !key.meta) return false;
        if (b.condition && !b.condition()) return false;
        return true;
      });
      if (binding) {
        binding.action();
        return;
      }

      // Plugin keybindings (fallback)
      if (pluginExtensions) {
        const keyStr = key.ctrl ? `ctrl+${input}` : input;
        const pluginBinding = pluginExtensions.getKeybindings().find((k) => k.key === keyStr);
        if (pluginBinding) {
          const ctx = pluginKeybindingContextMap?.get(pluginBinding.key);
          if (ctx) {
            pluginBinding
              .action(ctx, selectedTask ?? null)
              .then((result) => {
                if (result?.statusMessage) showStatus(result.statusMessage);
              })
              .catch((err) => {
                console.warn("[plugin-keybinding]", err);
                showStatus(`Plugin error: ${err instanceof Error ? err.message : "unknown"}`);
              });
          }
        }
      }
    }
  });
}
