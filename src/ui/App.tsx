import { useState, useEffect, useCallback } from "react";
import { render, Box, Text, useApp } from "ink";
import type { Task, Project, Label, Section } from "../api/types.ts";
import { getTasks } from "../api/tasks.ts";
import { getProjects } from "../api/projects.ts";
import { getLabels } from "../api/labels.ts";
import { getSections } from "../api/sections.ts";
import { TasksView } from "./views/TasksView.tsx";
import { TaskDetailView } from "./views/TaskDetailView.tsx";
import { StatsView } from "./views/StatsView.tsx";
import { CompletedView } from "./views/CompletedView.tsx";
import { ActivityView } from "./views/ActivityView.tsx";

type View =
  | { type: "list" }
  | { type: "detail"; task: Task }
  | { type: "stats" }
  | { type: "completed" }
  | { type: "activity" };

function App() {
  const { exit } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ type: "list" });
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [t, p, l, s] = await Promise.all([
          getTasks(),
          getProjects(),
          getLabels(),
          getSections(),
        ]);
        if (!cancelled) {
          setTasks(t);
          setProjects(p);
          setLabels(l);
          setSections(s);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load data");
          setLoading(false);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenTask = useCallback((task: Task) => {
    setView({ type: "detail", task });
  }, []);

  const handleBackToList = useCallback(() => {
    setView({ type: "list" });
  }, []);

  const handleNavigate = useCallback((viewName: string) => {
    switch (viewName) {
      case "stats":
        setView({ type: "stats" });
        break;
      case "completed":
        setView({ type: "completed" });
        break;
      case "activity":
        setView({ type: "activity" });
        break;
      default:
        setView({ type: "list" });
        break;
    }
  }, []);

  const handleTaskChanged = useCallback(async (message?: string) => {
    if (message) setStatusMessage(message);
    try {
      const newTasks = await getTasks();
      setTasks(newTasks);
    } catch {
      setStatusMessage("Failed to refresh tasks after change");
    }
    setView({ type: "list" });
  }, []);

  if (loading) {
    return (
      <Box justifyContent="center" alignItems="center" width="100%" height="100%">
        <Text color="cyan">Loading Todoist data...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" justifyContent="center" alignItems="center" width="100%" height="100%">
        <Text color="red">Error: {error}</Text>
        <Text color="gray">Make sure you have configured your API token with: todoist auth login</Text>
      </Box>
    );
  }

  if (view.type === "detail") {
    return (
      <TaskDetailView
        task={view.task}
        allTasks={tasks}
        projects={projects}
        labels={labels}
        onBack={handleBackToList}
        onTaskChanged={handleTaskChanged}
      />
    );
  }

  if (view.type === "stats") {
    return <StatsView onBack={handleBackToList} />;
  }

  if (view.type === "completed") {
    return <CompletedView onBack={handleBackToList} />;
  }

  if (view.type === "activity") {
    return <ActivityView onBack={handleBackToList} />;
  }

  return (
    <TasksView
      tasks={tasks}
      projects={projects}
      labels={labels}
      onTasksChange={setTasks}
      onQuit={exit}
      onOpenTask={handleOpenTask}
      sections={sections}
      onNavigate={handleNavigate}
      initialStatus={statusMessage}
      onStatusClear={() => setStatusMessage("")}
    />
  );
}

export async function launchUI(): Promise<void> {
  // Enter alternate screen buffer (like vim/htop) — clean TUI, restores terminal on exit
  process.stdout.write("\x1b[?1049h");
  process.stdout.write("\x1b[H\x1b[2J");

  const instance = render(<App />, { exitOnCtrlC: true });

  await instance.waitUntilExit();

  // Leave alternate screen buffer — restore previous terminal content
  process.stdout.write("\x1b[?1049l");
}
