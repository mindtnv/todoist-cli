import { useState, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { getCompletedTasks } from "../../api/completed.ts";
import type { CompletedTask } from "../../api/types.ts";

interface CompletedViewProps {
  onBack: () => void;
}

interface DateGroup {
  label: string;
  tasks: CompletedTask[];
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  return `${h}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

function groupByDate(tasks: CompletedTask[]): DateGroup[] {
  const groups = new Map<string, CompletedTask[]>();

  for (const task of tasks) {
    const d = new Date(task.completed_at);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const existing = groups.get(dateKey) ?? [];
    existing.push(task);
    groups.set(dateKey, existing);
  }

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  const result: DateGroup[] = [];
  const sortedKeys = [...groups.keys()].sort((a, b) => b.localeCompare(a));

  for (const key of sortedKeys) {
    let label: string;
    if (key === todayKey) {
      label = "Today";
    } else if (key === yesterdayKey) {
      label = "Yesterday";
    } else {
      label = key;
    }
    result.push({ label, tasks: groups.get(key)! });
  }

  return result;
}

export function CompletedView({ onBack }: CompletedViewProps) {
  const [tasks, setTasks] = useState<CompletedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const { stdout } = useStdout();

  useEffect(() => {
    let cancelled = false;
    getCompletedTasks()
      .then((items) => {
        if (!cancelled) {
          setTasks(items);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load completed tasks");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = groupByDate(tasks);

  // Build flat list of renderable lines for scrolling
  const lines: Array<{ type: "header"; label: string } | { type: "task"; task: CompletedTask }> = [];
  for (const group of groups) {
    lines.push({ type: "header", label: group.label });
    for (const task of group.tasks) {
      lines.push({ type: "task", task });
    }
  }

  const viewHeight = Math.max((stdout?.rows ?? 24) - 8, 5);
  const maxScroll = Math.max(0, lines.length - viewHeight);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
      return;
    }
    if (input === "j" || key.downArrow) {
      setScrollOffset((s) => Math.min(s + 1, maxScroll));
      return;
    }
    if (input === "k" || key.upArrow) {
      setScrollOffset((s) => Math.max(s - 1, 0));
      return;
    }
    if (key.ctrl && input === "d") {
      setScrollOffset((s) => Math.min(s + Math.floor(viewHeight / 2), maxScroll));
      return;
    }
    if (key.ctrl && input === "u") {
      setScrollOffset((s) => Math.max(s - Math.floor(viewHeight / 2), 0));
      return;
    }
    if (input === "G") {
      setScrollOffset(maxScroll);
      return;
    }
    if (input === "g") {
      setScrollOffset(0);
      return;
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="cyan">Completed Tasks</Text>
          <Box marginTop={1}>
            <Text color="gray">Loading...</Text>
          </Box>
        </Box>
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="cyan">Completed Tasks</Text>
          <Box marginTop={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        </Box>
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Box>
      </Box>
    );
  }

  if (tasks.length === 0) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="cyan">Completed Tasks</Text>
          <Box marginTop={1}>
            <Text color="gray">No completed tasks found</Text>
          </Box>
        </Box>
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Box>
      </Box>
    );
  }

  const visibleLines = lines.slice(scrollOffset, scrollOffset + viewHeight);

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Completed Tasks</Text>
          <Text color="gray">{`  (${tasks.length} tasks)`}</Text>
        </Box>

        <Box flexDirection="column">
          {visibleLines.map((line, i) => {
            if (line.type === "header") {
              return (
                <Text key={`h-${line.label}-${i}`} bold color="yellow">
                  {`-- ${line.label} --`}
                </Text>
              );
            }
            return (
              <Box key={`t-${line.task.id}-${i}`} justifyContent="space-between">
                <Text>
                  <Text color="green">{"\u2713"} </Text>
                  <Text>{line.task.content}</Text>
                </Text>
                <Text color="gray">{formatTime(line.task.completed_at)}</Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
        <Text>
          <Text color="gray">[j/k]</Text><Text> scroll  </Text>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Text>
        {maxScroll > 0 && (
          <Text color="gray" dimColor>
            {`${scrollOffset + 1}-${Math.min(scrollOffset + viewHeight, lines.length)}/${lines.length}`}
          </Text>
        )}
      </Box>
    </Box>
  );
}
