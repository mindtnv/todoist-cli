import { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { Project } from "../../api/types.ts";
import { todoistColorMap } from "../../utils/colors.ts";

interface ProjectPickerProps {
  projects: Project[];
  onSelect: (projectId: string) => void;
  onCancel: () => void;
}

export function ProjectPicker({ projects, onSelect, onCancel }: ProjectPickerProps) {
  const [filterText, setFilterText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!filterText) return projects;
    const q = filterText.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, filterText]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const project = filtered[selectedIndex];
      if (project) {
        onSelect(project.id);
      }
      return;
    }
    if (key.backspace || key.delete) {
      setFilterText((v) => v.slice(0, -1));
      setSelectedIndex(0);
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
      borderColor="cyan"
      paddingX={1}
      width={40}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">Move to project</Text>
      </Box>
      <Box>
        <Text color="yellow">{"> "}</Text>
        <Text>{filterText || ""}</Text>
        <Text backgroundColor="white" color="black">{" "}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {filtered.length === 0 ? (
          <Text color="gray">No matching projects</Text>
        ) : (
          filtered.slice(0, 15).map((project, i) => {
            const isSelected = i === selectedIndex;
            const color = todoistColorMap[project.color] ?? "white";
            return (
              <Box key={project.id}>
                <Text
                  backgroundColor={isSelected ? "blue" : undefined}
                  color={isSelected ? "white" : undefined}
                >
                  <Text color={isSelected ? "white" : color}>{"  "}{project.is_inbox_project ? "> " : "  "}</Text>
                  <Text>{project.name}</Text>
                </Text>
              </Box>
            );
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text color="gray" dimColor>[Enter] select  [Esc] cancel</Text>
      </Box>
    </Box>
  );
}
