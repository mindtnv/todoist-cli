/**
 * Testing utilities for plugin authors.
 * Usage in plugin tests:
 *   import { createMockContext, createMockHookRegistry } from "todoist-cli/plugins/testing";
 */

import type {
  PluginContext,
  PluginApi,
  PluginStorage,
  PluginLogger,
  HookRegistry,
  HookEvent,
  HookHandler,
  HookContextMap,
  EmitResult,
  ViewRegistry,
  PluginViewDefinition,
  ExtensionRegistry,
  TaskColumnDefinition,
  DetailSectionDefinition,
  KeybindingDefinition,
  StatusBarItemDefinition,
  ModalDefinition,
  SidebarSectionDefinition,
  PaletteRegistry,
  PaletteCommandDefinition,
} from "./types.ts";

// ── Mock Storage (Map-based, no SQLite) ──

function createMockStorage(): PluginStorage {
  const kvStore = new Map<string, string>();
  const taskDataStore = new Map<string, string>(); // key = `${taskId}:${key}`

  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = kvStore.get(key);
      if (raw === undefined) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },

    async set<T>(key: string, value: T): Promise<void> {
      kvStore.set(key, JSON.stringify(value));
    },

    async delete(key: string): Promise<void> {
      kvStore.delete(key);
    },

    async list(prefix?: string): Promise<string[]> {
      if (!prefix) {
        return Array.from(kvStore.keys());
      }
      return Array.from(kvStore.keys()).filter((k) => k.startsWith(prefix));
    },

    async getTaskData<T>(taskId: string, key: string): Promise<T | null> {
      const compositeKey = `${taskId}:${key}`;
      const raw = taskDataStore.get(compositeKey);
      if (raw === undefined) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },

    async setTaskData<T>(taskId: string, key: string, value: T): Promise<void> {
      const compositeKey = `${taskId}:${key}`;
      taskDataStore.set(compositeKey, JSON.stringify(value));
    },

    transaction<T>(fn: () => T): T {
      return fn();
    },
  };
}

// ── Mock Logger (captures messages) ──

export interface MockLogger extends PluginLogger {
  messages: { level: "info" | "warn" | "error"; message: string }[];
}

function createMockLogger(): MockLogger {
  const messages: { level: "info" | "warn" | "error"; message: string }[] = [];

  return {
    messages,
    info(message: string) {
      messages.push({ level: "info", message });
    },
    warn(message: string) {
      messages.push({ level: "warn", message });
    },
    error(message: string) {
      messages.push({ level: "error", message });
    },
  };
}

// ── Mock API (returns empty arrays/objects) ──

function createMockApi(): PluginApi {
  const emptyTask = {
    id: "",
    content: "",
    description: "",
    project_id: "",
    section_id: null,
    parent_id: null,
    order: 0,
    priority: 1 as const,
    due: null,
    deadline: null,
    labels: [],
    assignee_id: null,
    is_completed: false,
    created_at: new Date().toISOString(),
    comment_count: 0,
    creator_id: "",
    url: "",
  };

  const emptyProject = {
    id: "",
    name: "",
    color: "",
    parent_id: null,
    order: 0,
    comment_count: 0,
    is_shared: false,
    is_favorite: false,
    is_inbox_project: false,
    view_style: "list" as const,
    url: "",
  };

  const emptyLabel = {
    id: "",
    name: "",
    color: "",
    order: 0,
    is_favorite: false,
  };

  const emptySection = {
    id: "",
    name: "",
    project_id: "",
    order: 0,
  };

  const emptyComment = {
    id: "",
    task_id: "",
    content: "",
    posted_at: new Date().toISOString(),
  };

  return {
    // Tasks
    getTasks: async () => [],
    getTask: async () => ({ ...emptyTask }),
    createTask: async () => ({ ...emptyTask }),
    updateTask: async () => ({ ...emptyTask }),
    closeTask: async () => {},
    reopenTask: async () => {},
    deleteTask: async () => {},
    // Projects
    getProjects: async () => [],
    getProject: async () => ({ ...emptyProject }),
    createProject: async () => ({ ...emptyProject }),
    updateProject: async () => ({ ...emptyProject }),
    deleteProject: async () => {},
    // Labels
    getLabels: async () => [],
    getLabel: async () => ({ ...emptyLabel }),
    createLabel: async () => ({ ...emptyLabel }),
    updateLabel: async () => ({ ...emptyLabel }),
    deleteLabel: async () => {},
    // Sections
    getSections: async () => [],
    getSection: async () => ({ ...emptySection }),
    createSection: async () => ({ ...emptySection }),
    updateSection: async () => ({ ...emptySection }),
    deleteSection: async () => {},
    // Comments
    getComments: async () => [],
    getComment: async () => ({ ...emptyComment }),
    createComment: async () => ({ ...emptyComment }),
    updateComment: async () => ({ ...emptyComment }),
    deleteComment: async () => {},
  };
}

// ── Public API ──

/**
 * Creates a mock PluginContext for use in plugin tests.
 *
 * Returns a PluginContext with:
 * - In-memory storage (Map-based, no SQLite)
 * - Mock API that returns empty arrays/objects
 * - Mock logger that captures messages
 * - Default pluginDir = "/tmp/test-plugin"
 * - Merged with any overrides
 */
export function createMockContext(overrides?: Partial<PluginContext>): PluginContext {
  return {
    api: createMockApi(),
    storage: createMockStorage(),
    config: {},
    pluginDir: "/tmp/test-plugin",
    log: createMockLogger(),
    ...overrides,
  };
}

