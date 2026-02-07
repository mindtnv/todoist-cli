import { useState, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { Task, Project, Label, Priority, UpdateTaskParams, CreateTaskParams } from "../../api/types.ts";
import { PRIORITY_LABELS, PRIORITY_COLORS } from "../constants.ts";
import { useFormField } from "../hooks/useFormField.ts";

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

const PRIORITY_DOTS: Record<number, string> = {
  1: "\u25CB", 2: "\u25CF", 3: "\u25CF", 4: "\u25CF",
};

const VIEW_SIZE = 8;

export function EditTaskModal({ task, projects, labels, onSave, onCreate, onCancel, defaultProjectId, defaultDue }: EditTaskModalProps) {
  const isCreateMode = !task;

  const initialProjectId = task?.project_id ?? defaultProjectId ?? projects[0]?.id ?? "";
  const initialDue = task?.due?.string ?? defaultDue ?? "";

  const [activeField, setActiveField] = useState(0);

  // Text fields using useFormField hook
  const content = useFormField(task?.content ?? "");
  const description = useFormField(task?.description ?? "");
  const due = useFormField(initialDue);
  const deadline = useFormField(task?.deadline?.date ?? "");

  // Non-text form state
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 1);
  const [formLabels, setFormLabels] = useState<Set<string>>(new Set(task?.labels ?? []));
  const [projectId, setProjectId] = useState(initialProjectId);

  const [labelIndex, setLabelIndex] = useState(0);
  const [labelScrollOffset, setLabelScrollOffset] = useState(0);
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
    if (content.value !== initContent) return true;
    if (description.value !== initDesc) return true;
    if (priority !== initPriority) return true;
    if (due.value !== initDue) return true;
    if (deadline.value !== initDeadline) return true;
    if (projectId !== initProject) return true;
    if (formLabels.size !== initLabels.size) return true;
    for (const l of formLabels) {
      if (!initLabels.has(l)) return true;
    }
    return false;
  }, [content.value, description.value, priority, due.value, deadline.value, projectId, formLabels, task, defaultDue, initialProjectId]);

  const handleSave = useCallback(() => {
    if (isCreateMode && onCreate) {
      const params: CreateTaskParams = { content: content.value };
      if (description.value) params.description = description.value;
      if (priority !== 1) params.priority = priority;
      if (due.value) params.due_string = due.value;
      if (deadline.value) params.deadline_date = deadline.value;
      const labelsList = Array.from(formLabels);
      if (labelsList.length > 0) params.labels = labelsList;
      if (projectId) params.project_id = projectId;
      onCreate(params);
      return;
    }

    if (!task) return;
    const params: UpdateTaskParams & { project_id?: string } = {};
    if (content.value !== task.content) params.content = content.value;
    if (description.value !== task.description) params.description = description.value;
    if (priority !== task.priority) params.priority = priority;
    if (due.value !== (task.due?.string ?? "")) {
      if (due.value === "" || due.value.toLowerCase() === "none" || due.value.toLowerCase() === "clear") {
        params.due_string = "no date";
      } else {
        params.due_string = due.value;
      }
    }
    const oldDeadline = task.deadline?.date ?? "";
    if (deadline.value !== oldDeadline) {
      if (deadline.value === "" || deadline.value.toLowerCase() === "none" || deadline.value.toLowerCase() === "clear") {
        params.deadline_date = null;
      } else {
        params.deadline_date = deadline.value;
      }
    }
    const newLabels = Array.from(formLabels);
    const oldLabels = [...task.labels].sort();
    const sortedNew = [...newLabels].sort();
    if (JSON.stringify(oldLabels) !== JSON.stringify(sortedNew)) {
      params.labels = newLabels;
    }
    if (projectId !== task.project_id) params.project_id = projectId;
    onSave(params);
  }, [content.value, description.value, priority, due.value, deadline.value, formLabels, projectId, task, onSave, onCreate, isCreateMode]);

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

  // Map field names to their useFormField instances
  const textFields: Record<string, ReturnType<typeof useFormField>> = {
    content,
    description,
    due,
    deadline,
  };

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
    const activeTextField = currentField ? textFields[currentField] : undefined;
    if (activeTextField) {
      // Text fields: content, description, due, deadline
      if (key.return) {
        setActiveField((i) => Math.min(FIELDS.length - 1, i + 1));
        return;
      }
      activeTextField.handleInput(input, key);
    } else if (currentField === "priority") {
      if (input === "1" || input === "2" || input === "3" || input === "4") {
        setPriority(Number(input) as Priority);
        return;
      }
      if (key.return) {
        setActiveField((i) => Math.min(FIELDS.length - 1, i + 1));
        return;
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
          setFormLabels((prev) => {
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

      {renderTextField("Content", content.value, content.cursor, currentField === "content")}
      {renderTextField("Description", description.value, description.cursor, currentField === "description")}

      {/* Priority */}
      <Box>
        <Box width={14}>
          <Text color={currentField === "priority" ? "yellow" : "gray"}>Priority:</Text>
        </Box>
        {([1, 2, 3, 4] as const).map((p) => {
          const dot = PRIORITY_DOTS[p] ?? "\u25CB";
          const color = PRIORITY_COLORS[p] ?? "gray";
          const label = PRIORITY_LABELS[p] ?? `p${p}`;
          const isActive = priority === p;
          return (
            <Box key={p} marginRight={1}>
              <Text
                color={isActive ? color : "gray"}
                bold={isActive}
              >
                {isActive ? `[${dot} ${p}: ${label}]` : `${dot} ${p}: ${label}`}
              </Text>
            </Box>
          );
        })}
      </Box>

      {renderTextField("Due", due.value, due.cursor, currentField === "due")}
      {renderTextField("Deadline", deadline.value, deadline.cursor, currentField === "deadline")}

      {/* Labels */}
      <Box flexDirection="column">
        <Box>
          <Box width={14}>
            <Text color={currentField === "labels" ? "yellow" : "gray"}>Labels:</Text>
          </Box>
          <Text color="magenta">
            {formLabels.size > 0
              ? Array.from(formLabels).map((l) => `@${l}`).join(" ")
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
                    {formLabels.has(label.name) ? "[x] " : "[ ] "}
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
