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

export function useKeyboardHandler({
  modal,
  activePanel,
  setActivePanel,
  setModal,
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
}: UseKeyboardHandlerOptions) {
  useInput((input, key) => {
    if (modal === "search" || modal === "command") {
      return;
    }
    if (modal !== "none") return;

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
      if (key.ctrl && input === "a") {
        const allIds = new Set(filteredTasks.map((t) => t.id));
        setSelectedIds(allIds);
        showStatus(`${allIds.size} tasks selected`);
        return;
      }
      if (key.ctrl && input === "n") {
        setSelectedIds(new Set());
        setRangeSelectAnchor(null);
        showStatus("");
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
      if (input === "1" || input === "2" || input === "3" || input === "4") {
        handleSetPriority(Number(input) as 1 | 2 | 3 | 4);
        return;
      }
      if (input === "u") {
        handleUndo();
        return;
      }
      if (input === "U") {
        handleRedo();
        return;
      }
      if (input === "Y") {
        handleDuplicateTask();
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
        if (selectedTask || selectedIds.size > 0) {
          setModal("label");
        }
      } else if (input === "o") {
        handleOpenInBrowser();
      } else if (input === "y") {
        handleCopyUrl();
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
        if (selectedTask) {
          setModal("rename");
        }
      } else if (input === "R") {
        refreshTasks();
        showStatus("Refreshing...");
      } else if (input === "!") {
        setFilterProjectId(undefined);
        setFilterSectionId(undefined);
        setFilterLabel(undefined);
        setFilterView("Inbox");
        setApiFilteredTasks(null);
        setTaskIndex(0);
      } else if (input === "@") {
        setFilterProjectId(undefined);
        setFilterSectionId(undefined);
        setFilterLabel(undefined);
        setFilterView("Today");
        setApiFilteredTasks(null);
        setTaskIndex(0);
      } else if (input === "#") {
        setFilterProjectId(undefined);
        setFilterSectionId(undefined);
        setFilterLabel(undefined);
        setFilterView("Upcoming");
        setApiFilteredTasks(null);
        setTaskIndex(0);
      } else if (pluginExtensions) {
        const keyStr = key.ctrl ? `ctrl+${input}` : input;
        const binding = pluginExtensions.getKeybindings().find(k => k.key === keyStr);
        if (binding) {
          const ctx = pluginKeybindingContextMap?.get(binding.key);
          if (ctx) {
            binding.action(ctx, selectedTask ?? null).then((result) => {
              if (result?.statusMessage) showStatus(result.statusMessage);
            }).catch((err) => {
              console.warn("[plugin-keybinding]", err);
              showStatus(`Plugin error: ${err instanceof Error ? err.message : "unknown"}`);
            });
          }
        }
      }
    }
  });
}
