import { useState, useCallback, useMemo } from "react";
import type { Task, Project, Label, Section } from "../../api/types.ts";
import type { SidebarItem } from "../components/Sidebar.tsx";
import type { SortField } from "../../utils/sorting.ts";
import { sortTasks } from "../../utils/sorting.ts";
import { getTasks } from "../../api/tasks.ts";
import { getLocalDateString } from "../../utils/date-format.ts";
import type { Modal } from "../components/ModalManager.tsx";

interface UseFilterStateOptions {
  tasks: Task[];
  projects: Project[];
  labels: Label[];
  sections?: Section[];
  showStatus: (msg: string) => void;
  setModal: (modal: Modal) => void;
  setTaskIndex: React.Dispatch<React.SetStateAction<number>>;
  initialState?: {
    filterLabel?: string;
    filterProjectId?: string;
    filterSectionId?: string;
    filterView?: string;
    searchQuery?: string;
    sortField?: SortField;
    sortDirection?: "asc" | "desc";
  };
}

export function useFilterState({
  tasks,
  projects,
  labels,
  sections,
  showStatus,
  setModal,
  setTaskIndex,
  initialState,
}: UseFilterStateOptions) {
  const [filterLabel, setFilterLabel] = useState<string | undefined>(initialState?.filterLabel);
  const [filterProjectId, setFilterProjectId] = useState<string | undefined>(initialState?.filterProjectId);
  const [filterSectionId, setFilterSectionId] = useState<string | undefined>(initialState?.filterSectionId);
  const [filterView, setFilterView] = useState(initialState?.filterView ?? "Inbox");
  const [searchQuery, setSearchQuery] = useState(initialState?.searchQuery ?? "");
  const [apiFilteredTasks, setApiFilteredTasks] = useState<Task[] | null>(null);
  const [sortField, setSortField] = useState<SortField>(initialState?.sortField ?? "priority");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(initialState?.sortDirection ?? "asc");

  const baseTasks = useMemo(() => {
    if (filterView.startsWith("Filter: ") && apiFilteredTasks !== null) {
      return apiFilteredTasks;
    }
    const localDate = getLocalDateString();
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
    },
    [labels, setTaskIndex],
  );

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
    [showStatus, setModal, setTaskIndex],
  );

  const handleSearchSubmit = useCallback(
    (_value: string) => {
      setModal("none");
    },
    [setModal],
  );

  const handleSearchCancel = useCallback(() => {
    setSearchQuery("");
    setModal("none");
  }, [setModal]);

  const handleSortSelect = useCallback((field: SortField) => {
    if (field === sortField) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setModal("none");
    setTaskIndex(0);
  }, [sortField, setModal, setTaskIndex]);

  return {
    // State
    filterLabel,
    setFilterLabel,
    filterProjectId,
    setFilterProjectId,
    filterSectionId,
    setFilterSectionId,
    filterView,
    setFilterView,
    searchQuery,
    setSearchQuery,
    apiFilteredTasks,
    setApiFilteredTasks,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    // Computed
    filteredTasks,
    breadcrumbSegments,
    // Handlers
    handleSidebarSelect,
    handleFilterInput,
    handleSearchSubmit,
    handleSearchCancel,
    handleSortSelect,
  };
}
