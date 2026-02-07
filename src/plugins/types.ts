import type { Command as CliCommand } from "commander";
import type {
  Task, Project, Label, Section, Comment,
  CreateTaskParams, UpdateTaskParams, TaskFilter,
  CreateProjectParams, UpdateProjectParams,
  CreateLabelParams, UpdateLabelParams,
  CreateSectionParams, UpdateSectionParams,
  CreateCommentParams, UpdateCommentParams,
} from "../api/types.ts";

// ── Plugin Storage ──

export interface PluginStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  getTaskData<T>(taskId: string, key: string): Promise<T | null>;
  setTaskData<T>(taskId: string, key: string, value: T): Promise<void>;
  transaction<T>(fn: () => T): T;
}

// ── Plugin Logger ──

export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// ── Plugin UI API ──

export interface PluginUiApi {
  showStatus(message: string): void;
  notify(message: string, opts?: { level?: "info" | "success" | "warning" | "error"; duration?: number; persistent?: boolean }): void;
  navigate(view: string): void;
  openModal(modalId: string): void;
  refreshTasks(): void;
}

// ── Plugin Context ──

export interface PluginContext {
  api: PluginApi;
  storage: PluginStorage;
  config: Record<string, unknown>;
  pluginDir: string;
  log: PluginLogger;
  ui?: PluginUiApi;  // only available in TUI mode
}

export interface PluginApi {
  // Tasks
  getTasks: (filter?: TaskFilter) => Promise<Task[]>;
  getTask: (id: string) => Promise<Task>;
  createTask: (params: CreateTaskParams) => Promise<Task>;
  updateTask: (id: string, params: UpdateTaskParams) => Promise<Task>;
  closeTask: (id: string) => Promise<void>;
  reopenTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  // Projects
  getProjects: () => Promise<Project[]>;
  getProject: (id: string) => Promise<Project>;
  createProject: (params: CreateProjectParams) => Promise<Project>;
  updateProject: (id: string, params: UpdateProjectParams) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  // Labels
  getLabels: () => Promise<Label[]>;
  getLabel: (id: string) => Promise<Label>;
  createLabel: (params: CreateLabelParams) => Promise<Label>;
  updateLabel: (id: string, params: UpdateLabelParams) => Promise<Label>;
  deleteLabel: (id: string) => Promise<void>;
  // Sections
  getSections: (projectId?: string) => Promise<Section[]>;
  getSection: (id: string) => Promise<Section>;
  createSection: (params: CreateSectionParams) => Promise<Section>;
  updateSection: (id: string, params: UpdateSectionParams) => Promise<Section>;
  deleteSection: (id: string) => Promise<void>;
  // Comments
  getComments: (taskId: string) => Promise<Comment[]>;
  getComment: (id: string) => Promise<Comment>;
  createComment: (params: CreateCommentParams) => Promise<Comment>;
  updateComment: (id: string, params: UpdateCommentParams) => Promise<Comment>;
  deleteComment: (id: string) => Promise<void>;
}

// ── Hook Registry ──

export type HookEvent =
  // Tasks
  | "task.creating"
  | "task.created"
  | "task.completing"
  | "task.completed"
  | "task.updating"
  | "task.updated"
  | "task.deleting"
  | "task.deleted"
  // Projects
  | "project.creating"
  | "project.created"
  | "project.updating"
  | "project.updated"
  | "project.deleting"
  | "project.deleted"
  // Labels
  | "label.creating"
  | "label.created"
  | "label.updating"
  | "label.updated"
  | "label.deleting"
  | "label.deleted"
  // Sections
  | "section.creating"
  | "section.created"
  | "section.updating"
  | "section.updated"
  | "section.deleting"
  | "section.deleted"
  // Comments
  | "comment.creating"
  | "comment.created"
  | "comment.updating"
  | "comment.updated"
  | "comment.deleting"
  | "comment.deleted"
  // App lifecycle
  | "app.loaded"
  | "app.unloading"
  | "view.changed";

// ── Per-event hook context types ──

