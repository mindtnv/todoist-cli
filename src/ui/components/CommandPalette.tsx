import React, { useState, useMemo, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { DEFAULT_TERMINAL_COLS } from "../layout.ts";

export interface Command {
  name: string;
  description: string;
  action: () => void;
  category?: string;
  shortcut?: string;
}

interface CommandPaletteProps {
  commands: Command[];
  onCancel: () => void;
}

const CATEGORY_ORDER = ["task", "navigation", "view", "project", "template", "bulk", "general"];
const CATEGORY_LABELS: Record<string, string> = {
  task: "Task Actions",
  navigation: "Navigation",
  view: "Views",
  project: "Projects",
  template: "Templates",
  bulk: "Bulk Actions",
  general: "General",
};

function CommandRow({ cmd, isActive }: { cmd: Command; isActive: boolean }) {
  return (
    <Box justifyContent="space-between">
      <Text
        backgroundColor={isActive ? "cyan" : undefined}
        color={isActive ? "black" : "white"}
        bold={isActive}
      >
        {isActive ? "\u25B6 " : "  "}
        <Text bold={isActive}>{cmd.name}</Text>
        <Text color={isActive ? "black" : "gray"}>{`  ${cmd.description}`}</Text>
      </Text>
      {cmd.shortcut ? (
        <Text color={isActive ? "black" : "gray"} backgroundColor={isActive ? "cyan" : undefined} dimColor={!isActive}>
          {` ${cmd.shortcut}`}
        </Text>
      ) : null}
    </Box>
  );
}

export function CommandPalette({ commands, onCancel }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const scrollOffsetRef = useRef(0);

  // Filter commands by query
  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        (cmd.category ?? "").toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Reorder by category for grouped display; flat order when searching
  const ordered = useMemo(() => {
    if (query) return filtered;
    const groups = new Map<string, Command[]>();
    for (const cmd of filtered) {
      const cat = cmd.category ?? "general";
      const existing = groups.get(cat) ?? [];
      existing.push(cmd);
      groups.set(cat, existing);
    }
    const result: Command[] = [];
    for (const cat of CATEGORY_ORDER) {
      const items = groups.get(cat);
      if (items) result.push(...items);
    }
    for (const [cat, items] of groups) {
      if (CATEGORY_ORDER.includes(cat)) continue;
      result.push(...items);
    }
    return result;
  }, [filtered, query]);

  // Clamp selectedIndex when list shrinks
  useEffect(() => {
    if (ordered.length > 0 && selectedIndex >= ordered.length) {
      setSelectedIndex(ordered.length - 1);
    }
  }, [ordered.length, selectedIndex]);

  // Reset scroll when query changes
  useEffect(() => {
    scrollOffsetRef.current = 0;
  }, [query]);

  const maxVisible = 18;

  // Adjust scroll to keep selected item visible
  if (selectedIndex < scrollOffsetRef.current) {
    scrollOffsetRef.current = selectedIndex;
  } else if (selectedIndex >= scrollOffsetRef.current + maxVisible) {
    scrollOffsetRef.current = selectedIndex - maxVisible + 1;
  }
  scrollOffsetRef.current = Math.max(0, Math.min(
    scrollOffsetRef.current,
    Math.max(0, ordered.length - maxVisible),
  ));
  const scrollOffset = scrollOffsetRef.current;

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const cmd = ordered[selectedIndex];
      if (cmd) cmd.action();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(ordered.length - 1, i + 1));
      return;
    }
    if (key.backspace || key.delete) {
      if (cursor > 0) {
        setQuery((v) => v.slice(0, cursor - 1) + v.slice(cursor));
        setCursor((c) => c - 1);
        setSelectedIndex(0);
      }
      return;
    }
    if (key.leftArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((c) => Math.min(query.length, c + 1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setQuery((v) => v.slice(0, cursor) + input + v.slice(cursor));
      setCursor((c) => c + input.length);
      setSelectedIndex(0);
    }
  });

  const before = query.slice(0, cursor);
  const cursorChar = query[cursor] ?? " ";
  const after = query.slice(cursor + 1);

  // Visible slice
  const visibleCommands = ordered.slice(scrollOffset, scrollOffset + maxVisible);

  // Render items with category headers when not searching
  const renderItems = () => {
    const elements: React.ReactNode[] = [];
    let lastCategory = "";

    for (let vi = 0; vi < visibleCommands.length; vi++) {
      const cmd = visibleCommands[vi]!;
      const globalIdx = scrollOffset + vi;
      const cat = cmd.category ?? "general";

      if (!query && cat !== lastCategory) {
        if (lastCategory) elements.push(<Box key={`s-${cat}`} height={1} />);
        elements.push(
          <Text key={`h-${cat}`} color="yellow" bold>
            {"\u2500\u2500 "}{CATEGORY_LABELS[cat] ?? cat}{" \u2500\u2500"}
          </Text>,
        );
        lastCategory = cat;
      }

      elements.push(
        <CommandRow key={cmd.name} cmd={cmd} isActive={globalIdx === selectedIndex} />,
      );
    }
    return elements;
  };

  const termWidth = process.stdout.columns ?? DEFAULT_TERMINAL_COLS;
  const paletteWidth = Math.min(60, Math.max(40, Math.floor(termWidth * 0.5)));

  const hasMore = ordered.length > scrollOffset + maxVisible;
  const hasAbove = scrollOffset > 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      width={paletteWidth}
    >
      <Box>
        <Text>
          <Text color="cyan" bold>{"\u276F "}</Text>
          <Text>{before}</Text>
          <Text backgroundColor="white" color="black">{cursorChar}</Text>
          <Text>{after}</Text>
        </Text>
      </Box>
      {ordered.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {hasAbove && (
            <Text color="gray" dimColor>{`  \u2191 ${scrollOffset} more above`}</Text>
          )}
          {renderItems()}
          {hasMore && (
            <Text color="gray" dimColor>{`  \u2193 ${ordered.length - scrollOffset - maxVisible} more below`}</Text>
          )}
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color="gray">No matching commands</Text>
        </Box>
      )}
      <Box marginTop={1} justifyContent="space-between">
        <Text color="gray" dimColor>
          {ordered.length} command{ordered.length !== 1 ? "s" : ""}
        </Text>
        <Text color="gray" dimColor>
          {"\u2191\u2193"} navigate  {"\u23CE"} execute  Esc cancel
        </Text>
      </Box>
    </Box>
  );
}
