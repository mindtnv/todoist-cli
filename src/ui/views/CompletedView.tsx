import { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { getCompletedTasks } from "../../api/completed.ts";
import { reopenTask } from "../../api/tasks.ts";
import type { CompletedTask } from "../../api/types.ts";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { ViewShell } from "../components/ViewShell.tsx";
import { useAsyncData } from "../hooks/useAsyncData.ts";

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
  const { data: tasks, loading, error, refetch } = useAsyncData(() => getCompletedTasks());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmReopen, setConfirmReopen] = useState<CompletedTask | null>(null);
  const { stdout } = useStdout();

  const groups = groupByDate(tasks ?? []);

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

  // Find task lines (skip headers)
  const taskIndices = lines
    .map((line, idx) => (line.type === "task" ? idx : -1))
    .filter((idx) => idx >= 0);

  const handleReopen = async (task: CompletedTask) => {
    setConfirmReopen(null);
    setStatusMessage("Reopening task...");
    try {
      await reopenTask(task.task_id);
      setStatusMessage(`Task "${task.content}" reopened successfully`);
      setTimeout(() => setStatusMessage(null), 3000);
      setSelectedIndex(0);
      setScrollOffset(0);
      refetch();
    } catch (err) {
      setStatusMessage(`Error: ${err instanceof Error ? err.message : "Failed to reopen task"}`);
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  useInput((input, key) => {
    // Don't process input if confirm dialog is open
    if (confirmReopen) return;

    if (key.escape || input === "q") {
      onBack();
      return;
    }

    // Navigate to next task (skip headers)
    if (input === "j" || key.downArrow) {
      const currentPos = taskIndices.indexOf(selectedIndex);
      const nextPos = currentPos === -1 ? 0 : currentPos + 1;
      if (nextPos < taskIndices.length) {
        const nextIdx = taskIndices[nextPos]!;
        setSelectedIndex(nextIdx);
        if (nextIdx >= scrollOffset + viewHeight) {
          setScrollOffset(nextIdx - viewHeight + 1);
        }
      }
      return;
    }

    // Navigate to previous task (skip headers)
    if (input === "k" || key.upArrow) {
      const currentPos = taskIndices.indexOf(selectedIndex);
      if (currentPos > 0) {
        const prevIdx = taskIndices[currentPos - 1]!;
        setSelectedIndex(prevIdx);
        if (prevIdx < scrollOffset) {
          setScrollOffset(prevIdx);
        }
      }
      return;
    }

    // Reopen task
    if (key.return || input === "c") {
      const line = lines[selectedIndex];
      if (line && line.type === "task") {
        setConfirmReopen(line.task);
      }
      return;
    }

    // Page down
    if (key.ctrl && input === "d") {
      const currentPos = taskIndices.indexOf(selectedIndex);
      const jumpAmount = Math.floor(viewHeight / 2);
      const newPos = Math.min(currentPos + jumpAmount, taskIndices.length - 1);
      const newIdx = taskIndices[newPos];
      if (newIdx !== undefined) {
        setSelectedIndex(newIdx);
        if (newIdx >= scrollOffset + viewHeight) {
          setScrollOffset(Math.min(newIdx - viewHeight + 1, maxScroll));
        }
      }
      return;
    }

    // Page up
    if (key.ctrl && input === "u") {
      const currentPos = taskIndices.indexOf(selectedIndex);
      const jumpAmount = Math.floor(viewHeight / 2);
      const newPos = Math.max(currentPos - jumpAmount, 0);
      const newIdx = taskIndices[newPos];
      if (newIdx !== undefined) {
        setSelectedIndex(newIdx);
        if (newIdx < scrollOffset) {
          setScrollOffset(Math.max(newIdx, 0));
        }
      }
      return;
    }

    // Go to last task
    if (input === "G") {
      const lastIdx = taskIndices[taskIndices.length - 1];
      if (lastIdx !== undefined) {
        setSelectedIndex(lastIdx);
        setScrollOffset(Math.min(lastIdx, maxScroll));
      }
      return;
    }

    // Go to first task
    if (input === "g") {
      const firstIdx = taskIndices[0];
      if (firstIdx !== undefined) {
        setSelectedIndex(firstIdx);
        setScrollOffset(0);
      }
      return;
    }
  });

  if (loading || error) {
    return (
      <ViewShell title="Completed Tasks" onBack={onBack} loading={loading} error={error}>
        <></>
      </ViewShell>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <ViewShell title="Completed Tasks" onBack={onBack} handleKeys={false}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Completed Tasks</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="gray">No completed tasks found</Text>
        </Box>
      </ViewShell>
    );
  }

  const visibleLines = lines.slice(scrollOffset, scrollOffset + viewHeight);

  const footerContent = (
    <>
      {statusMessage && (
        <Box borderStyle="single" borderColor="green" paddingX={1}>
          <Text>{statusMessage}</Text>
        </Box>
      )}

      {confirmReopen && (
        <ConfirmDialog
          message={`Reopen task "${confirmReopen.content}"?`}
          onConfirm={() => handleReopen(confirmReopen)}
          onCancel={() => setConfirmReopen(null)}
        />
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
        <Text>
          <Text color="gray">[c]</Text><Text> reopen  </Text>
          <Text color="gray">[j/k]</Text><Text> navigate  </Text>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Text>
        {maxScroll > 0 && (
          <Text color="gray" dimColor>
            {`${scrollOffset + 1}-${Math.min(scrollOffset + viewHeight, lines.length)}/${lines.length}`}
          </Text>
        )}
      </Box>
    </>
  );

  return (
    <ViewShell title="Completed Tasks" onBack={onBack} handleKeys={false} footer={footerContent}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Completed Tasks</Text>
        <Text color="gray">{`  (${tasks?.length ?? 0} tasks)`}</Text>
      </Box>

      <Box flexDirection="column">
        {visibleLines.map((line, i) => {
          const absoluteIndex = scrollOffset + i;
          const isSelected = absoluteIndex === selectedIndex;

          if (line.type === "header") {
            return (
              <Text key={`h-${line.label}-${i}`} bold color="yellow">
                {`-- ${line.label} --`}
              </Text>
            );
          }
          return (
            <Box key={`t-${line.task.id}-${i}`} justifyContent="space-between" backgroundColor={isSelected ? "blue" : undefined}>
              <Text>
                <Text color="green">{"\u2713"} </Text>
                <Text>{line.task.content}</Text>
              </Text>
              <Text color="gray">{formatTime(line.task.completed_at)}</Text>
            </Box>
          );
        })}
      </Box>
    </ViewShell>
  );
}