// Task contexts
export interface TaskCreatingContext { params: CreateTaskParams }
export interface TaskCreatedContext { task: Task }
export interface TaskCompletingContext { task: Task }
export interface TaskCompletedContext { task: Task }
export interface TaskUpdatingContext { task: Task; changes: UpdateTaskParams }
export interface TaskUpdatedContext { task: Task; changes: UpdateTaskParams }
export interface TaskDeletingContext { task: Task }
export interface TaskDeletedContext { task: Task }

// Project contexts
export interface ProjectCreatingContext { params: CreateProjectParams }
export interface ProjectCreatedContext { project: Project }
export interface ProjectUpdatingContext { project: Project; changes: UpdateProjectParams }
export interface ProjectUpdatedContext { project: Project; changes: UpdateProjectParams }
export interface ProjectDeletingContext { project: Project }
export interface ProjectDeletedContext { project: Project }

// Label contexts
export interface LabelCreatingContext { params: CreateLabelParams }
export interface LabelCreatedContext { label: Label }
export interface LabelUpdatingContext { label: Label; changes: UpdateLabelParams }
export interface LabelUpdatedContext { label: Label; changes: UpdateLabelParams }
export interface LabelDeletingContext { label: Label }
export interface LabelDeletedContext { label: Label }

// Section contexts
export interface SectionCreatingContext { params: CreateSectionParams }
export interface SectionCreatedContext { section: Section }
export interface SectionUpdatingContext { section: Section; changes: UpdateSectionParams }
export interface SectionUpdatedContext { section: Section; changes: UpdateSectionParams }
export interface SectionDeletingContext { section: Section }
export interface SectionDeletedContext { section: Section }

// Comment contexts
export interface CommentCreatingContext { params: CreateCommentParams }
export interface CommentCreatedContext { comment: Comment }
export interface CommentUpdatingContext { comment: Comment; changes: UpdateCommentParams }
export interface CommentUpdatedContext { comment: Comment; changes: UpdateCommentParams }
export interface CommentDeletingContext { comment: Comment }
export interface CommentDeletedContext { comment: Comment }

// App lifecycle contexts
export interface AppLoadedContext {}
export interface AppUnloadingContext {}
export interface ViewChangedContext { from?: string; to: string }

export type HookContextMap = {
  // Tasks
  "task.creating": TaskCreatingContext;
  "task.created": TaskCreatedContext;
  "task.completing": TaskCompletingContext;
  "task.completed": TaskCompletedContext;
  "task.updating": TaskUpdatingContext;
  "task.updated": TaskUpdatedContext;
  "task.deleting": TaskDeletingContext;
  "task.deleted": TaskDeletedContext;
  // Projects
  "project.creating": ProjectCreatingContext;
  "project.created": ProjectCreatedContext;
  "project.updating": ProjectUpdatingContext;
  "project.updated": ProjectUpdatedContext;
  "project.deleting": ProjectDeletingContext;
  "project.deleted": ProjectDeletedContext;
  // Labels
  "label.creating": LabelCreatingContext;
  "label.created": LabelCreatedContext;
  "label.updating": LabelUpdatingContext;
  "label.updated": LabelUpdatedContext;
  "label.deleting": LabelDeletingContext;
  "label.deleted": LabelDeletedContext;
  // Sections
  "section.creating": SectionCreatingContext;
  "section.created": SectionCreatedContext;
  "section.updating": SectionUpdatingContext;
  "section.updated": SectionUpdatedContext;
  "section.deleting": SectionDeletingContext;
  "section.deleted": SectionDeletedContext;
  // Comments
  "comment.creating": CommentCreatingContext;
  "comment.created": CommentCreatedContext;
  "comment.updating": CommentUpdatingContext;
  "comment.updated": CommentUpdatedContext;
  "comment.deleting": CommentDeletingContext;
  "comment.deleted": CommentDeletedContext;
  // App lifecycle
  "app.loaded": AppLoadedContext;
  "app.unloading": AppUnloadingContext;
  "view.changed": ViewChangedContext;
};

/** Union of all hook context types — kept for backward compatibility */
export type HookContext = HookContextMap[HookEvent];

