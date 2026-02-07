import { useMemo, useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { Task } from "../../api/types.ts";
import type { TaskColumnDefinition, PluginContext } from "../../plugins/types.ts";
import { TaskRow } from "./TaskRow.tsx";

interface TaskListProps {
  tasks: Task[];
  selectedIndex: number;
  isFocused: boolean;
  onIndexChange: (index: number) => void;
  selectedIds?: Set<string>;
  viewHeight?: number;
  sortField?: string;
  searchQuery?: string;
  pluginColumns?: TaskColumnDefinition[];
  pluginColumnContextMap?: Map<string, PluginContext>;
}

interface FlatTask {
  task: Task;
  depth: number;
}

function buildTree(tasks: Task[]): FlatTask[] {
  const byParent = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const parentKey = t.parent_id ?? null;
    const existing = byParent.get(parentKey);
    if (existing) {
      existing.push(t);
    } else {
      byParent.set(parentKey, [t]);
    }
  }

  const taskIds = new Set(tasks.map((t) => t.id));
  const result: FlatTask[] = [];

  function walk(parentId: string | null, depth: number) {
    const children = byParent.get(parentId);
    if (!children) return;
    for (const child of children) {
      result.push({ task: child, depth });
      walk(child.id, depth + 1);
    }
  }

  // Start with tasks whose parent is null or whose parent is not in the current set
  const roots = tasks.filter((t) => t.parent_id === null || !taskIds.has(t.parent_id));

  // Walk from roots
  for (const root of roots) {
    result.push({ task: root, depth: 0 });
    walk(root.id, 1);
  }

  // Add any orphans (tasks whose parent is in set but weren't reached — shouldn't happen, but safety)
  const visited = new Set(result.map((r) => r.task.id));
  for (const t of tasks) {
    if (!visited.has(t.id)) {
      result.push({ task: t, depth: 0 });
    }
  }

  return result;
}

export function TaskList({
  tasks,
  selectedIndex,
  isFocused,
  onIndexChange,
  selectedIds,
  viewHeight: viewHeightProp,
  sortField,
  searchQuery,
  pluginColumns,
  pluginColumnContextMap,
}: TaskListProps) {
  const { stdout } = useStdout();
  // Reserve lines for header, border, status bar, etc. (~8 lines overhead)
  const dynamicHeight = stdout?.rows ? Math.max(5, stdout.rows - 8) : 20;
  const viewHeight = viewHeightProp ?? dynamicHeight;
  const flatTasks = useMemo(() => buildTree(tasks), [tasks]);

  const [pendingG, setPendingG] = useState(false);
  const pendingGTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pendingG) {
      pendingGTimer.current = setTimeout(() => setPendingG(false), 1000);
      return () => { if (pendingGTimer.current) clearTimeout(pendingGTimer.current); };
    }
  }, [pendingG]);

  useEffect(() => {
    if (!isFocused) {
      setPendingG(false);
      if (pendingGTimer.current) clearTimeout(pendingGTimer.current);
    }
  }, [isFocused]);

  useInput(
    (input, key) => {
      if (!isFocused) return;

      if (pendingG) {
        setPendingG(false);
        if (input === "g") {
          // gg -> go to top
          onIndexChange(0);
          return;
        }
        // not gg, ignore
        return;
      }

      if (input === "g") {
        setPendingG(true);
        return;
      }
      if (input === "G") {
        onIndexChange(Math.max(0, flatTasks.length - 1));
        return;
      }
      if (key.ctrl && input === "d") {
        onIndexChange(Math.min(flatTasks.length - 1, selectedIndex + Math.floor(viewHeight / 2)));
        return;
      }
      if (key.ctrl && input === "u") {
        onIndexChange(Math.max(0, selectedIndex - Math.floor(viewHeight / 2)));
        return;
      }

      if (key.upArrow || input === "k") {
        onIndexChange(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow || input === "j") {
        onIndexChange(Math.min(flatTasks.length - 1, selectedIndex + 1));
      }
    },
  );

  if (flatTasks.length === 0) {
    return (
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="single"
        borderColor={isFocused ? "blue" : "gray"}
        paddingX={1}
        justifyContent="center"
        alignItems="center"
      >
        <Text color="gray">No tasks here</Text>
        <Box marginTop={1}>
          <Text color="gray" dimColor>Press </Text>
          <Text color="green">a</Text>
          <Text color="gray" dimColor> to add a task or </Text>
          <Text color="cyan">/</Text>
          <Text color="gray" dimColor> to search</Text>
        </Box>
      </Box>
    );
  }

  const halfHeight = Math.floor(viewHeight / 2);
  let scrollStart = Math.max(0, selectedIndex - halfHeight);
  const scrollEnd = Math.min(flatTasks.length, scrollStart + viewHeight);
  if (scrollEnd === flatTasks.length) {
    scrollStart = Math.max(0, flatTasks.length - viewHeight);
  }
  const visibleTasks = flatTasks.slice(scrollStart, scrollEnd);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor={isFocused ? "blue" : "gray"}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text bold color="blue">Tasks</Text>
        <Text color="gray">{` (${flatTasks.length})`}</Text>
      </Box>
      {sortField === "due" ? (
        (() => {
          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
          let lastGroup = "";
          // Track what group the task before the visible window was in
          for (let k = 0; k < scrollStart; k++) {
            const ft = flatTasks[k];
            if (ft && ft.depth === 0) {
              const d = ft.task.due?.date ?? "9999-99-99";
              if (d < todayStr) lastGroup = "Overdue";
              else if (d === todayStr) lastGroup = "Today";
              else if (d === tomorrowStr) lastGroup = "Tomorrow";
              else if (d === "9999-99-99") lastGroup = "No date";
              else lastGroup = d;
            }
          }
          return visibleTasks.map((item, i) => {
            const dueDate = item.task.due?.date ?? "9999-99-99";
            let group: string;
            if (dueDate < todayStr) group = "Overdue";
            else if (dueDate === todayStr) group = "Today";
            else if (dueDate === tomorrowStr) group = "Tomorrow";
            else if (dueDate === "9999-99-99") group = "No date";
            else group = dueDate;
            const showHeader = group !== lastGroup && item.depth === 0;
            if (showHeader) lastGroup = group;
            return (
              <Box key={item.task.id} flexDirection="column">
                {showHeader && (
                  <Text color="yellow" bold dimColor>{`-- ${group} --`}</Text>
                )}
                <TaskRow
                  task={item.task}
                  isSelected={scrollStart + i === selectedIndex}
                  isMarked={selectedIds?.has(item.task.id)}
                  depth={item.depth}
                  searchQuery={searchQuery}
                  pluginColumns={pluginColumns}
                  pluginColumnContextMap={pluginColumnContextMap}
                />
              </Box>
            );
          });
        })()
      ) : (
        visibleTasks.map((item, i) => (
          <TaskRow
            key={item.task.id}
            task={item.task}
            isSelected={scrollStart + i === selectedIndex}
            isMarked={selectedIds?.has(item.task.id)}
            depth={item.depth}
            searchQuery={searchQuery}
            pluginColumns={pluginColumns}
            pluginColumnContextMap={pluginColumnContextMap}
          />
        ))
      )}
      {flatTasks.length > viewHeight && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>
            {scrollStart + 1}-{scrollEnd}/{flatTasks.length}
          </Text>
        </Box>
      )}
    </Box>
  );
}
