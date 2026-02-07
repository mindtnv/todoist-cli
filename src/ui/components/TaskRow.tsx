import React, { memo } from "react";
import { Box, Text } from "ink";
import type { Task } from "../../api/types.ts";
import type { TaskColumnDefinition, PluginContext } from "../../plugins/types.ts";
import { formatRelativeDue, formatDeadlineShort, isDeadlineUrgent } from "../../utils/date-format.ts";

interface TaskRowProps {
  task: Task;
  isSelected: boolean;
  isMarked?: boolean;
  depth?: number;
  searchQuery?: string;
  pluginColumns?: TaskColumnDefinition[];
  pluginColumnContextMap?: Map<string, PluginContext>;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before ? <Text>{before}</Text> : null}
      <Text backgroundColor="yellow" color="black">{match}</Text>
      {after ? <Text>{after}</Text> : null}
    </>
  );
}

const priorityConfig: Record<number, { dot: string; color: string }> = {
  4: { dot: "\u25CF", color: "red" },
  3: { dot: "\u25CF", color: "yellow" },
  2: { dot: "\u25CF", color: "blue" },
  1: { dot: "\u25CB", color: "gray" },
};

function TaskRowInner({ task, isSelected, isMarked = false, depth = 0, searchQuery, pluginColumns, pluginColumnContextMap }: TaskRowProps) {
  const checkbox = task.is_completed ? "\u2611" : "\u2610";
  const prio = priorityConfig[task.priority] ?? { dot: "\u25CB", color: "gray" };
  const dueInfo = task.due ? formatRelativeDue(task.due.date) : null;
  const dueText = dueInfo ? dueInfo.text : "";
  const dueColor = dueInfo ? dueInfo.color : "cyan";
  const recurringIndicator = task.due?.is_recurring ? " \u21BB" : "";
  const labelText = task.labels.length > 0 ? task.labels.map((l) => `@${l}`).join(" ") : "";
  const marker = isMarked ? "\u25cf " : "  ";
  const indent = depth > 0 ? "  ".repeat(depth) + "\u2514 " : "";
  const deadlineText = task.deadline ? formatDeadlineShort(task.deadline.date) : "";
  const deadlineUrgent = task.deadline ? isDeadlineUrgent(task.deadline.date) : false;
  const commentCount = task.comment_count ?? 0;
  const commentText = commentCount > 0 ? `\u2709 ${commentCount}` : "";

  // Truncate content to fit terminal width
  const termWidth = process.stdout.columns ?? 80;
  const markerWidth = 2; // "* " or "  "
  const indentWidth = indent.length;
  const checkboxPrioWidth = 4; // "X D " (checkbox + space + dot + space)
  const dueWidth = dueText ? dueText.length + 3 : 0; // " [text]"
  const recurringWidth = recurringIndicator ? 2 : 0;
  const deadlineWidth = deadlineText ? deadlineText.length + 3 : 0; // " F date"
  const labelWidth = labelText ? labelText.length + 1 : 0;
  const commentWidth = commentText ? commentText.length + 1 : 0;
  // Sidebar width is dynamic (24-38), estimate from terminal width
  const sidebarWidth = Math.min(38, Math.max(24, Math.floor(termWidth * 0.25)));
  const borderPadding = 4; // task list borders/padding
  const pluginColumnsWidth = pluginColumns?.reduce((w, c) => w + (c.width ?? 8) + 1, 0) ?? 0;
  const overhead = sidebarWidth + borderPadding + markerWidth + indentWidth + checkboxPrioWidth + dueWidth + recurringWidth + deadlineWidth + labelWidth + commentWidth + pluginColumnsWidth + 1;
  const maxContent = Math.max(10, termWidth - overhead);
  const content = task.content.length > maxContent ? task.content.slice(0, maxContent - 1) + "\u2026" : task.content;

  return (
    <Box>
      <Text
        backgroundColor={isSelected && isMarked ? "magenta" : isSelected ? "blue" : isMarked ? "gray" : undefined}
        color={isSelected || isMarked ? "white" : undefined}
      >
        <Text color={isMarked ? "yellow" : "gray"}>{marker}</Text>
        {indent ? <Text color="gray" dimColor>{indent}</Text> : null}
        <Text>{checkbox} </Text>
        <Text color={prio.color}>{prio.dot}</Text>
        {" "}
        <Text strikethrough={task.is_completed}>{searchQuery ? highlightMatch(content, searchQuery) : content}</Text>
        {dueText ? <Text color={dueColor}>{` [${dueText}]`}</Text> : null}
        {recurringIndicator ? <Text color="cyan">{recurringIndicator}</Text> : null}
        {deadlineText ? <Text color={deadlineUrgent ? "red" : "magenta"} bold={deadlineUrgent}>{` \u2691 ${deadlineText}`}</Text> : null}
        {labelText ? <Text color="magenta">{` ${labelText}`}</Text> : null}
        {commentText ? <Text color="gray">{` ${commentText}`}</Text> : null}
        {pluginColumns?.map(col => {
          const colCtx = pluginColumnContextMap?.get(col.id);
          if (!colCtx) return null;
          const rawText = col.render(task, colCtx) ?? "";
          const colWidth = col.width ?? 8;
          const fixedText = rawText.length > colWidth ? rawText.slice(0, colWidth - 1) + "\u2026" : rawText.padEnd(colWidth);
          const textColor = col.color?.(task) ?? "dim";
          return <Text key={col.id} color={textColor}>{` ${fixedText}`}</Text>;
        })}
        {" "}
      </Text>
    </Box>
  );
}

function arePropsEqual(prev: TaskRowProps, next: TaskRowProps): boolean {
  if (prev.task.id !== next.task.id) return false;
  if (prev.task.content !== next.task.content) return false;
  if (prev.task.priority !== next.task.priority) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isMarked !== next.isMarked) return false;
  if ((prev.depth ?? 0) !== (next.depth ?? 0)) return false;

  // Compare due
  const prevDue = prev.task.due;
  const nextDue = next.task.due;
  if (prevDue?.date !== nextDue?.date || prevDue?.is_recurring !== nextDue?.is_recurring) return false;

  // Compare deadline
  if (prev.task.deadline?.date !== next.task.deadline?.date) return false;

  // Compare labels (array of strings)
  const prevLabels = prev.task.labels;
  const nextLabels = next.task.labels;
  if (prevLabels.length !== nextLabels.length) return false;
  for (let i = 0; i < prevLabels.length; i++) {
    if (prevLabels[i] !== nextLabels[i]) return false;
  }

  // Compare plugin column values
  if (prev.pluginColumns !== next.pluginColumns) return false;
  if (prev.pluginColumnContextMap !== next.pluginColumnContextMap) return false;

  if (prev.searchQuery !== next.searchQuery) return false;

  return true;
}

export const TaskRow = memo(TaskRowInner, arePropsEqual);