/**
 * Creates a mock HookRegistry that records all emitted events for assertion.
 * The `emitted` array stores `{ event, ctx }` for each emit call.
 */
export function createMockHookRegistry(): HookRegistry & {
  emitted: Array<{ event: string; ctx: unknown }>;
} {
  const handlers = new Map<HookEvent, Set<HookHandler<any>>>();
  const emitted: Array<{ event: string; ctx: unknown }> = [];

  return {
    emitted,

    on<E extends HookEvent>(event: E, handler: HookHandler<E>, _pluginName?: string): void {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },

    off<E extends HookEvent>(event: E, handler: HookHandler<E>): void {
      handlers.get(event)?.delete(handler);
    },

    async emit<E extends HookEvent>(event: E, ctx: HookContextMap[E]): Promise<EmitResult> {
      emitted.push({ event, ctx });

      const messages: string[] = [];
      const eventHandlers = handlers.get(event);
      if (!eventHandlers) return { messages };

      for (const handler of eventHandlers) {
        try {
          const result = await handler(ctx);
          if (result?.message) messages.push(result.message);
          if (result?.cancel) {
            return { messages, cancelled: true, reason: result.reason };
          }
        } catch (err) {
          // Swallow errors in test mock, same as real registry
        }
      }

      return { messages };
    },

    removeAllForPlugin(_pluginName: string): void {
      // No-op in mock — no plugin name tracking needed for testing
    },
  };
}

/**
 * Creates a mock ExtensionRegistry that records all registered extensions.
 * Each category is available via the `registered` property for assertions.
 */
export function createMockExtensionRegistry(): ExtensionRegistry & {
  registered: {
    columns: TaskColumnDefinition[];
    sections: DetailSectionDefinition[];
    keybindings: KeybindingDefinition[];
    statusBarItems: StatusBarItemDefinition[];
    modals: ModalDefinition[];
    sidebarSections: SidebarSectionDefinition[];
  };
} {
  const columns: TaskColumnDefinition[] = [];
  const sections: DetailSectionDefinition[] = [];
  const keybindings: KeybindingDefinition[] = [];
  const statusBarItems: StatusBarItemDefinition[] = [];
  const modals: ModalDefinition[] = [];
  const sidebarSections: SidebarSectionDefinition[] = [];

  return {
    registered: { columns, sections, keybindings, statusBarItems, modals, sidebarSections },

    addTaskColumn(column: TaskColumnDefinition) {
      columns.push(column);
    },
    addDetailSection(section: DetailSectionDefinition) {
      sections.push(section);
    },
    addKeybinding(binding: KeybindingDefinition) {
      keybindings.push(binding);
    },
    addStatusBarItem(item: StatusBarItemDefinition) {
      statusBarItems.push(item);
    },
    addModal(definition: ModalDefinition) {
      modals.push(definition);
    },
    addSidebarSection(section: SidebarSectionDefinition) {
      sidebarSections.push(section);
    },

    removeTaskColumn(id: string) {
      const idx = columns.findIndex((c) => c.id === id);
      if (idx !== -1) columns.splice(idx, 1);
    },
    removeDetailSection(id: string) {
      const idx = sections.findIndex((s) => s.id === id);
      if (idx !== -1) sections.splice(idx, 1);
    },
    removeKeybinding(key: string) {
      const idx = keybindings.findIndex((k) => k.key === key);
      if (idx !== -1) keybindings.splice(idx, 1);
    },
    removeStatusBarItem(id: string) {
      const idx = statusBarItems.findIndex((s) => s.id === id);
      if (idx !== -1) statusBarItems.splice(idx, 1);
    },
    removeModal(id: string) {
      const idx = modals.findIndex((m) => m.id === id);
      if (idx !== -1) modals.splice(idx, 1);
    },
    removeSidebarSection(id: string) {
      const idx = sidebarSections.findIndex((s) => s.id === id);
      if (idx !== -1) sidebarSections.splice(idx, 1);
    },

    getTaskColumns: () => [...columns],
    getDetailSections: () => [...sections],
    getKeybindings: () => [...keybindings],
    getStatusBarItems: () => [...statusBarItems],
    getModals: () => [...modals],
    getSidebarSections: () => [...sidebarSections],
  };
}

/**
 * Creates a mock ViewRegistry that records all registered views.
 * The `registered` array stores all views passed to `addView`.
 */
export function createMockViewRegistry(): ViewRegistry & { registered: PluginViewDefinition[] } {
  const registered: PluginViewDefinition[] = [];

  return {
    registered,

    addView(view: PluginViewDefinition) {
      registered.push(view);
    },

    removeView(name: string) {
      const idx = registered.findIndex((v) => v.name === name);
      if (idx !== -1) registered.splice(idx, 1);
    },

    getViews() {
      return [...registered];
    },
  };
}

/**
 * Creates a mock PaletteRegistry that records all registered commands.
 * The `registered` array stores all commands passed to `addCommands`.
 */
export function createMockPaletteRegistry(): PaletteRegistry & {
  registered: PaletteCommandDefinition[];
} {
  const registered: PaletteCommandDefinition[] = [];

  return {
    registered,

    addCommands(commands: PaletteCommandDefinition[]) {
      registered.push(...commands);
    },

    removeCommands(labels: string[]) {
      const labelSet = new Set(labels);
      for (let i = registered.length - 1; i >= 0; i--) {
        const cmd = registered[i];
        if (cmd && labelSet.has(cmd.label)) {
          registered.splice(i, 1);
        }
      }
    },

    getCommands() {
      return [...registered];
    },
  };
}
