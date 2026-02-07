import type { Command as CliCommand } from "commander";
import type {
  Task, Project, Label, Section, Comment,
  CreateTaskParams, UpdateTaskParams, TaskFilter,
} from "../api/types.ts";

// ── Plugin Storage ──

export interface PluginStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  getTaskData<T>(taskId: string, key: string): Promise<T | null>;
  setTaskData<T>(taskId: string, key: string, value: T): Promise<void>;
}

// ── Plugin Logger ──

export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// ── Plugin Context ──

export interface PluginContext {
  api: PluginApi;
  storage: PluginStorage;
  config: Record<string, unknown>;
  pluginDir: string;
  log: PluginLogger;
}

export interface PluginApi {
  getTasks: (filter?: TaskFilter) => Promise<Task[]>;
  getTask: (id: string) => Promise<Task>;
  createTask: (params: CreateTaskParams) => Promise<Task>;
  updateTask: (id: string, params: UpdateTaskParams) => Promise<Task>;
  closeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  getProjects: () => Promise<Project[]>;
  getProject: (id: string) => Promise<Project>;
  getLabels: () => Promise<Label[]>;
  getLabel: (id: string) => Promise<Label>;
  getSections: (projectId?: string) => Promise<Section[]>;
  getComments: (taskId: string) => Promise<Comment[]>;
}

// ── Hook Registry ──

export type HookEvent =
  | "task.creating"
  | "task.created"
  | "task.completing"
  | "task.completed"
  | "task.updating"
  | "task.updated"
  | "task.deleting"
  | "task.deleted";

// ── Per-event hook context types ──

export interface TaskCreatingContext { params: CreateTaskParams }
export interface TaskCreatedContext { task: Task }
export interface TaskCompletingContext { task: Task }
export interface TaskCompletedContext { task: Task }
export interface TaskUpdatingContext { task: Task; changes: UpdateTaskParams }
export interface TaskUpdatedContext { task: Task; changes: UpdateTaskParams }
export interface TaskDeletingContext { task: Task }
export interface TaskDeletedContext { task: Task }

export type HookContextMap = {
  "task.creating": TaskCreatingContext;
  "task.created": TaskCreatedContext;
  "task.completing": TaskCompletingContext;
  "task.completed": TaskCompletedContext;
  "task.updating": TaskUpdatingContext;
  "task.updated": TaskUpdatedContext;
  "task.deleting": TaskDeletingContext;
  "task.deleted": TaskDeletedContext;
};

/** Union of all hook context types — kept for backward compatibility */
export type HookContext = HookContextMap[HookEvent];

export type HookHandler<E extends HookEvent = HookEvent> = (ctx: HookContextMap[E]) => Promise<{ message?: string } | void>;

export interface HookRegistry {
  on<E extends HookEvent>(event: E, handler: HookHandler<E>): void;
  off<E extends HookEvent>(event: E, handler: HookHandler<E>): void;
  emit<E extends HookEvent>(event: E, ctx: HookContextMap[E]): Promise<string[]>;
}

// ── View Registry ──

export interface PluginViewDefinition {
  name: string;
  label: string;
  component: React.ComponentType<PluginViewProps>;
  sidebar?: { icon: string; section: string };
  shortcut?: string;
}

export interface PluginViewProps {
  onBack: () => void;
  onNavigate: (view: string) => void;
  ctx: PluginContext;
  tasks: Task[];
  projects: Project[];
  labels: Label[];
}

export interface ViewRegistry {
  addView(view: PluginViewDefinition): void;
  getViews(): PluginViewDefinition[];
}

// ── Extension Registry ──

export interface TaskColumnDefinition {
  id: string;
  label: string;
  width: number;
  position: "after-priority" | "after-due" | "before-content";
  render: (task: Task, ctx: PluginContext) => string;
  color?: (task: Task) => string;
  refreshInterval?: number; // ms — triggers re-render at this interval (e.g. 1000 for live timer)
}

export interface StatusBarItemDefinition {
  id: string;
  render: (ctx: PluginContext) => string;
  color?: (ctx: PluginContext) => string;
  refreshInterval?: number; // ms
}

export interface DetailSectionDefinition {
  id: string;
  label: string;
  position: "after-comments" | "after-subtasks" | "after-labels";
  component: React.ComponentType<{ task: Task; ctx: PluginContext }>;
}

export interface KeybindingDefinition {
  key: string;
  description: string;
  helpSection: string;
  action: (ctx: PluginContext, currentTask: Task | null) => Promise<{ statusMessage?: string } | void>;
}

export interface ExtensionRegistry {
  addTaskColumn(column: TaskColumnDefinition): void;
  addDetailSection(section: DetailSectionDefinition): void;
  addKeybinding(binding: KeybindingDefinition): void;
  addStatusBarItem(item: StatusBarItemDefinition): void;
  getTaskColumns(): TaskColumnDefinition[];
  getDetailSections(): DetailSectionDefinition[];
  getKeybindings(): KeybindingDefinition[];
  getStatusBarItems(): StatusBarItemDefinition[];
}

// ── Palette Registry ──

export interface PaletteInputPrompt {
  label: string;
  placeholder?: string;
  formatPreview?: (value: string) => string;
}

export interface PaletteCommandDefinition {
  label: string;
  category: string;
  shortcut?: string;
  inputPrompt?: PaletteInputPrompt;
  action: (
    ctx: PluginContext,
    currentTask: Task | null,
    navigate: (view: string) => void,
    input?: string,
  ) => Promise<void> | void;
}

export interface PaletteRegistry {
  addCommands(commands: PaletteCommandDefinition[]): void;
  getCommands(): PaletteCommandDefinition[];
}

// ── Plugin Interface ──

export interface TodoistPlugin {
  name: string;
  version: string;
  description?: string;
  registerCommands?(program: CliCommand, ctx: PluginContext): void;
  registerViews?(registry: ViewRegistry): void;
  registerHooks?(hooks: HookRegistry): void;
  registerExtensions?(extensions: ExtensionRegistry): void;
  registerPaletteCommands?(palette: PaletteRegistry): void;
  onLoad?(ctx: PluginContext): Promise<void>;
  onUnload?(): Promise<void>;
}

// ── Plugin Manifest (plugin.json) ──

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  main: string;
  author?: string;
  source?: string;
  engines?: { "todoist-cli"?: string };
  permissions?: string[];
}

// ── Plugin Config (in config.toml) ──

export interface PluginConfigEntry {
  source: string;
  enabled?: boolean;
  after?: string;
  [key: string]: unknown;
}
