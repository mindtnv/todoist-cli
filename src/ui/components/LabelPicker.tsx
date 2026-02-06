import { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { Label } from "../../api/types.ts";
import { todoistColorMap } from "../../utils/colors.ts";

interface LabelPickerProps {
  labels: Label[];
  currentLabels: string[];
  onSave: (labels: string[]) => void;
  onCancel: () => void;
}

export function LabelPicker({ labels, currentLabels, onSave, onCancel }: LabelPickerProps) {
  const [filterText, setFilterText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set(currentLabels));

  const filtered = useMemo(() => {
    if (!filterText) return labels;
    const q = filterText.toLowerCase();
    return labels.filter((l) => l.name.toLowerCase().includes(q));
  }, [labels, filterText]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onSave(Array.from(checked));
      return;
    }
    if (key.backspace || key.delete) {
      setFilterText((v) => v.slice(0, -1));
      setSelectedIndex(0);
      return;
    }
    if (input === " ") {
      const label = filtered[selectedIndex];
      if (label) {
        setChecked((prev) => {
          const next = new Set(prev);
          if (next.has(label.name)) {
            next.delete(label.name);
          } else {
            next.add(label.name);
          }
          return next;
        });
      }
      return;
    }
    if (key.upArrow || (input === "k" && key.ctrl)) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || (input === "j" && key.ctrl)) {
      setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setFilterText((v) => v + input);
      setSelectedIndex(0);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="magenta"
      paddingX={1}
      width={40}
    >
      <Box marginBottom={1}>
        <Text bold color="magenta">Labels</Text>
      </Box>
      <Box>
        <Text color="yellow">{"> "}</Text>
        <Text>{filterText || ""}</Text>
        <Text backgroundColor="white" color="black">{" "}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {filtered.length === 0 ? (
          <Text color="gray">No matching labels</Text>
        ) : (
          filtered.slice(0, 15).map((label, i) => {
            const isSelected = i === selectedIndex;
            const isChecked = checked.has(label.name);
            const color = todoistColorMap[label.color] ?? "white";
            return (
              <Box key={label.id}>
                <Text
                  backgroundColor={isSelected ? "blue" : undefined}
                  color={isSelected ? "white" : undefined}
                >
                  <Text>{isChecked ? " [x] " : " [ ] "}</Text>
                  <Text color={isSelected ? "white" : color}>@{label.name}</Text>
                </Text>
              </Box>
            );
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>[Space] toggle [Enter] save [Esc] cancel</Text>
      </Box>
    </Box>
  );
}
