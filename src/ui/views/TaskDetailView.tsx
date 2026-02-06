import { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { Task, Comment, Project, Label } from "../../api/types.ts";
import { getComments, createComment } from "../../api/comments.ts";
import { closeTask, deleteTask, getTasks } from "../../api/tasks.ts";
import { openUrl } from "../../utils/open-url.ts";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { InputPrompt } from "../components/InputPrompt.tsx";

interface TaskDetailViewProps {
  task: Task;
  allTasks?: Task[];
  projects: Project[];
  labels: Label[];
  onBack: () => void;
  onTaskChanged: (message?: string) => void;
}

const priorityLabels: Record<number, { label: string; color: string }> = {
  4: { label: "P4 (Urgent)", color: "red" },
  3: { label: "P3 (High)", color: "yellow" },
  2: { label: "P2 (Medium)", color: "blue" },
  1: { label: "P1 (Normal)", color: "white" },
};

export function TaskDetailView({ task, allTasks, projects, labels, onBack, onTaskChanged }: TaskDetailViewProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [statusMessage, setStatusMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<"none" | "delete">("none");
  const [modal, setModal] = useState<"none" | "comment">("none");
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
        // ignore
      });
    return () => {
      cancelled = true;
    };
  }, [task.id, allTasks]);

  const handleComplete = useCallback(async () => {
    try {
      setStatusMessage("Completing task...");
      await closeTask(task.id);
      onTaskChanged("Task completed!");
    } catch {
      setStatusMessage("Failed to complete task");
    }
  }, [task.id, onTaskChanged]);

  const handleDeleteConfirm = useCallback(async () => {
    setConfirmAction("none");
    try {
      setStatusMessage("Deleting task...");
      await deleteTask(task.id);
      onTaskChanged("Task deleted!");
    } catch {
      setStatusMessage("Failed to delete task");
    }
  }, [task.id, onTaskChanged]);

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

  useInput((input, key) => {
    if (confirmAction !== "none") return;
    if (modal !== "none") return;

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
            const parts = task.deadline!.date.split("-").map(Number);
            const y = parts[0] ?? 2025;
            const m = parts[1] ?? 1;
            const d = parts[2] ?? 1;
            const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const formatted = `${months[m - 1]} ${d}, ${y}`;
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
            const isOverdue = task.deadline!.date < todayStr;
            return (
              <Box>
                <Box width={14}><Text color="gray">Deadline:</Text></Box>
                <Text color="red" bold={isOverdue}>
                  {formatted}{isOverdue ? " (OVERDUE!)" : ""}
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
            <Text>{(() => {
              const d = new Date(task.created_at);
              const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
              return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
            })()}</Text>
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
        </Box>
      </Box>

      {modal === "comment" && (
        <InputPrompt
          prompt="New comment"
          onSubmit={handleAddComment}
          onCancel={() => setModal("none")}
        />
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
          <Text color="yellow">[c]</Text><Text>omplete </Text>
          <Text color="red">[d]</Text><Text>elete </Text>
          <Text color="green">[n]</Text><Text>ew comment </Text>
          <Text color="cyan">[o]</Text><Text>pen </Text>
          <Text color="gray">[j/k]</Text><Text> scroll </Text>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Text>
        {statusMessage ? <Text color="yellow">{statusMessage}</Text> : null}
      </Box>
    </Box>
  );
}
