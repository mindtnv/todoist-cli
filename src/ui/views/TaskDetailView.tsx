import { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { Task, Comment, Project, Label, UpdateTaskParams } from "../../api/types.ts";
import { getComments, createComment } from "../../api/comments.ts";
import { closeTask, deleteTask, getTasks, updateTask } from "../../api/tasks.ts";
import { openUrl } from "../../utils/open-url.ts";
import { formatDeadlineLong, isDeadlineOverdue, formatCreatedAt } from "../../utils/date-format.ts";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { InputPrompt } from "../components/InputPrompt.tsx";
import { EditTaskModal } from "../components/EditTaskModal.tsx";
import { ProjectPicker } from "../components/ProjectPicker.tsx";
import { LabelPicker } from "../components/LabelPicker.tsx";
import type { DetailSectionDefinition, PluginContext, HookRegistry } from "../../plugins/types.ts";

interface TaskDetailViewProps {
  task: Task;
  allTasks?: Task[];
  projects: Project[];
  labels: Label[];
  onBack: () => void;
  onTaskChanged: (message?: string) => void;
  pluginSections?: DetailSectionDefinition[];
  pluginSectionContextMap?: Map<string, PluginContext>;
  pluginHooks?: HookRegistry | null;
}

const priorityLabels: Record<number, { label: string; color: string }> = {
  4: { label: "P4 (Urgent)", color: "red" },
  3: { label: "P3 (High)", color: "yellow" },
  2: { label: "P2 (Medium)", color: "blue" },
  1: { label: "P1 (Normal)", color: "white" },
};

export function TaskDetailView({ task, allTasks, projects, labels, onBack, onTaskChanged, pluginSections, pluginSectionContextMap, pluginHooks }: TaskDetailViewProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<"none" | "delete">("none");
  const [modal, setModal] = useState<"none" | "comment" | "due" | "deadline" | "move" | "label" | "editFull">("none");
  const [scrollOffset, setScrollOffset] = useState(0);
  const { stdout } = useStdout();
  const viewportHeight = stdout?.rows ? Math.max(5, stdout.rows - 6) : 30;

  useEffect(() => {
    let cancelled = false;
    setLoadingComments(true);
    getComments(task.id)
      .then((c) => {
        if (!cancelled) {
          setComments(c);
          setLoadingComments(false);
        }
      })
      .catch(() => {
        // Comment loading failed — hide spinner, but don't show error (non-critical data)
        if (!cancelled) {
          setLoadingComments(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  // Load subtasks
  useEffect(() => {
    if (allTasks) {
      setSubtasks(allTasks.filter((t) => t.parent_id === task.id));
      return;
    }
    // Fallback: fetch all tasks and filter
    let cancelled = false;
    getTasks()
      .then((all) => {
        if (!cancelled) {
          setSubtasks(all.filter((t) => t.parent_id === task.id));
        }
      })
      .catch(() => {
        // Subtask loading failed — non-critical, silently ignore
      });
    return () => {
      cancelled = true;
    };
  }, [task.id, allTasks]);

  const handleComplete = useCallback(async () => {
    try {
      setStatusMessage("Completing task...");
      await closeTask(task.id);
      try { await pluginHooks?.emit("task.completed", { task }); } catch { /* hook error is non-critical */ }
      onTaskChanged("Task completed!");
    } catch {
      setStatusMessage("Failed to complete task");
    }
  }, [task, onTaskChanged, pluginHooks]);

  const handleDeleteConfirm = useCallback(async () => {
    setConfirmAction("none");
    try {
      setStatusMessage("Deleting task...");
      await deleteTask(task.id);
      try { await pluginHooks?.emit("task.deleted", { task }); } catch { /* hook error is non-critical */ }
      onTaskChanged("Task deleted!");
    } catch {
      setStatusMessage("Failed to delete task");
    }
  }, [task, onTaskChanged, pluginHooks]);

  const handleAddComment = useCallback(
    async (content: string) => {
      setModal("none");
      try {
        setStatusMessage("Adding comment...");
        await createComment({ task_id: task.id, content });
        const updated = await getComments(task.id);
        setComments(updated);
        setStatusMessage("Comment added!");
      } catch {
        setStatusMessage("Failed to add comment");
      }
    },
    [task.id],
  );

  const handleOpenInBrowser = useCallback(() => {
    try {
      openUrl(task.url);
      setStatusMessage("Opened in browser");
    } catch {
      setStatusMessage("Failed to open in browser");
    }
  }, [task.url]);

  const handleSetPriority = useCallback(async (priority: 1 | 2 | 3 | 4) => {
    try {
      setStatusMessage("Setting priority...");
      try { await pluginHooks?.emit("task.updating", { task, changes: { priority } }); } catch { /* hook error is non-critical */ }
      await updateTask(task.id, { priority });
      try { await pluginHooks?.emit("task.updated", { task: { ...task, priority }, changes: { priority } }); } catch { /* hook error is non-critical */ }
      onTaskChanged(`Priority set to p${priority}`);
    } catch {
      setStatusMessage("Failed to set priority");
    }
  }, [task, onTaskChanged, pluginHooks]);

  const handleSetDueDate = useCallback(async (dueString: string) => {
    setModal("none");
    try {
      const isRemove = dueString.toLowerCase() === "none" || dueString.toLowerCase() === "clear";
      const changes: UpdateTaskParams = { due_string: isRemove ? "no date" : dueString };
      try { await pluginHooks?.emit("task.updating", { task, changes }); } catch { /* hook error is non-critical */ }
      await updateTask(task.id, changes);
      try { await pluginHooks?.emit("task.updated", { task, changes }); } catch { /* hook error is non-critical */ }
      onTaskChanged(isRemove ? "Due date removed" : `Due set to "${dueString}"`);
    } catch {
      setStatusMessage("Failed to set due date");
    }
  }, [task, onTaskChanged, pluginHooks]);

  const handleSetDeadline = useCallback(async (value: string) => {
    setModal("none");
    const isRemove = value.toLowerCase() === "none" || value.toLowerCase() === "clear" || value === "";
    if (!isRemove && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setStatusMessage("Invalid date format. Use YYYY-MM-DD.");
      return;
    }
    try {
      const changes: UpdateTaskParams = { deadline_date: isRemove ? null : value };
      try { await pluginHooks?.emit("task.updating", { task, changes }); } catch { /* hook error is non-critical */ }
      await updateTask(task.id, changes);
      try { await pluginHooks?.emit("task.updated", { task, changes }); } catch { /* hook error is non-critical */ }
      onTaskChanged(isRemove ? "Deadline removed" : `Deadline set to ${value}`);
    } catch {
      setStatusMessage("Failed to set deadline");
    }
  }, [task, onTaskChanged, pluginHooks]);

  const handleMoveToProject = useCallback(async (projectId: string) => {
    setModal("none");
    try {
      const projectName = projects.find((p) => p.id === projectId)?.name ?? "project";
      const changes: UpdateTaskParams = { project_id: projectId };
      try { await pluginHooks?.emit("task.updating", { task, changes }); } catch { /* hook error is non-critical */ }
      await updateTask(task.id, changes);
      try { await pluginHooks?.emit("task.updated", { task: { ...task, project_id: projectId }, changes }); } catch { /* hook error is non-critical */ }
      onTaskChanged(`Moved to ${projectName}`);
    } catch {
      setStatusMessage("Failed to move task");
    }
  }, [task, projects, onTaskChanged, pluginHooks]);

  const handleLabelsSave = useCallback(async (newLabels: string[]) => {
    setModal("none");
    try {
      const changes: UpdateTaskParams = { labels: newLabels };
      try { await pluginHooks?.emit("task.updating", { task, changes }); } catch { /* hook error is non-critical */ }
      await updateTask(task.id, changes);
      try { await pluginHooks?.emit("task.updated", { task: { ...task, labels: newLabels }, changes }); } catch { /* hook error is non-critical */ }
      onTaskChanged("Labels updated");
    } catch {
      setStatusMessage("Failed to update labels");
    }
  }, [task, onTaskChanged, pluginHooks]);

  const handleEditFull = useCallback(async (params: UpdateTaskParams & { project_id?: string }) => {
    setModal("none");
    try {
      try { await pluginHooks?.emit("task.updating", { task, changes: params }); } catch { /* hook error is non-critical */ }
      await updateTask(task.id, params);
      try { await pluginHooks?.emit("task.updated", { task, changes: params }); } catch { /* hook error is non-critical */ }
      onTaskChanged("Task updated");
    } catch {
      setStatusMessage("Failed to update task");
    }
  }, [task, onTaskChanged, pluginHooks]);

  useInput((input, key) => {
    if (confirmAction !== "none") return;
    if (modal !== "none") return;

    if (input === "e") {
      setModal("editFull");
      return;
    }
    if (input === "t") {
      setModal("due");
      return;
    }
    if (input === "D") {
      setModal("deadline");
      return;
    }
    if (input === "m") {
      setModal("move");
      return;
    }
    if (input === "l") {
      setModal("label");
      return;
    }
    if (input === "1" || input === "2" || input === "3" || input === "4") {
      handleSetPriority(Number(input) as 1 | 2 | 3 | 4);
      return;
    }

    if (key.escape || key.backspace || key.delete) {
      onBack();
      return;
    }
    // Scrolling — estimate content lines to cap scroll
    const contentLines = 6 + (task.description ? 2 : 0) + subtasks.length + comments.length * 2 + 4;
    const maxScroll = Math.max(0, contentLines - viewportHeight);
    if (input === "j" || key.downArrow) {
      setScrollOffset((s) => Math.min(s + 1, maxScroll));
      return;
    }
    if (input === "k" || key.upArrow) {
      setScrollOffset((s) => Math.max(0, s - 1));
      return;
    }
    if (input === "c") {
      handleComplete();
      return;
    }
    if (input === "d") {
      setConfirmAction("delete");
      return;
    }
    if (input === "n") {
      setModal("comment");
      return;
    }
    if (input === "o") {
      handleOpenInBrowser();
      return;
    }
  });

  const project = projects.find((p) => p.id === task.project_id);
  const prio = priorityLabels[task.priority] ?? { label: "Unknown", color: "white" };

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1} height={viewportHeight} overflow="hidden">
        <Box marginBottom={1}>
          <Text bold color="cyan">Task Detail</Text>
          {scrollOffset > 0 && <Text color="gray"> (scroll: {scrollOffset})</Text>}
        </Box>

        <Box flexDirection="column" marginTop={-scrollOffset}>
        <Box marginBottom={1}>
          <Text bold>{task.content}</Text>
        </Box>

        {task.description ? (
          <Box marginBottom={1} flexDirection="column">
            <Text color="gray">Description:</Text>
            <Text>{task.description}</Text>
          </Box>
        ) : null}

        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Box width={14}><Text color="gray">Priority:</Text></Box>
            <Text color={prio.color}>{prio.label}</Text>
          </Box>
          <Box>
            <Box width={14}><Text color="gray">Project:</Text></Box>
            <Text color="cyan">{project?.name ?? "Unknown"}</Text>
          </Box>
          <Box>
            <Box width={14}><Text color="gray">Due:</Text></Box>
            <Text>
              {task.due ? `${task.due.string} (${task.due.date})` : "No due date"}
              {task.due?.is_recurring ? <Text color="cyan"> \u21BB recurring</Text> : null}
            </Text>
          </Box>
          {task.deadline && (() => {
            const formatted = formatDeadlineLong(task.deadline!.date);
            const overdue = isDeadlineOverdue(task.deadline!.date);
            return (
              <Box>
                <Box width={14}><Text color="gray">Deadline:</Text></Box>
                <Text color="red" bold={overdue}>
                  {formatted}{overdue ? " (OVERDUE!)" : ""}
                </Text>
              </Box>
            );
          })()}
          <Box>
            <Box width={14}><Text color="gray">Labels:</Text></Box>
            <Text color="magenta">{task.labels.length > 0 ? task.labels.map((l) => `@${l}`).join(" ") : "None"}</Text>
          </Box>
          <Box>
            <Box width={14}><Text color="gray">Created:</Text></Box>
            <Text>{formatCreatedAt(task.created_at)}</Text>
          </Box>
        </Box>

        {subtasks.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="green">Subtasks ({subtasks.length})</Text>
            {subtasks.map((sub) => {
              const subCheckbox = sub.is_completed ? "\u2611" : "\u2610";
              const subPrioColor = priorityLabels[sub.priority]?.color ?? "white";
              return (
                <Box key={sub.id}>
                  <Text>
                    <Text color="gray">  {"\u2514"} </Text>
                    <Text color={subPrioColor}>{subCheckbox}</Text>
                    <Text> {sub.content}</Text>
                    {sub.due ? <Text color="cyan">{` [${sub.due.date}]`}</Text> : null}
                  </Text>
                </Box>
              );
            })}
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">Comments {loadingComments ? "(loading...)" : `(${comments.length})`}</Text>
          {comments.length === 0 && !loadingComments ? (
            <Text color="gray">No comments</Text>
          ) : null}
          {comments.map((comment) => (
            <Box key={comment.id} marginTop={1} flexDirection="column">
              <Text color="gray" dimColor>{comment.posted_at}</Text>
              <Text>{comment.content}</Text>
            </Box>
          ))}
        </Box>
        {pluginSections?.map(section => {
          const Component = section.component;
          const sectionCtx = pluginSectionContextMap?.get(section.id);
          if (!sectionCtx) return null;
          return (
            <Box key={section.id} flexDirection="column" marginTop={1}>
              <Text bold color="cyan">{section.label}</Text>
              <Component task={task} ctx={sectionCtx} />
            </Box>
          );
        })}
        </Box>
      </Box>

      {modal === "comment" && (
        <InputPrompt
          prompt="New comment"
          onSubmit={handleAddComment}
          onCancel={() => setModal("none")}
        />
      )}

      {modal === "due" && (
        <InputPrompt prompt="Due date" onSubmit={handleSetDueDate} onCancel={() => setModal("none")} />
      )}
      {modal === "deadline" && (
        <InputPrompt prompt="Deadline (YYYY-MM-DD)" onSubmit={handleSetDeadline} onCancel={() => setModal("none")} />
      )}
      {modal === "move" && (
        <ProjectPicker projects={projects} onSelect={handleMoveToProject} onCancel={() => setModal("none")} />
      )}
      {modal === "label" && (
        <LabelPicker labels={labels} currentLabels={task.labels} onSave={handleLabelsSave} onCancel={() => setModal("none")} />
      )}
      {modal === "editFull" && (
        <EditTaskModal task={task} projects={projects} labels={labels} onSave={handleEditFull} onCancel={() => setModal("none")} />
      )}

      {confirmAction === "delete" && (
        <ConfirmDialog
          message={`Delete "${task.content}"?`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmAction("none")}
        />
      )}

      <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
        <Text>
          <Text color="blue">[e]</Text><Text>dit </Text>
          <Text color="yellow">[c]</Text><Text>omplete </Text>
          <Text color="red">[d]</Text><Text>elete </Text>
          <Text color="cyan">[1-4]</Text><Text>prio </Text>
          <Text color="green">[t]</Text><Text>due </Text>
          <Text color="magenta">[D]</Text><Text>eadline </Text>
          <Text color="blue">[m]</Text><Text>ove </Text>
          <Text color="magenta">[l]</Text><Text>abel </Text>
          <Text color="green">[n]</Text><Text>ew comment </Text>
          <Text color="cyan">[o]</Text><Text>pen </Text>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Text>
        {statusMessage ? <Text color="yellow">{statusMessage}</Text> : null}
      </Box>
    </Box>
  );
}
