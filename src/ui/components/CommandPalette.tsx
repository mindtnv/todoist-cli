import { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput } from "ink";

export interface Command {
  name: string;
  description: string;
  action: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  onCancel: () => void;
}

export function CommandPalette({ commands, onCancel }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Clamp selectedIndex when filtered list shrinks
  useEffect(() => {
    if (filtered.length > 0 && selectedIndex >= filtered.length) {
      setSelectedIndex(filtered.length - 1);
    }
  }, [filtered.length, selectedIndex]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const cmd = filtered[selectedIndex];
      if (cmd) {
        cmd.action();
      }
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
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

  const maxVisible = 10;
  const visible = filtered.slice(0, maxVisible);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      width={50}
    >
      <Box>
        <Text>
          <Text color="cyan">: </Text>
          <Text>{before}</Text>
          <Text backgroundColor="white" color="black">{cursorChar}</Text>
          <Text>{after}</Text>
        </Text>
      </Box>
      {visible.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {visible.map((cmd, i) => {
            const isActive = i === selectedIndex;
            return (
              <Box key={cmd.name}>
                <Text
                  backgroundColor={isActive ? "cyan" : undefined}
                  color={isActive ? "black" : "white"}
                  bold={isActive}
                >
                  {isActive ? "> " : "  "}
                  <Text bold={isActive}>{cmd.name}</Text>
                  <Text color={isActive ? "black" : "gray"}>{`  ${cmd.description}`}</Text>
                </Text>
              </Box>
            );
          })}
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color="gray">No matching commands</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {filtered.length} command{filtered.length !== 1 ? "s" : ""} | Arrow keys + Enter to select, Esc to cancel
        </Text>
      </Box>
    </Box>
  );
}
