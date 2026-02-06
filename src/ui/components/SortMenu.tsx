import { useState } from "react";
import { Box, Text, useInput } from "ink";

export type SortField = "priority" | "due" | "name" | "project";

interface SortMenuProps {
  currentSort: SortField;
  onSelect: (field: SortField) => void;
  onCancel: () => void;
}

const sortOptions: { field: SortField; label: string }[] = [
  { field: "priority", label: "Priority" },
  { field: "due", label: "Due date" },
  { field: "name", label: "Name" },
  { field: "project", label: "Project" },
];

export function SortMenu({ currentSort, onSelect, onCancel }: SortMenuProps) {
  const currentIndex = sortOptions.findIndex((o) => o.field === currentSort);
  const [selectedIndex, setSelectedIndex] = useState(currentIndex >= 0 ? currentIndex : 0);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const option = sortOptions[selectedIndex];
      if (option) {
        onSelect(option.field);
      }
      return;
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(sortOptions.length - 1, i + 1));
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="magenta"
      paddingX={2}
      paddingY={1}
      width={30}
    >
      <Box marginBottom={1}>
        <Text bold color="magenta">Sort by</Text>
      </Box>
      {sortOptions.map((option, i) => {
        const isActive = i === selectedIndex;
        const isCurrent = option.field === currentSort;
        return (
          <Box key={option.field}>
            <Text
              backgroundColor={isActive ? "magenta" : undefined}
              color={isActive ? "black" : isCurrent ? "magenta" : "white"}
              bold={isActive}
            >
              {isActive ? "> " : "  "}{option.label}{isCurrent ? " *" : ""}
            </Text>
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text color="gray" dimColor>Arrow keys + Enter to select, Esc to cancel</Text>
      </Box>
    </Box>
  );
}