/**
 * Result type returned by hook handlers.
 * - `message`: Optional status message to display.
 * - `params`: For "before" hooks only — partial params to merge into the context
 *   (waterfall pattern: each handler's params are merged before the next handler runs).
 * - `cancel`: For "before" hooks only — if true, the operation is aborted.
 * - `reason`: Optional reason string when cancelling.
 */
export type HookHandlerResult<E extends HookEvent = HookEvent> = {
  message?: string;
  params?: HookContextMap[E] extends { params: infer P } ? Partial<P> : never;
  cancel?: boolean;
  reason?: string;
} | void;

export type HookHandler<E extends HookEvent = HookEvent> = (ctx: HookContextMap[E]) => Promise<HookHandlerResult<E>>;

/**
 * Result returned by HookRegistry.emit().
 * - `messages`: Status messages collected from handlers.
 * - `cancelled`: True if a "before" handler cancelled the operation.
 * - `reason`: Reason string from the cancelling handler.
 * - `params`: For "before" hooks — the final merged params after waterfall processing.
 */
export type EmitResult = {
  messages: string[];
  cancelled?: boolean;
  reason?: string;
  params?: Record<string, unknown>;
};

export interface HookRegistry {
  on<E extends HookEvent>(event: E, handler: HookHandler<E>, pluginName?: string): void;
  off<E extends HookEvent>(event: E, handler: HookHandler<E>): void;
  emit<E extends HookEvent>(event: E, ctx: HookContextMap[E]): Promise<EmitResult>;
  removeAllForPlugin(pluginName: string): void;
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
  removeView(name: string): void;
  getViews(): PluginViewDefinition[];
}

// ── Modal Definition ──

export interface ModalDefinition {
  id: string;
  component: React.ComponentType<{ onClose: () => void; currentTask?: Task | null }>;
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

export interface SidebarItemDefinition {
  id: string;
  label: string;
  icon?: string;
  onSelect: () => void;
  badge?: string | number;
}

export interface SidebarSectionDefinition {
  id: string;
  label: string;
  position: number;  // lower = higher in sidebar
  items: SidebarItemDefinition[];
}

export interface ExtensionRegistry {
  addTaskColumn(column: TaskColumnDefinition): void;
  addDetailSection(section: DetailSectionDefinition): void;
  addKeybinding(binding: KeybindingDefinition): void;
  addStatusBarItem(item: StatusBarItemDefinition): void;
  addModal(definition: ModalDefinition): void;
  addSidebarSection(section: SidebarSectionDefinition): void;
  removeTaskColumn(id: string): void;
  removeDetailSection(id: string): void;
  removeKeybinding(key: string): void;
  removeStatusBarItem(id: string): void;
  removeModal(id: string): void;
  removeSidebarSection(id: string): void;
  getTaskColumns(): TaskColumnDefinition[];
  getDetailSections(): DetailSectionDefinition[];
  getKeybindings(): KeybindingDefinition[];
  getStatusBarItems(): StatusBarItemDefinition[];
  getModals(): ModalDefinition[];
  getSidebarSections(): SidebarSectionDefinition[];
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
  removeCommands(labels: string[]): void;
  getCommands(): PaletteCommandDefinition[];
}

// ── Plugin Registries (passed to register()) ──

export interface PluginRegistries {
  hooks: HookRegistry;
  views: ViewRegistry;
  extensions: ExtensionRegistry;
  palette: PaletteRegistry;
}

// ── Plugin Interface ──

export interface TodoistPlugin {
  name: string;
  version?: string;
  description?: string;
  /** Register hooks, views, extensions, palette commands — all in one call */
  register?(registries: PluginRegistries): void;
  /** CLI-only: register Commander.js subcommands */
  registerCommands?(program: CliCommand, ctx: PluginContext): void;
  onLoad?(ctx: PluginContext): Promise<void>;
  onUnload?(ctx: PluginContext): Promise<void>;
}

// ── Plugin Manifest (plugin.json) ──

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  main: string;
  author?: string;
  engines?: { "todoist-cli"?: string };
}

// ── Plugin Config (in config.toml) ──

export interface PluginConfigEntry {
  source: string;
  enabled?: boolean;
  after?: string;
  path?: string; // absolute path to plugin directory (overrides PLUGINS_DIR/name)
  [key: string]: unknown;
}
