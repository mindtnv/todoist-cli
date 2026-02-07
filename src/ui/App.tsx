import React, { Component, useState, useEffect, useCallback, useRef } from "react";
import { render, Box, Text, useApp } from "ink";
import type { Task, Project, Label, Section } from "../api/types.ts";
import { getTasks } from "../api/tasks.ts";
import { getProjects } from "../api/projects.ts";
import { getLabels } from "../api/labels.ts";
import { getSections } from "../api/sections.ts";
import { TasksView } from "./views/TasksView.tsx";
import type { ListViewState } from "./views/TasksView.tsx";
import { TaskDetailView } from "./views/TaskDetailView.tsx";
import { StatsView } from "./views/StatsView.tsx";
import { CompletedView } from "./views/CompletedView.tsx";
import { ActivityView } from "./views/ActivityView.tsx";
import { createHookRegistry } from "../plugins/hook-registry.ts";
import { createViewRegistry } from "../plugins/view-registry.ts";
import { createExtensionRegistry } from "../plugins/extension-registry.ts";
import { createPaletteRegistry } from "../plugins/palette-registry.ts";
import { loadPlugins, unloadPlugins } from "../plugins/loader.ts";
import type { LoadedPlugins } from "../plugins/loader.ts";

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  override render() {
    if (this.state.error) {
      return (
        <Box flexDirection="column" padding={1}>
          <Text color="red" bold>Something went wrong</Text>
          <Text>{this.state.error.message}</Text>
          <Text dimColor>Press Ctrl+C to quit</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}

type View =
  | { type: "list" }
  | { type: "detail"; task: Task }
  | { type: "stats" }
  | { type: "completed" }
  | { type: "activity" }
  | { type: "plugin"; name: string };

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
  const [loadedPlugins, setLoadedPlugins] = useState<LoadedPlugins | null>(null);
  const listStateRef = useRef<ListViewState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadedRef: LoadedPlugins | null = null;

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

          // Load plugins
          try {
            const hooks = createHookRegistry();
            const viewReg = createViewRegistry();
            const extReg = createExtensionRegistry();
            const palReg = createPaletteRegistry();
            const lp = await loadPlugins(hooks, viewReg, extReg, palReg);
            loadedRef = lp;
            if (!cancelled) setLoadedPlugins(lp);
          } catch {
            // Plugin loading failure is non-fatal
          }
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
      if (loadedRef) unloadPlugins(loadedRef).catch(() => {});
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
      default: {
        const pluginViews = loadedPlugins?.views.getViews() ?? [];
        if (pluginViews.some(v => v.name === viewName)) {
          setView({ type: "plugin", name: viewName });
        } else {
          setView({ type: "list" });
        }
        break;
      }
    }
  }, [loadedPlugins]);

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
      <Box flexDirection="column" justifyContent="center" alignItems="center" width="100%" height="100%">
        <Text bold color="cyan">Todoist CLI</Text>
        <Box marginTop={1}>
          <Text color="gray">Loading your tasks...</Text>
        </Box>
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

  const renderView = () => {
    if (view.type === "detail") {
      return (
        <TaskDetailView
          task={view.task}
          allTasks={tasks}
          projects={projects}
          labels={labels}
          onBack={handleBackToList}
          onTaskChanged={handleTaskChanged}
          pluginSections={loadedPlugins?.extensions.getDetailSections()}
          pluginSectionContextMap={loadedPlugins?.detailSectionContextMap}
          pluginHooks={loadedPlugins?.hooks ?? null}
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

    if (view.type === "plugin" && loadedPlugins) {
      const pluginView = loadedPlugins.views.getViews().find(v => v.name === view.name);
      if (pluginView) {
        const ctx = loadedPlugins.viewContextMap.get(view.name);
        if (ctx) {
          const PluginComponent = pluginView.component;
          return (
            <PluginComponent
              onBack={handleBackToList}
              onNavigate={handleNavigate}
              ctx={ctx}
              tasks={tasks}
              projects={projects}
              labels={labels}
            />
          );
        }
      }
    }

    return (
      <TasksView
        tasks={tasks}
        projects={projects}
        labels={labels}
        onTasksChange={setTasks}
        onProjectsChange={setProjects}
        onLabelsChange={setLabels}
        onQuit={exit}
        onOpenTask={handleOpenTask}
        sections={sections}
        onNavigate={handleNavigate}
        initialStatus={statusMessage}
        onStatusClear={() => setStatusMessage("")}
        savedStateRef={listStateRef}
        pluginExtensions={loadedPlugins?.extensions ?? null}
        pluginPalette={loadedPlugins?.palette ?? null}
        pluginViews={loadedPlugins?.views ?? null}
        pluginKeybindingContextMap={loadedPlugins?.keybindingContextMap}
        pluginColumnContextMap={loadedPlugins?.columnContextMap}
        pluginPaletteContextMap={loadedPlugins?.paletteContextMap}
        pluginStatusBarContextMap={loadedPlugins?.statusBarContextMap}
        pluginHooks={loadedPlugins?.hooks ?? null}
      />
    );
  };

  return (
    <ErrorBoundary>
      {renderView()}
    </ErrorBoundary>
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
