import { useState, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { Task, Project, Label, UpdateTaskParams, CreateTaskParams } from "../../api/types.ts";

interface EditTaskModalProps {
  task?: Task;
  projects: Project[];
  labels: Label[];
  onSave: (params: UpdateTaskParams & { project_id?: string }) => void;
  onCreate?: (params: CreateTaskParams) => void;
  onCancel: () => void;
  defaultProjectId?: string;
  defaultDue?: string;
}

type FieldName = "content" | "description" | "priority" | "due" | "deadline" | "labels" | "project";
const FIELDS: FieldName[] = ["content", "description", "priority", "due", "deadline", "labels", "project"];

const priorityLabels: Record<number, { label: string; color: string }> = {
  1: { label: "Normal", color: "white" },
  2: { label: "Medium", color: "blue" },
  3: { label: "High", color: "yellow" },
  4: { label: "Urgent", color: "red" },
};

const VIEW_SIZE = 8;

export function EditTaskModal({ task, projects, labels, onSave, onCreate, onCancel, defaultProjectId, defaultDue }: EditTaskModalProps) {
  const isCreateMode = !task;

  const initialProjectId = task?.project_id ?? defaultProjectId ?? projects[0]?.id ?? "";

  const [activeField, setActiveField] = useState(0);
  const [content, setContent] = useState(task?.content ?? "");
  const [contentCursor, setContentCursor] = useState((task?.content ?? "").length);
  const [description, setDescription] = useState(task?.description ?? "");
  const [descCursor, setDescCursor] = useState((task?.description ?? "").length);
  const [priority, setPriority] = useState(task?.priority ?? 1);
  const initialDue = task?.due?.string ?? defaultDue ?? "";
  const [dueString, setDueString] = useState(initialDue);
  const [dueCursor, setDueCursor] = useState(initialDue.length);
  const [deadlineString, setDeadlineString] = useState(task?.deadline?.date ?? "");
  const [deadlineCursor, setDeadlineCursor] = useState((task?.deadline?.date ?? "").length);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set(task?.labels ?? []));
  const [labelIndex, setLabelIndex] = useState(0);
  const [labelScrollOffset, setLabelScrollOffset] = useState(0);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [projectIndex, setProjectIndex] = useState(
    Math.max(0, projects.findIndex((p) => p.id === initialProjectId))
  );
  const [projectScrollOffset, setProjectScrollOffset] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isDirty = useMemo(() => {
    const initContent = task?.content ?? "";
    const initDesc = task?.description ?? "";
    const initPriority = task?.priority ?? 1;
    const initDue = task?.due?.string ?? defaultDue ?? "";
    const initDeadline = task?.deadline?.date ?? "";
    const initLabels = new Set(task?.labels ?? []);
    const initProject = initialProjectId;
    if (content !== initContent) return true;
    if (description !== initDesc) return true;
    if (priority !== initPriority) return true;
    if (dueString !== initDue) return true;
    if (deadlineString !== initDeadline) return true;
    if (projectId !== initProject) return true;
    if (selectedLabels.size !== initLabels.size) return true;
    for (const l of selectedLabels) {
      if (!initLabels.has(l)) return true;
    }
    return false;
  }, [content, description, priority, dueString, deadlineString, selectedLabels, projectId, task, defaultDue, initialProjectId]);

  const handleSave = useCallback(() => {
    if (isCreateMode && onCreate) {
      const params: CreateTaskParams = { content };
      if (description) params.description = description;
      if (priority !== 1) params.priority = priority;
      if (dueString) params.due_string = dueString;
      if (deadlineString) params.deadline_date = deadlineString;
      const labelsList = Array.from(selectedLabels);
      if (labelsList.length > 0) params.labels = labelsList;
      if (projectId) params.project_id = projectId;
      onCreate(params);
      return;
    }

    if (!task) return;
    const params: UpdateTaskParams & { project_id?: string } = {};
    if (content !== task.content) params.content = content;
    if (description !== task.description) params.description = description;
    if (priority !== task.priority) params.priority = priority;
    if (dueString !== (task.due?.string ?? "")) {
      if (dueString === "" || dueString.toLowerCase() === "none" || dueString.toLowerCase() === "clear") {
        params.due_string = "no date";
      } else {
        params.due_string = dueString;
      }
    }
    const oldDeadline = task.deadline?.date ?? "";
    if (deadlineString !== oldDeadline) {
      if (deadlineString === "" || deadlineString.toLowerCase() === "none" || deadlineString.toLowerCase() === "clear") {
        (params as any).deadline_date = null;
      } else {
        (params as any).deadline_date = deadlineString;
      }
    }
    const newLabels = Array.from(selectedLabels);
    const oldLabels = [...task.labels].sort();
    const sortedNew = [...newLabels].sort();
    if (JSON.stringify(oldLabels) !== JSON.stringify(sortedNew)) {
      params.labels = newLabels;
    }
    if (projectId !== task.project_id) params.project_id = projectId;
    onSave(params);
  }, [content, description, priority, dueString, deadlineString, selectedLabels, projectId, task, onSave, onCreate, isCreateMode]);

  const currentField = FIELDS[activeField];

  // Compute visible window for labels
  const visibleLabels = useMemo(() => {
    return labels.slice(labelScrollOffset, labelScrollOffset + VIEW_SIZE);
  }, [labels, labelScrollOffset]);

  // Compute visible window for projects
  const visibleProjects = useMemo(() => {
    return projects.slice(projectScrollOffset, projectScrollOffset + VIEW_SIZE);
  }, [projects, projectScrollOffset]);

  const scrollLabelTo = useCallback((newIndex: number) => {
    setLabelIndex(newIndex);
    if (newIndex < labelScrollOffset) {
      setLabelScrollOffset(newIndex);
    } else if (newIndex >= labelScrollOffset + VIEW_SIZE) {
      setLabelScrollOffset(newIndex - VIEW_SIZE + 1);
    }
  }, [labelScrollOffset]);

  const scrollProjectTo = useCallback((newIndex: number) => {
    setProjectIndex(newIndex);
    setProjectId(projects[newIndex]?.id ?? projectId);
    if (newIndex < projectScrollOffset) {
      setProjectScrollOffset(newIndex);
    } else if (newIndex >= projectScrollOffset + VIEW_SIZE) {
      setProjectScrollOffset(newIndex - VIEW_SIZE + 1);
    }
  }, [projectScrollOffset, projects, projectId]);

  useInput((input, key) => {
    // Handle discard confirmation
    if (confirmDiscard) {
      if (input === "y" || input === "Y") {
        onCancel();
      } else {
        setConfirmDiscard(false);
      }
      return;
    }
    // Ctrl-S to save from anywhere
    if (key.ctrl && input === "s") {
      handleSave();
      return;
    }
    if (key.escape) {
      if (isDirty) {
        setConfirmDiscard(true);
        return;
      }
      onCancel();
      return;
    }
    // Ctrl-P: backward field navigation (alternative to Shift-Tab for terminals that don't support it)
    if (key.ctrl && input === "p") {
      setActiveField((i) => (i > 0 ? i - 1 : FIELDS.length - 1));
      return;
    }
    if (key.tab) {
      if (key.shift) {
        setActiveField((i) => (i > 0 ? i - 1 : FIELDS.length - 1));
      } else {
        setActiveField((i) => (i < FIELDS.length - 1 ? i + 1 : 0));
      }
      return;
    }

    // Field-specific input handling
    if (currentField === "content") {
      if (key.return) {
        setActiveField((i) => Math.min(FIELDS.length - 1, i + 1));
        return;
      }
      if (key.backspace || key.delete) {
        if (contentCursor > 0) {
          setContent((v) => v.slice(0, contentCursor - 1) + v.slice(contentCursor));
          setContentCursor((c) => c - 1);
        }
        return;
      }
      if (key.leftArrow) {
        setContentCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setContentCursor((c) => Math.min(content.length, c + 1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setContent((v) => v.slice(0, contentCursor) + input + v.slice(contentCursor));
        setContentCursor((c) => c + input.length);
      }
    } else if (currentField === "description") {
      if (key.return) {
        setActiveField((i) => Math.min(FIELDS.length - 1, i + 1));
        return;
      }
      if (key.backspace || key.delete) {
        if (descCursor > 0) {
          setDescription((v) => v.slice(0, descCursor - 1) + v.slice(descCursor));
          setDescCursor((c) => c - 1);
        }
        return;
      }
      if (key.leftArrow) {
        setDescCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setDescCursor((c) => Math.min(description.length, c + 1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setDescription((v) => v.slice(0, descCursor) + input + v.slice(descCursor));
        setDescCursor((c) => c + input.length);
      }
    } else if (currentField === "priority") {
      if (input === "1" || input === "2" || input === "3" || input === "4") {
        setPriority(Number(input) as 1 | 2 | 3 | 4);
        return;
      }
      if (key.return) {
        setActiveField((i) => Math.min(FIELDS.length - 1, i + 1));
        return;
      }
    } else if (currentField === "due") {
      if (key.return) {
        setActiveField((i) => Math.min(FIELDS.length - 1, i + 1));
        return;
      }
      if (key.backspace || key.delete) {
        if (dueCursor > 0) {
          setDueString((v) => v.slice(0, dueCursor - 1) + v.slice(dueCursor));
          setDueCursor((c) => c - 1);
        }
        return;
      }
      if (key.leftArrow) {
        setDueCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setDueCursor((c) => Math.min(dueString.length, c + 1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setDueString((v) => v.slice(0, dueCursor) + input + v.slice(dueCursor));
        setDueCursor((c) => c + input.length);
      }
    } else if (currentField === "deadline") {
      if (key.return) {
        setActiveField((i) => Math.min(FIELDS.length - 1, i + 1));
        return;
      }
      if (key.backspace || key.delete) {
        if (deadlineCursor > 0) {
          setDeadlineString((v) => v.slice(0, deadlineCursor - 1) + v.slice(deadlineCursor));
          setDeadlineCursor((c) => c - 1);
        }
        return;
      }
      if (key.leftArrow) {
        setDeadlineCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setDeadlineCursor((c) => Math.min(deadlineString.length, c + 1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setDeadlineString((v) => v.slice(0, deadlineCursor) + input + v.slice(deadlineCursor));
        setDeadlineCursor((c) => c + input.length);
      }
    } else if (currentField === "labels") {
      if (key.return) {
        setActiveField((i) => Math.min(FIELDS.length - 1, i + 1));
        return;
      }
      if (key.upArrow || input === "k") {
        scrollLabelTo(Math.max(0, labelIndex - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        scrollLabelTo(Math.min(labels.length - 1, labelIndex + 1));
        return;
      }
      if (input === " ") {
        const label = labels[labelIndex];
        if (label) {
          setSelectedLabels((prev) => {
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
    } else if (currentField === "project") {
      if (key.return) {
        handleSave();
        return;
      }
      if (key.upArrow || input === "k") {
        scrollProjectTo(Math.max(0, projectIndex - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        scrollProjectTo(Math.min(projects.length - 1, projectIndex + 1));
        return;
      }
    }
  });

  const renderTextField = (label: string, value: string, cursor: number, isActive: boolean) => {
    const before = value.slice(0, cursor);
    const cursorChar = value[cursor] ?? " ";
    const after = value.slice(cursor + 1);
    return (
      <Box>
        <Box width={14}>
          <Text color={isActive ? "yellow" : "gray"}>{label}:</Text>
        </Box>
        {isActive ? (
          <Text>
            <Text>{before}</Text>
            <Text backgroundColor="white" color="black">{cursorChar}</Text>
            <Text>{after}</Text>
          </Text>
        ) : (
          <Text color="gray">{value || "(empty)"}</Text>
        )}
      </Box>
    );
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">{isCreateMode ? "New Task" : "Edit Task"}</Text>
      </Box>

      {renderTextField("Content", content, contentCursor, currentField === "content")}
      {renderTextField("Description", description, descCursor, currentField === "description")}

      {/* Priority */}
      <Box>
        <Box width={14}>
          <Text color={currentField === "priority" ? "yellow" : "gray"}>Priority:</Text>
        </Box>
        {([1, 2, 3, 4] as const).map((p) => {
          const info = priorityLabels[p]!;
          const isActive = priority === p;
          return (
            <Box key={p} marginRight={1}>
              <Text
                color={isActive ? info.color : "gray"}
                bold={isActive}
              >
                {isActive ? `[${p}: ${info.label}]` : `${p}: ${info.label}`}
              </Text>
            </Box>
          );
        })}
      </Box>

      {renderTextField("Due", dueString, dueCursor, currentField === "due")}
      {renderTextField("Deadline", deadlineString, deadlineCursor, currentField === "deadline")}

      {/* Labels */}
      <Box flexDirection="column">
        <Box>
          <Box width={14}>
            <Text color={currentField === "labels" ? "yellow" : "gray"}>Labels:</Text>
          </Box>
          <Text color="magenta">
            {selectedLabels.size > 0
              ? Array.from(selectedLabels).map((l) => `@${l}`).join(" ")
              : "(none)"}
          </Text>
        </Box>
        {currentField === "labels" && labels.length > 0 && (
          <Box flexDirection="column" marginLeft={14}>
            {labelScrollOffset > 0 && (
              <Text color="gray">  {"\u25B2"} {labelScrollOffset} more above</Text>
            )}
            {visibleLabels.map((label, i) => {
              const actualIndex = labelScrollOffset + i;
              return (
                <Box key={label.id}>
                  <Text
                    backgroundColor={actualIndex === labelIndex ? "blue" : undefined}
                    color={actualIndex === labelIndex ? "white" : undefined}
                  >
                    {selectedLabels.has(label.name) ? "[x] " : "[ ] "}
                    <Text color={actualIndex === labelIndex ? "white" : "magenta"}>@{label.name}</Text>
                  </Text>
                </Box>
              );
            })}
            {labelScrollOffset + VIEW_SIZE < labels.length && (
              <Text color="gray">  {"\u25BC"} {labels.length - labelScrollOffset - VIEW_SIZE} more below</Text>
            )}
          </Box>
        )}
      </Box>

      {/* Project */}
      <Box flexDirection="column">
        <Box>
          <Box width={14}>
            <Text color={currentField === "project" ? "yellow" : "gray"}>Project:</Text>
          </Box>
          <Text color="cyan">
            {projects.find((p) => p.id === projectId)?.name ?? "Unknown"}
          </Text>
        </Box>
        {currentField === "project" && (
          <Box flexDirection="column" marginLeft={14}>
            {projectScrollOffset > 0 && (
              <Text color="gray">  {"\u25B2"} {projectScrollOffset} more above</Text>
            )}
            {visibleProjects.map((project, i) => {
              const actualIndex = projectScrollOffset + i;
              return (
                <Box key={project.id}>
                  <Text
                    backgroundColor={actualIndex === projectIndex ? "blue" : undefined}
                    color={actualIndex === projectIndex ? "white" : undefined}
                  >
                    {actualIndex === projectIndex ? "> " : "  "}{project.name}
                  </Text>
                </Box>
              );
            })}
            {projectScrollOffset + VIEW_SIZE < projects.length && (
              <Text color="gray">  {"\u25BC"} {projects.length - projectScrollOffset - VIEW_SIZE} more below</Text>
            )}
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        {confirmDiscard ? (
          <Text color="yellow" bold>Discard changes? (y/n)</Text>
        ) : (
          <Text color="gray" dimColor>[Tab] next field  [Ctrl-S] save  [Esc] cancel</Text>
        )}
      </Box>
    </Box>
  );
}
