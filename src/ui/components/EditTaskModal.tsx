import { useState, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import type { Task, Project, Label, Priority, UpdateTaskParams, CreateTaskParams } from "../../api/types.ts";
import { PRIORITY_LABELS, PRIORITY_COLORS } from "../constants.ts";

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

interface CursorState {
  content: number;
  description: number;
  due: number;
  deadline: number;
}

interface FormState {
  content: string;
  description: string;
  due: string;
  deadline: string;
  priority: Priority;
  labels: Set<string>;
  projectId: string;
}

/** Handle text input for a field: backspace, arrows, character insertion. Returns true if the input was handled. */
function handleTextInput(
  input: string,
  key: { backspace?: boolean; delete?: boolean; leftArrow?: boolean; rightArrow?: boolean; ctrl?: boolean; meta?: boolean },
  value: string,
  cursor: number,
  setValue: (updater: (v: string) => string) => void,
  setCursor: (updater: (c: number) => number) => void,
): boolean {
  if (key.backspace || key.delete) {
    if (cursor > 0) {
      setValue((v) => v.slice(0, cursor - 1) + v.slice(cursor));
      setCursor((c) => c - 1);
    }
    return true;
  }
  if (key.leftArrow) {
    setCursor((c) => Math.max(0, c - 1));
    return true;
  }
  if (key.rightArrow) {
    setCursor((c) => Math.min(value.length, c + 1));
    return true;
  }
  if (input && !key.ctrl && !key.meta) {
    setValue((v) => v.slice(0, cursor) + input + v.slice(cursor));
    setCursor((c) => c + input.length);
    return true;
  }
  return false;
}

export function EditTaskModal({ task, projects, labels, onSave, onCreate, onCancel, defaultProjectId, defaultDue }: EditTaskModalProps) {
  const isCreateMode = !task;

  const initialProjectId = task?.project_id ?? defaultProjectId ?? projects[0]?.id ?? "";
  const initialDue = task?.due?.string ?? defaultDue ?? "";

  const [activeField, setActiveField] = useState(0);

  const [form, setForm] = useState<FormState>({
    content: task?.content ?? "",
    description: task?.description ?? "",
    due: initialDue,
    deadline: task?.deadline?.date ?? "",
    priority: task?.priority ?? 1,
    labels: new Set(task?.labels ?? []),
    projectId: initialProjectId,
  });

  const [cursors, setCursors] = useState<CursorState>({
    content: (task?.content ?? "").length,
    description: (task?.description ?? "").length,
    due: initialDue.length,
    deadline: (task?.deadline?.date ?? "").length,
  });

  const [labelIndex, setLabelIndex] = useState(0);
  const [labelScrollOffset, setLabelScrollOffset] = useState(0);
  const [projectIndex, setProjectIndex] = useState(
    Math.max(0, projects.findIndex((p) => p.id === initialProjectId))
  );
  const [projectScrollOffset, setProjectScrollOffset] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const setFormField = useCallback(<K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const isDirty = useMemo(() => {
    const initContent = task?.content ?? "";
    const initDesc = task?.description ?? "";
    const initPriority = task?.priority ?? 1;
    const initDue = task?.due?.string ?? defaultDue ?? "";
    const initDeadline = task?.deadline?.date ?? "";
    const initLabels = new Set(task?.labels ?? []);
    const initProject = initialProjectId;
    if (form.content !== initContent) return true;
    if (form.description !== initDesc) return true;
    if (form.priority !== initPriority) return true;
    if (form.due !== initDue) return true;
    if (form.deadline !== initDeadline) return true;
    if (form.projectId !== initProject) return true;
    if (form.labels.size !== initLabels.size) return true;
    for (const l of form.labels) {
      if (!initLabels.has(l)) return true;
    }
    return false;
  }, [form, task, defaultDue, initialProjectId]);

  const handleSave = useCallback(() => {
    if (isCreateMode && onCreate) {
      const params: CreateTaskParams = { content: form.content };
      if (form.description) params.description = form.description;
      if (form.priority !== 1) params.priority = form.priority;
      if (form.due) params.due_string = form.due;
      if (form.deadline) params.deadline_date = form.deadline;
      const labelsList = Array.from(form.labels);
      if (labelsList.length > 0) params.labels = labelsList;
      if (form.projectId) params.project_id = form.projectId;
      onCreate(params);
      return;
    }

    if (!task) return;
    const params: UpdateTaskParams & { project_id?: string } = {};
    if (form.content !== task.content) params.content = form.content;
    if (form.description !== task.description) params.description = form.description;
    if (form.priority !== task.priority) params.priority = form.priority;
    if (form.due !== (task.due?.string ?? "")) {
      if (form.due === "" || form.due.toLowerCase() === "none" || form.due.toLowerCase() === "clear") {
        params.due_string = "no date";
      } else {
        params.due_string = form.due;
      }
    }
    const oldDeadline = task.deadline?.date ?? "";
    if (form.deadline !== oldDeadline) {
      if (form.deadline === "" || form.deadline.toLowerCase() === "none" || form.deadline.toLowerCase() === "clear") {
        params.deadline_date = null;
      } else {
        params.deadline_date = form.deadline;
      }
    }
    const newLabels = Array.from(form.labels);
    const oldLabels = [...task.labels].sort();
    const sortedNew = [...newLabels].sort();
    if (JSON.stringify(oldLabels) !== JSON.stringify(sortedNew)) {
      params.labels = newLabels;
    }
    if (form.projectId !== task.project_id) params.project_id = form.projectId;
    onSave(params);
  }, [form, task, onSave, onCreate, isCreateMode]);

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
    setFormField("projectId", projects[newIndex]?.id ?? form.projectId);
    if (newIndex < projectScrollOffset) {
      setProjectScrollOffset(newIndex);
    } else if (newIndex >= projectScrollOffset + VIEW_SIZE) {
      setProjectScrollOffset(newIndex - VIEW_SIZE + 1);
    }
  }, [projectScrollOffset, projects, form.projectId, setFormField]);

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
      handleTextInput(
        input, key, form.content, cursors.content,
        (updater) => setForm((f) => ({ ...f, content: updater(f.content) })),
        (updater) => setCursors((c) => ({ ...c, content: updater(c.content) })),
      );
    } else if (currentField === "description") {
      if (key.return) {
        setActiveField((i) => Math.min(FIELDS.length - 1, i + 1));
        return;
      }
      handleTextInput(
        input, key, form.description, cursors.description,
        (updater) => setForm((f) => ({ ...f, description: updater(f.description) })),
        (updater) => setCursors((c) => ({ ...c, description: updater(c.description) })),
      );
    } else if (currentField === "priority") {
      if (input === "1" || input === "2" || input === "3" || input === "4") {
        setFormField("priority", Number(input) as Priority);
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
      handleTextInput(
        input, key, form.due, cursors.due,
        (updater) => setForm((f) => ({ ...f, due: updater(f.due) })),
        (updater) => setCursors((c) => ({ ...c, due: updater(c.due) })),
      );
    } else if (currentField === "deadline") {
      if (key.return) {
        setActiveField((i) => Math.min(FIELDS.length - 1, i + 1));
        return;
      }
      handleTextInput(
        input, key, form.deadline, cursors.deadline,
        (updater) => setForm((f) => ({ ...f, deadline: updater(f.deadline) })),
        (updater) => setCursors((c) => ({ ...c, deadline: updater(c.deadline) })),
      );
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
          setForm((prev) => {
            const next = new Set(prev.labels);
            if (next.has(label.name)) {
              next.delete(label.name);
            } else {
              next.add(label.name);
            }
            return { ...prev, labels: next };
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

      {renderTextField("Content", form.content, cursors.content, currentField === "content")}
      {renderTextField("Description", form.description, cursors.description, currentField === "description")}

      {/* Priority */}
      <Box>
        <Box width={14}>
          <Text color={currentField === "priority" ? "yellow" : "gray"}>Priority:</Text>
        </Box>
        {([1, 2, 3, 4] as const).map((p) => {
          const dot = PRIORITY_DOTS[p] ?? "\u25CB";
          const color = PRIORITY_COLORS[p] ?? "gray";
          const label = PRIORITY_LABELS[p] ?? `p${p}`;
          const isActive = form.priority === p;
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

      {renderTextField("Due", form.due, cursors.due, currentField === "due")}
      {renderTextField("Deadline", form.deadline, cursors.deadline, currentField === "deadline")}

      {/* Labels */}
      <Box flexDirection="column">
        <Box>
          <Box width={14}>
            <Text color={currentField === "labels" ? "yellow" : "gray"}>Labels:</Text>
          </Box>
          <Text color="magenta">
            {form.labels.size > 0
              ? Array.from(form.labels).map((l) => `@${l}`).join(" ")
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
                    {form.labels.has(label.name) ? "[x] " : "[ ] "}
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
            {projects.find((p) => p.id === form.projectId)?.name ?? "Unknown"}
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
