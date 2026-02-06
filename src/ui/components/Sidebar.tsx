import { useState, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { Project, Label, Section } from "../../api/types.ts";
import { getSections } from "../../api/sections.ts";
import { mapTodoistColor } from "../../utils/colors.ts";

export interface SidebarItem {
  id: string;
  label: string;
  type: "builtin" | "separator" | "project" | "label" | "section" | "view";
  color?: string;
  taskCount?: number;
}

interface SidebarProps {
  projects: Project[];
  labels: Label[];
  tasks?: import("../../api/types.ts").Task[];
  activeProjectId?: string;
  selectedIndex: number;
  isFocused: boolean;
  onSelect: (item: SidebarItem) => void;
  onIndexChange: (index: number) => void;
  onNavigate?: (view: string) => void;
}

export function buildSidebarItems(
  projects: Project[],
  labels: Label[],
  tasks?: import("../../api/types.ts").Task[],
  sections?: Section[],
  activeProjectId?: string,
): SidebarItem[] {
  const taskCountByProject = new Map<string, number>();
  const taskCountByLabel = new Map<string, number>();
  if (tasks) {
    for (const t of tasks) {
      taskCountByProject.set(t.project_id, (taskCountByProject.get(t.project_id) ?? 0) + 1);
      for (const l of t.labels) {
        taskCountByLabel.set(l, (taskCountByLabel.get(l) ?? 0) + 1);
      }
    }
  }

  const inboxProject = projects.find((p) => p.is_inbox_project);
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayCount = tasks ? tasks.filter((t) => t.due?.date === localDate).length : undefined;
  const upcomingCount = tasks ? tasks.filter((t) => t.due !== null && t.due.date >= localDate).length : undefined;

  const items: SidebarItem[] = [
    { id: "inbox", label: "Inbox", type: "builtin", taskCount: inboxProject && tasks ? taskCountByProject.get(inboxProject.id) : undefined },
    { id: "today", label: "Today", type: "builtin", taskCount: todayCount },
    { id: "upcoming", label: "Upcoming", type: "builtin", taskCount: upcomingCount },
  ];

  if (projects.length > 0) {
    items.push({ id: "sep-projects", label: "--- Projects ---", type: "separator" });
    for (const p of projects) {
      if (!p.is_inbox_project) {
        items.push({
          id: p.id,
          label: p.name,
          type: "project",
          color: mapTodoistColor(p.color),
          taskCount: taskCountByProject.get(p.id),
        });
        // Show sections under the active project
        if (activeProjectId && p.id === activeProjectId && sections) {
          const projectSections = sections.filter((s) => s.project_id === p.id);
          for (const s of projectSections) {
            const sectionTaskCount = tasks
              ? tasks.filter((t) => t.section_id === s.id).length
              : undefined;
            items.push({
              id: `section-${s.id}`,
              label: `  ${s.name}`,
              type: "section",
              color: mapTodoistColor(p.color),
              taskCount: sectionTaskCount,
            });
          }
        }
      }
    }
  }

  if (labels.length > 0) {
    items.push({ id: "sep-labels", label: "--- Labels ---", type: "separator" });
    for (const l of labels) {
      items.push({
        id: l.id,
        label: `@${l.name}`,
        type: "label",
        color: mapTodoistColor(l.color),
        taskCount: taskCountByLabel.get(l.name),
      });
    }
  }

  items.push({ id: "sep-views", label: "--- Views ---", type: "separator" });
  items.push({ id: "view-stats", label: "Stats", type: "view", color: "cyan" });
  items.push({ id: "view-completed", label: "Completed", type: "view", color: "green" });
  items.push({ id: "view-activity", label: "Activity", type: "view", color: "yellow" });

  return items;
}

export function Sidebar({
  projects,
  labels,
  tasks,
  activeProjectId,
  selectedIndex,
  isFocused,
  onSelect,
  onIndexChange,
  onNavigate,
}: SidebarProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const { stdout } = useStdout();
  // Reserve lines for title, border, padding (~5 lines overhead)
  const sidebarViewHeight = Math.max(5, (stdout?.rows ?? 24) - 5);

  useEffect(() => {
    if (!activeProjectId) {
      setSections([]);
      return;
    }
    let cancelled = false;
    getSections(activeProjectId)
      .then((s) => {
        if (!cancelled) setSections(s);
      })
      .catch(() => {
        // Sections are optional; ignore errors
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  const items = buildSidebarItems(projects, labels, tasks, sections, activeProjectId);

  useInput(
    (input, key) => {
      if (!isFocused) return;

      if (key.upArrow || input === "k") {
        let next = selectedIndex - 1;
        while (next >= 0 && items[next]?.type === "separator") next--;
        if (next >= 0) onIndexChange(next);
      } else if (key.downArrow || input === "j") {
        let next = selectedIndex + 1;
        while (next < items.length && items[next]?.type === "separator") next++;
        if (next < items.length) onIndexChange(next);
      } else if (key.return) {
        const item = items[selectedIndex];
        if (item && item.type === "view" && onNavigate) {
          const viewName = item.id.replace("view-", "");
          onNavigate(viewName);
        } else if (item && item.type !== "separator" && item.type !== "view") {
          onSelect(item);
        }
      }
    },
  );

  return (
    <Box
      flexDirection="column"
      width={24}
      borderStyle="single"
      borderColor={isFocused ? "green" : "gray"}
      paddingX={1}
    >
      <Text bold color="green">Todoist</Text>
      <Box marginTop={1} flexDirection="column">
        {(() => {
          // Viewport-based scrolling
          let scrollStart = 0;
          if (items.length > sidebarViewHeight) {
            const half = Math.floor(sidebarViewHeight / 2);
            scrollStart = Math.max(0, selectedIndex - half);
            const scrollEnd = scrollStart + sidebarViewHeight;
            if (scrollEnd > items.length) {
              scrollStart = Math.max(0, items.length - sidebarViewHeight);
            }
          }
          const visibleItems = items.length > sidebarViewHeight
            ? items.slice(scrollStart, scrollStart + sidebarViewHeight)
            : items;

          return visibleItems.map((item, vi) => {
            const i = scrollStart + vi;
            if (item.type === "separator") {
              return (
                <Text key={item.id} color="gray" dimColor>
                  {item.label}
                </Text>
              );
            }
            const isSelected = i === selectedIndex && isFocused;
            const itemColor = isSelected ? "black" : item.color ?? (item.type === "builtin" ? "white" : "cyan");
            const countStr = item.taskCount != null ? ` (${item.taskCount})` : "";
            const prefix = i === selectedIndex ? "> " : "  ";
            const maxLabelLen = 24 - 2 - prefix.length - countStr.length; // sidebar width - padding - prefix - count
            const displayLabel = item.label.length > maxLabelLen && maxLabelLen > 3
              ? item.label.slice(0, maxLabelLen - 1) + "\u2026"
              : item.label;
            return (
              <Text
                key={item.id}
                backgroundColor={isSelected ? "green" : undefined}
                color={itemColor}
                bold={isSelected}
              >
                {prefix}{displayLabel}<Text color={isSelected ? "black" : "gray"}>{countStr}</Text>
              </Text>
            );
          });
        })()}
      </Box>
    </Box>
  );
}
