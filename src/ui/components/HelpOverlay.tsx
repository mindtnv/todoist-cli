import { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";

interface HelpOverlayProps {
  onClose: () => void;
}

interface KeyBinding {
  key: string;
  description: string;
}

interface Section {
  title: string;
  bindings: KeyBinding[];
}

const helpSections: Section[] = [
  {
    title: "Navigation",
    bindings: [
      { key: "j / Down", description: "Move down" },
      { key: "k / Up", description: "Move up" },
      { key: "gg", description: "Go to first task" },
      { key: "G", description: "Go to last task" },
      { key: "Ctrl-d", description: "Page down" },
      { key: "Ctrl-u", description: "Page up" },
      { key: "Tab", description: "Switch panel" },
      { key: "Enter", description: "Open task detail" },
    ],
  },
  {
    title: "Task Actions",
    bindings: [
      { key: "a", description: "Add new task" },
      { key: "A (Shift-a)", description: "Add subtask" },
      { key: "e", description: "Edit task (full modal)" },
      { key: "c", description: "Complete task" },
      { key: "d", description: "Delete task" },
      { key: "1 / 2 / 3 / 4", description: "Set priority" },
      { key: "t", description: "Set due date" },
      { key: "D (Shift-d)", description: "Set deadline" },
      { key: "m", description: "Move to project" },
      { key: "l", description: "Edit labels" },
      { key: "o", description: "Open in browser" },
      { key: "u", description: "Undo last action (10s)" },
      { key: "r", description: "Refresh tasks" },
    ],
  },
  {
    title: "Selection",
    bindings: [
      { key: "Space", description: "Toggle select task" },
      { key: "v", description: "Range select (press twice)" },
      { key: "Ctrl-a", description: "Select all visible" },
      { key: "Ctrl-n", description: "Clear all selection" },
      { key: "c", description: "Complete selected (multi)" },
      { key: "d", description: "Delete selected (multi)" },
      { key: "Esc", description: "Clear selection" },
    ],
  },
  {
    title: "Search & Sort",
    bindings: [
      { key: "/", description: "Fuzzy search tasks" },
      { key: "s", description: "Open sort menu" },
      { key: "f", description: "API filter query" },
    ],
  },
  {
    title: "Detail View",
    bindings: [
      { key: "n", description: "Add comment" },
      { key: "o", description: "Open in browser" },
      { key: "j / k", description: "Scroll content" },
      { key: "c", description: "Complete task" },
      { key: "d", description: "Delete task" },
      { key: "Esc", description: "Go back" },
    ],
  },
  {
    title: "General",
    bindings: [
      { key: ":", description: "Command palette" },
      { key: "?", description: "Toggle this help" },
      { key: "q", description: "Quit" },
      { key: "Esc", description: "Cancel / Go back" },
    ],
  },
];

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  const [scrollOffset, setScrollOffset] = useState(0);
  const { stdout } = useStdout();
  // Build flat list of all lines for scrolling
  const allLines: Array<{ type: "title"; text: string } | { type: "binding"; key: string; desc: string }> = [];
  for (const section of helpSections) {
    allLines.push({ type: "title", text: section.title });
    for (const b of section.bindings) {
      allLines.push({ type: "binding", key: b.key, desc: b.description });
    }
  }
  const viewHeight = Math.max(5, (stdout?.rows ?? 24) - 10);
  const maxScroll = Math.max(0, allLines.length - viewHeight);

  useInput((input, key) => {
    if (input === "?" || input === "q" || key.escape) {
      onClose();
      return;
    }
    if (input === "j" || key.downArrow) {
      setScrollOffset((s) => Math.min(s + 1, maxScroll));
      return;
    }
    if (input === "k" || key.upArrow) {
      setScrollOffset((s) => Math.max(0, s - 1));
      return;
    }
  });

  const visibleLines = allLines.slice(scrollOffset, scrollOffset + viewHeight);

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      width={50}
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">Keyboard Shortcuts</Text>
      </Box>
      {visibleLines.map((line, i) => {
        if (line.type === "title") {
          return (
            <Text key={`t-${i}`} bold color="yellow">{line.text}</Text>
          );
        }
        return (
          <Box key={`b-${i}`}>
            <Box width={16}>
              <Text color="green">{line.key}</Text>
            </Box>
            <Text>{line.desc}</Text>
          </Box>
        );
      })}
      <Box justifyContent="center" marginTop={1}>
        <Text color="gray" dimColor>j/k scroll | ? or Esc or q to close</Text>
      </Box>
    </Box>
  );
}
