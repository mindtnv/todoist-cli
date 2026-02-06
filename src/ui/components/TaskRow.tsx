import { Box, Text } from "ink";
import type { Task } from "../../api/types.ts";

interface TaskRowProps {
  task: Task;
  isSelected: boolean;
  isMarked?: boolean;
  depth?: number;
}

const priorityColors: Record<number, string> = {
  4: "red",
  3: "yellow",
  2: "blue",
  1: "white",
};

function formatDeadlineShort(dateStr: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = dateStr.split("-").map(Number);
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return `${months[m - 1]} ${d}`;
}

function isDeadlineUrgent(dateStr: string): boolean {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const deadline = new Date(dateStr + "T00:00:00");
  const now = new Date(todayStr + "T00:00:00");
  const diffDays = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 3;
}

export function TaskRow({ task, isSelected, isMarked = false, depth = 0 }: TaskRowProps) {
  const checkbox = task.is_completed ? "\u2611" : "\u2610";
  const prioColor = priorityColors[task.priority] ?? "white";
  const dueText = task.due ? task.due.date : "";
  const recurringIndicator = task.due?.is_recurring ? " \u21BB" : "";
  const labelText = task.labels.length > 0 ? task.labels.map((l) => `@${l}`).join(" ") : "";
  const marker = isMarked ? "\u25cf " : "  ";
  const indent = depth > 0 ? "  ".repeat(depth) + "\u2514 " : "";
  const deadlineText = task.deadline ? formatDeadlineShort(task.deadline.date) : "";
  const deadlineUrgent = task.deadline ? isDeadlineUrgent(task.deadline.date) : false;

  // Truncate content to fit terminal width
  const termWidth = process.stdout.columns ?? 80;
  const markerWidth = 2; // "* " or "  "
  const indentWidth = indent.length;
  const checkboxPrioWidth = 5; // "X pN "
  const dueWidth = dueText ? dueText.length + 3 : 0; // " [date]"
  const recurringWidth = recurringIndicator ? 2 : 0;
  const deadlineWidth = deadlineText ? deadlineText.length + 3 : 0; // " F date"
  const labelWidth = labelText ? labelText.length + 1 : 0;
  const sidebarWidth = 26; // sidebar + border
  const borderPadding = 4; // task list borders/padding
  const overhead = sidebarWidth + borderPadding + markerWidth + indentWidth + checkboxPrioWidth + dueWidth + recurringWidth + deadlineWidth + labelWidth + 1;
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
        <Text color={prioColor}>{checkbox} p{task.priority}</Text>
        {" "}
        <Text>{content}</Text>
        {dueText ? <Text color="cyan">{` [${dueText}]`}</Text> : null}
        {recurringIndicator ? <Text color="cyan">{recurringIndicator}</Text> : null}
        {deadlineText ? <Text color={deadlineUrgent ? "red" : "magenta"} bold={deadlineUrgent}>{` \u2691 ${deadlineText}`}</Text> : null}
        {labelText ? <Text color="magenta">{` ${labelText}`}</Text> : null}
        {" "}
      </Text>
    </Box>
  );
}
