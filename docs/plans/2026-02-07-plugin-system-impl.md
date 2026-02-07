# Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a static plugin system that allows extending todoist-cli with new CLI commands, TUI views, task event hooks, TaskRow columns, TaskDetail sections, Command Palette commands, and keybindings.

**Architecture:** Plugin types + registries in `src/plugins/`, API proxy for event hooks, plugin loader with `import()`, CLI commands for install/remove, TUI integration via registry props passed through component tree.

**Tech Stack:** TypeScript, Bun (bun:sqlite for storage), Commander.js, Ink/React, TOML config

**Design Doc:** `docs/plans/2026-02-07-plugin-system-design.md`

---

## Phase 1: Foundation (sequential — everything depends on this)

### Task 1: Plugin Type Definitions

**Files:**
- Create: `src/plugins/types.ts`

**Step 1: Create type definitions**

```typescript
// src/plugins/types.ts
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

export interface HookContext {
  task?: Task;
  taskId?: string;
  params?: CreateTaskParams;
  changes?: Partial<UpdateTaskParams>;
}

export type HookHandler = (ctx: HookContext) => Promise<{ message?: string } | void>;

export interface HookRegistry {
  on(event: HookEvent, handler: HookHandler): void;
  off(event: HookEvent, handler: HookHandler): void;
  emit(event: HookEvent, ctx: HookContext): Promise<string[]>;
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
  getTaskColumns(): TaskColumnDefinition[];
  getDetailSections(): DetailSectionDefinition[];
  getKeybindings(): KeybindingDefinition[];
}

// ── Palette Registry ──

export interface PaletteCommandDefinition {
  label: string;
  category: string;
  shortcut?: string;
  action: (
    ctx: PluginContext,
    currentTask: Task | null,
    navigate: (view: string) => void,
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
  registerCommands?(program: CliCommand): void;
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
```

**Step 2: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: No errors related to `src/plugins/types.ts`

**Step 3: Commit**

```bash
git add src/plugins/types.ts
git commit -m "feat(plugins): add plugin system type definitions"
```

---

## Phase 2: Core Modules (parallel — no interdependencies)

### Task 2A: Hook Registry

**Files:**
- Create: `src/plugins/hook-registry.ts`

**Implementation:**

```typescript
// src/plugins/hook-registry.ts
import type { HookEvent, HookHandler, HookContext, HookRegistry } from "./types.ts";

export function createHookRegistry(): HookRegistry {
  const handlers = new Map<HookEvent, Set<HookHandler>>();

  return {
    on(event: HookEvent, handler: HookHandler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },

    off(event: HookEvent, handler: HookHandler) {
      handlers.get(event)?.delete(handler);
    },

    async emit(event: HookEvent, ctx: HookContext): Promise<string[]> {
      const messages: string[] = [];
      const eventHandlers = handlers.get(event);
      if (!eventHandlers) return messages;

      for (const handler of eventHandlers) {
        try {
          const result = await handler(ctx);
          if (result?.message) messages.push(result.message);
        } catch (err) {
          console.error(`[plugin-hook] Error in ${event} handler:`, err);
        }
      }
      return messages;
    },
  };
}
```

**Commit:** `git commit -m "feat(plugins): add hook registry for task event hooks"`

---

### Task 2B: View Registry

**Files:**
- Create: `src/plugins/view-registry.ts`

**Implementation:**

```typescript
// src/plugins/view-registry.ts
import type { PluginViewDefinition, ViewRegistry } from "./types.ts";

export function createViewRegistry(): ViewRegistry {
  const views: PluginViewDefinition[] = [];

  return {
    addView(view: PluginViewDefinition) {
      if (views.some(v => v.name === view.name)) {
        console.warn(`[plugin] View "${view.name}" already registered, skipping`);
        return;
      }
      views.push(view);
    },

    getViews() {
      return [...views];
    },
  };
}
```

**Commit:** `git commit -m "feat(plugins): add view registry for plugin TUI views"`

---

### Task 2C: Extension Registry

**Files:**
- Create: `src/plugins/extension-registry.ts`

**Implementation:**

```typescript
// src/plugins/extension-registry.ts
import type {
  TaskColumnDefinition,
  DetailSectionDefinition,
  KeybindingDefinition,
  ExtensionRegistry,
} from "./types.ts";

export function createExtensionRegistry(): ExtensionRegistry {
  const columns: TaskColumnDefinition[] = [];
  const sections: DetailSectionDefinition[] = [];
  const keybindings: KeybindingDefinition[] = [];

  return {
    addTaskColumn(column: TaskColumnDefinition) {
      if (columns.some(c => c.id === column.id)) {
        console.warn(`[plugin] Column "${column.id}" already registered, skipping`);
        return;
      }
      columns.push(column);
    },

    addDetailSection(section: DetailSectionDefinition) {
      if (sections.some(s => s.id === section.id)) {
        console.warn(`[plugin] Detail section "${section.id}" already registered, skipping`);
        return;
      }
      sections.push(section);
    },

    addKeybinding(binding: KeybindingDefinition) {
      if (keybindings.some(k => k.key === binding.key)) {
        console.warn(`[plugin] Keybinding "${binding.key}" already registered, skipping`);
        return;
      }
      keybindings.push(binding);
    },

    getTaskColumns: () => [...columns],
    getDetailSections: () => [...sections],
    getKeybindings: () => [...keybindings],
  };
}
```

**Commit:** `git commit -m "feat(plugins): add extension registry for columns, sections, keybindings"`

---

### Task 2D: Palette Registry

**Files:**
- Create: `src/plugins/palette-registry.ts`

**Implementation:**

```typescript
// src/plugins/palette-registry.ts
import type { PaletteCommandDefinition, PaletteRegistry } from "./types.ts";

export function createPaletteRegistry(): PaletteRegistry {
  const commands: PaletteCommandDefinition[] = [];

  return {
    addCommands(newCommands: PaletteCommandDefinition[]) {
      commands.push(...newCommands);
    },

    getCommands() {
      return [...commands];
    },
  };
}
```

**Commit:** `git commit -m "feat(plugins): add palette registry for command palette commands"`

---

### Task 2E: Plugin Storage (SQLite)

**Files:**
- Create: `src/plugins/storage.ts`

**Implementation:**

Uses `bun:sqlite` (built-in, no npm dependency needed).

```typescript
// src/plugins/storage.ts
import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { PluginStorage } from "./types.ts";

export function createPluginStorage(dataDir: string): PluginStorage {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = join(dataDir, "data.db");
  const db = new Database(dbPath);

  db.run(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS task_data (task_id TEXT, key TEXT, value TEXT, PRIMARY KEY (task_id, key))`);

  const getStmt = db.prepare("SELECT value FROM kv WHERE key = ?");
  const setStmt = db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)");
  const delStmt = db.prepare("DELETE FROM kv WHERE key = ?");
  const listStmt = db.prepare("SELECT key FROM kv WHERE key LIKE ?");

  const getTaskStmt = db.prepare("SELECT value FROM task_data WHERE task_id = ? AND key = ?");
  const setTaskStmt = db.prepare("INSERT OR REPLACE INTO task_data (task_id, key, value) VALUES (?, ?, ?)");

  return {
    async get<T>(key: string): Promise<T | null> {
      const row = getStmt.get(key) as { value: string } | null;
      return row ? JSON.parse(row.value) as T : null;
    },

    async set<T>(key: string, value: T): Promise<void> {
      setStmt.run(key, JSON.stringify(value));
    },

    async delete(key: string): Promise<void> {
      delStmt.run(key);
    },

    async list(prefix?: string): Promise<string[]> {
      const pattern = prefix ? `${prefix}%` : "%";
      const rows = listStmt.all(pattern) as Array<{ key: string }>;
      return rows.map(r => r.key);
    },

    async getTaskData<T>(taskId: string, key: string): Promise<T | null> {
      const row = getTaskStmt.get(taskId, key) as { value: string } | null;
      return row ? JSON.parse(row.value) as T : null;
    },

    async setTaskData<T>(taskId: string, key: string, value: T): Promise<void> {
      setTaskStmt.run(taskId, key, JSON.stringify(value));
    },
  };
}
```

**Commit:** `git commit -m "feat(plugins): add SQLite-backed plugin storage"`

---

## Phase 3: Integration Glue (parallel after Phase 2)

### Task 3A: API Proxy with Event Hooks

**Files:**
- Create: `src/plugins/api-proxy.ts`

**Implementation:**

Wraps the real API functions and emits hook events before/after each operation.

```typescript
// src/plugins/api-proxy.ts
import type { HookRegistry, PluginApi } from "./types.ts";
import * as tasksApi from "../api/tasks.ts";
import type { TaskFilter, CreateTaskParams, UpdateTaskParams } from "../api/types.ts";

export function createApiProxy(hooks: HookRegistry): PluginApi {
  return {
    getTasks: (filter?: TaskFilter) => tasksApi.getTasks(filter),
    getTask: (id: string) => tasksApi.getTask(id),

    async createTask(params: CreateTaskParams) {
      await hooks.emit("task.creating", { params });
      const task = await tasksApi.createTask(params);
      await hooks.emit("task.created", { task });
      return task;
    },

    async updateTask(id: string, changes: UpdateTaskParams) {
      const task = await tasksApi.getTask(id);
      await hooks.emit("task.updating", { task, changes });
      const updated = await tasksApi.updateTask(id, changes);
      await hooks.emit("task.updated", { task: updated, changes });
      return updated;
    },

    async closeTask(id: string) {
      const task = await tasksApi.getTask(id);
      await hooks.emit("task.completing", { task });
      await tasksApi.closeTask(id);
      await hooks.emit("task.completed", { task });
    },

    async reopenTask(id: string) {
      await tasksApi.reopenTask(id);
    },

    async deleteTask(id: string) {
      const task = await tasksApi.getTask(id);
      await hooks.emit("task.deleting", { task });
      await tasksApi.deleteTask(id);
      await hooks.emit("task.deleted", { taskId: id });
    },
  };
}
```

**Commit:** `git commit -m "feat(plugins): add API proxy that emits hook events"`

---

### Task 3B: Plugin Loader

**Files:**
- Create: `src/plugins/loader.ts`

**Implementation:**

Reads plugin config, imports each plugin, calls lifecycle methods.

```typescript
// src/plugins/loader.ts
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import type {
  TodoistPlugin, PluginManifest, PluginContext,
  HookRegistry, ViewRegistry, ExtensionRegistry, PaletteRegistry,
  PluginConfigEntry, PluginLogger,
} from "./types.ts";
import { createPluginStorage } from "./storage.ts";
import { createApiProxy } from "./api-proxy.ts";
import { getConfig } from "../config/index.ts";

const PLUGINS_DIR = join(homedir(), ".config", "todoist-cli", "plugins");

function createLogger(pluginName: string): PluginLogger {
  return {
    info: (msg: string) => console.log(`[plugin:${pluginName}] ${msg}`),
    warn: (msg: string) => console.warn(`[plugin:${pluginName}] ${msg}`),
    error: (msg: string) => console.error(`[plugin:${pluginName}] ${msg}`),
  };
}

export interface LoadedPlugins {
  plugins: Array<{ plugin: TodoistPlugin; ctx: PluginContext }>;
  hooks: HookRegistry;
  views: ViewRegistry;
  extensions: ExtensionRegistry;
  palette: PaletteRegistry;
}

export async function loadPlugins(
  hooks: HookRegistry,
  views: ViewRegistry,
  extensions: ExtensionRegistry,
  palette: PaletteRegistry,
): Promise<LoadedPlugins> {
  const config = getConfig();
  const pluginConfigs = (config as Record<string, unknown>).plugins as
    Record<string, PluginConfigEntry> | undefined;

  const loaded: LoadedPlugins = { plugins: [], hooks, views, extensions, palette };

  if (!pluginConfigs || !existsSync(PLUGINS_DIR)) return loaded;

  for (const [name, pluginConfig] of Object.entries(pluginConfigs)) {
    if (pluginConfig.enabled === false) continue;

    const pluginDir = join(PLUGINS_DIR, name);
    if (!existsSync(pluginDir)) {
      console.warn(`[plugins] Directory not found for "${name}", skipping`);
      continue;
    }

    try {
      // Read manifest
      const manifestPath = join(pluginDir, "plugin.json");
      let manifest: PluginManifest | null = null;
      if (existsSync(manifestPath)) {
        manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest;
      }

      // Import plugin
      const mainFile = manifest?.main ?? "./dist/index.js";
      const modulePath = join(pluginDir, mainFile);
      const mod = await import(modulePath);
      const plugin: TodoistPlugin = mod.default ?? mod;

      if (!plugin.name) {
        console.warn(`[plugins] Plugin at "${pluginDir}" has no name, skipping`);
        continue;
      }

      // Create context
      const dataDir = join(pluginDir, "data");
      const storage = createPluginStorage(dataDir);
      const api = createApiProxy(hooks);
      const log = createLogger(plugin.name);

      // Extract plugin-specific config (everything except source, enabled, after)
      const { source: _, enabled: _e, after: _a, ...pluginSpecificConfig } = pluginConfig;

      const ctx: PluginContext = {
        api,
        storage,
        config: pluginSpecificConfig,
        pluginDir,
        log,
      };

      // Lifecycle: onLoad
      if (plugin.onLoad) {
        await plugin.onLoad(ctx);
      }

      // Register hooks
      if (plugin.registerHooks) {
        plugin.registerHooks(hooks);
      }

      // Register views
      if (plugin.registerViews) {
        plugin.registerViews(views);
      }

      // Register extensions
      if (plugin.registerExtensions) {
        plugin.registerExtensions(extensions);
      }

      // Register palette commands
      if (plugin.registerPaletteCommands) {
        plugin.registerPaletteCommands(palette);
      }

      loaded.plugins.push({ plugin, ctx });

    } catch (err) {
      console.error(`[plugins] Failed to load "${name}":`, err instanceof Error ? err.message : err);
    }
  }

  return loaded;
}

export async function unloadPlugins(loaded: LoadedPlugins): Promise<void> {
  for (const { plugin } of loaded.plugins) {
    try {
      if (plugin.onUnload) await plugin.onUnload();
    } catch (err) {
      console.error(`[plugins] Error unloading "${plugin.name}":`, err);
    }
  }
}
```

**Commit:** `git commit -m "feat(plugins): add plugin loader with lifecycle management"`

---

### Task 3C: Plugin Installer

**Files:**
- Create: `src/plugins/installer.ts`

**Implementation:**

```typescript
// src/plugins/installer.ts
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, rmSync } from "fs";
import { homedir } from "os";
import { execSync } from "child_process";
import { getConfig, saveConfig } from "../config/index.ts";
import type { PluginManifest } from "./types.ts";

const PLUGINS_DIR = join(homedir(), ".config", "todoist-cli", "plugins");

function ensurePluginsDir(): void {
  if (!existsSync(PLUGINS_DIR)) {
    mkdirSync(PLUGINS_DIR, { recursive: true });
  }
}

export interface InstallResult {
  name: string;
  version: string;
  description?: string;
  permissions?: string[];
}

export async function installPlugin(source: string): Promise<InstallResult> {
  ensurePluginsDir();

  let name: string;
  const pluginDir = derivePluginDir(source);
  name = pluginDir.split("/").pop()!;

  const targetDir = join(PLUGINS_DIR, name);

  if (existsSync(targetDir)) {
    throw new Error(`Plugin "${name}" is already installed. Use "todoist plugin remove ${name}" first.`);
  }

  // Clone or copy based on source type
  if (source.startsWith("github:")) {
    const repo = source.replace("github:", "");
    execSync(`git clone https://github.com/${repo}.git "${targetDir}"`, { stdio: "pipe" });
  } else if (source.startsWith("npm:")) {
    const pkg = source.replace("npm:", "");
    mkdirSync(targetDir, { recursive: true });
    execSync(`cd "${targetDir}" && npm init -y && npm install ${pkg}`, { stdio: "pipe" });
  } else {
    // Local path — symlink or copy
    const resolved = join(process.cwd(), source);
    if (!existsSync(resolved)) throw new Error(`Local path not found: ${resolved}`);
    execSync(`cp -r "${resolved}" "${targetDir}"`, { stdio: "pipe" });
  }

  // Install dependencies
  if (existsSync(join(targetDir, "package.json"))) {
    try {
      execSync(`cd "${targetDir}" && bun install`, { stdio: "pipe" });
    } catch {
      // Fallback to npm
      execSync(`cd "${targetDir}" && npm install`, { stdio: "pipe" });
    }
  }

  // Read manifest
  const manifestPath = join(targetDir, "plugin.json");
  let manifest: PluginManifest | null = null;
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest;
    name = manifest.name;
  }

  // Update config.toml
  const config = getConfig() as Record<string, unknown>;
  if (!config.plugins) config.plugins = {};
  (config.plugins as Record<string, unknown>)[name] = { source };
  saveConfig(config as Parameters<typeof saveConfig>[0]);

  return {
    name,
    version: manifest?.version ?? "unknown",
    description: manifest?.description,
    permissions: manifest?.permissions,
  };
}

export function removePlugin(name: string): void {
  const targetDir = join(PLUGINS_DIR, name);
  if (!existsSync(targetDir)) {
    throw new Error(`Plugin "${name}" is not installed.`);
  }

  rmSync(targetDir, { recursive: true, force: true });

  // Remove from config
  const config = getConfig() as Record<string, unknown>;
  if (config.plugins) {
    delete (config.plugins as Record<string, unknown>)[name];
  }
  saveConfig(config as Parameters<typeof saveConfig>[0]);
}

export function listPlugins(): Array<{ name: string; source: string; enabled: boolean }> {
  const config = getConfig() as Record<string, unknown>;
  const plugins = config.plugins as Record<string, { source: string; enabled?: boolean }> | undefined;
  if (!plugins) return [];

  return Object.entries(plugins).map(([name, cfg]) => ({
    name,
    source: cfg.source,
    enabled: cfg.enabled !== false,
  }));
}

function derivePluginDir(source: string): string {
  if (source.startsWith("github:")) {
    const parts = source.replace("github:", "").split("/");
    return parts[parts.length - 1] ?? source;
  }
  if (source.startsWith("npm:")) {
    return source.replace("npm:", "").replace(/^@[^/]+\//, "");
  }
  return source.split("/").pop() ?? source;
}
```

**Commit:** `git commit -m "feat(plugins): add plugin installer (github/npm/local)"`

---

### Task 3D: Plugin CLI Commands

**Files:**
- Create: `src/cli/plugin.ts`

**Implementation:**

```typescript
// src/cli/plugin.ts
import type { Command } from "commander";
import chalk from "chalk";
import { installPlugin, removePlugin, listPlugins } from "../plugins/installer.ts";

export function registerPluginCommand(program: Command): void {
  const plugin = program
    .command("plugin")
    .description("Manage plugins");

  plugin
    .command("add")
    .description("Install a plugin (github:user/repo, npm:package, or local path)")
    .argument("<source>", "Plugin source")
    .action(async (source: string) => {
      try {
        console.log(chalk.dim(`Installing plugin from ${source}...`));
        const result = await installPlugin(source);
        console.log(chalk.green(`✓ Installed ${result.name} v${result.version}`));
        if (result.description) {
          console.log(chalk.dim(`  ${result.description}`));
        }
        if (result.permissions?.length) {
          console.log(chalk.dim(`  Permissions: ${result.permissions.join(", ")}`));
        }
      } catch (err) {
        console.error(chalk.red(`Failed to install: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  plugin
    .command("remove")
    .description("Remove an installed plugin")
    .argument("<name>", "Plugin name")
    .action((name: string) => {
      try {
        removePlugin(name);
        console.log(chalk.green(`✓ Removed ${name}`));
      } catch (err) {
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exit(1);
      }
    });

  plugin
    .command("list")
    .description("List installed plugins")
    .action(() => {
      const plugins = listPlugins();
      if (plugins.length === 0) {
        console.log(chalk.dim("No plugins installed."));
        console.log(chalk.dim("Install one with: todoist plugin add github:user/repo"));
        return;
      }
      for (const p of plugins) {
        const status = p.enabled ? chalk.green("●") : chalk.red("○");
        console.log(`  ${status} ${chalk.bold(p.name)} ${chalk.dim(`(${p.source})`)}`);
      }
    });
}
```

**Commit:** `git commit -m "feat(plugins): add CLI commands for plugin management"`

---

## Phase 4: App Integration (parallel after Phase 3)

### Task 4A: CLI Entry Point Integration

**Files:**
- Modify: `src/cli/index.ts:1-2,119-132,534,581-586`

**Changes:**

1. Add import at top (after line 17):
```typescript
import { registerPluginCommand } from "./plugin.ts";
```

2. Add `registerPluginCommand(program);` after line 132 (after `registerFilterCommand`)

3. In `knownCommands` array (line 581-586), add `"plugin"` to the list

**Commit:** `git commit -m "feat(plugins): integrate plugin CLI commands into main entry point"`

---

### Task 4B: Config Extension

**Files:**
- Modify: `src/config/index.ts:17-21`

**Changes:**

Extend the Config interface to include plugins:

```typescript
interface Config {
  auth?: { api_token?: string };
  defaults?: Defaults;
  filters?: Record<string, string>;
  plugins?: Record<string, Record<string, unknown>>;
}
```

Add helper functions:

```typescript
export function getPluginConfig(): Record<string, Record<string, unknown>> {
  const config = getConfig();
  return config.plugins ?? {};
}

export function getPluginDir(): string {
  return join(CONFIG_DIR, "plugins");
}
```

**Commit:** `git commit -m "feat(plugins): extend config to support plugin settings"`

---

### Task 4C: App.tsx — Plugin View Routing

**Files:**
- Modify: `src/ui/App.tsx`

**Changes:**

1. Import plugin system (after line 12):
```typescript
import { createHookRegistry } from "../plugins/hook-registry.ts";
import { createViewRegistry } from "../plugins/view-registry.ts";
import { createExtensionRegistry } from "../plugins/extension-registry.ts";
import { createPaletteRegistry } from "../plugins/palette-registry.ts";
import { loadPlugins, unloadPlugins } from "../plugins/loader.ts";
import type { LoadedPlugins } from "../plugins/loader.ts";
```

2. Extend View type (lines 14-19):
```typescript
type View =
  | { type: "list" }
  | { type: "detail"; task: Task }
  | { type: "stats" }
  | { type: "completed" }
  | { type: "activity" }
  | { type: "plugin"; name: string };
```

3. Add plugin state in App component (after line 30):
```typescript
const [loadedPlugins, setLoadedPlugins] = useState<LoadedPlugins | null>(null);
```

4. Initialize plugins in useEffect (extend the init function after line 48):
```typescript
// After setLoading(false), load plugins
const hooks = createHookRegistry();
const views = createViewRegistry();
const extensions = createExtensionRegistry();
const paletteReg = createPaletteRegistry();
const loaded = await loadPlugins(hooks, views, extensions, paletteReg);
setLoadedPlugins(loaded);
```

5. Handle plugin views in handleNavigate (after line 82, before default case):
```typescript
default: {
  // Check if it's a plugin view
  const pluginViews = loadedPlugins?.views.getViews() ?? [];
  if (pluginViews.some(v => v.name === viewName)) {
    setView({ type: "plugin", name: viewName });
  } else {
    setView({ type: "list" });
  }
  break;
}
```

6. Render plugin views (after line 143, before the default TasksView return):
```typescript
if (view.type === "plugin" && loadedPlugins) {
  const pluginView = loadedPlugins.views.getViews().find(v => v.name === view.name);
  if (pluginView) {
    const pluginEntry = loadedPlugins.plugins[0]; // Find matching plugin ctx
    const Component = pluginView.component;
    return (
      <Component
        onBack={handleBackToList}
        onNavigate={handleNavigate}
        ctx={pluginEntry?.ctx!}
        tasks={tasks}
        projects={projects}
        labels={labels}
      />
    );
  }
}
```

7. Pass plugin registries to TasksView (add props):
```typescript
<TasksView
  ...existing props...
  pluginExtensions={loadedPlugins?.extensions ?? null}
  pluginPalette={loadedPlugins?.palette ?? null}
  pluginViews={loadedPlugins?.views ?? null}
  pluginContexts={loadedPlugins?.plugins ?? []}
/>
```

8. Cleanup on unmount: call `unloadPlugins` in useEffect cleanup.

**Commit:** `git commit -m "feat(plugins): integrate plugin views into App routing"`

---

### Task 4D: TasksView — Plugin Commands & Keybindings

**Files:**
- Modify: `src/ui/views/TasksView.tsx`

**Changes:**

1. Add new props to TasksViewProps:
```typescript
import type { ExtensionRegistry, PaletteRegistry, ViewRegistry, PluginContext } from "../../plugins/types.ts";

interface TasksViewProps {
  ...existing props...
  pluginExtensions?: ExtensionRegistry | null;
  pluginPalette?: PaletteRegistry | null;
  pluginViews?: ViewRegistry | null;
  pluginContexts?: Array<{ plugin: { name: string }; ctx: PluginContext }>;
}
```

2. In the `commands` useMemo (line 845-905), append plugin palette commands:
```typescript
// At the end of cmds construction, before return:
if (pluginPalette) {
  for (const cmd of pluginPalette.getCommands()) {
    cmds.push({
      name: cmd.label.toLowerCase().replace(/\s+/g, "-"),
      description: cmd.label,
      category: cmd.category,
      action: () => {
        const ctx = pluginContexts?.[0]?.ctx;
        if (ctx) cmd.action(ctx, selectedTask ?? null, onNavigate);
      },
    });
  }
}
```

3. In sidebar items construction, add plugin views:
```typescript
if (pluginViews) {
  const pvs = pluginViews.getViews().filter(v => v.sidebar);
  if (pvs.length > 0) {
    // Add separator and plugin view items
    items.push({ id: "sep-plugins", label: "--- Plugins ---", type: "separator" as const });
    for (const pv of pvs) {
      items.push({
        id: `plugin-${pv.name}`,
        label: pv.label,
        type: "view" as const,
      });
    }
  }
}
```

**Commit:** `git commit -m "feat(plugins): integrate plugin commands and views into TasksView"`

---

### Task 4E: TaskRow — Plugin Columns

**Files:**
- Modify: `src/ui/components/TaskRow.tsx`

**Changes:**

1. Add props for plugin columns:
```typescript
import type { TaskColumnDefinition, PluginContext } from "../../plugins/types.ts";

interface TaskRowProps {
  ...existing props...
  pluginColumns?: TaskColumnDefinition[];
  pluginCtx?: PluginContext;
}
```

2. After labels rendering (line ~116), render plugin columns:
```typescript
{pluginColumns?.map(col => {
  const text = col.render(task, pluginCtx!);
  if (!text) return null;
  const textColor = col.color?.(task) ?? "dim";
  return <Text key={col.id} color={textColor}>{` ${text}`}</Text>;
})}
```

3. Adjust available width calculation to account for plugin column widths.

**Commit:** `git commit -m "feat(plugins): render plugin columns in TaskRow"`

---

### Task 4F: Sidebar — Plugin Items

**Files:**
- Modify: `src/ui/components/Sidebar.tsx:7-14`

**Changes:**

Add plugin icons to `SIDEBAR_ICONS`:
```typescript
// The sidebar already supports "view" type items.
// Plugin views just need to extend the icon map.
// In buildSidebarItems or where icons are resolved,
// accept an optional pluginIcons parameter.
```

The sidebar already renders "view" type items. Plugin views will be added to the items array in TasksView (Task 4D). The sidebar just needs to handle the `plugin-*` id prefix for icons.

**Commit:** `git commit -m "feat(plugins): support plugin view icons in sidebar"`

---

### Task 4G: HelpOverlay — Plugin Keybindings

**Files:**
- Modify: `src/ui/components/HelpOverlay.tsx`

**Changes:**

1. Accept plugin keybindings as props:
```typescript
import type { KeybindingDefinition } from "../../plugins/types.ts";

interface HelpOverlayProps {
  onClose: () => void;
  pluginKeybindings?: KeybindingDefinition[];
}
```

2. Group plugin keybindings by `helpSection` and append as new sections:
```typescript
// After the static helpSections definition:
const allSections = useMemo(() => {
  const sections = [...helpSections];
  if (pluginKeybindings?.length) {
    const groups = new Map<string, KeyBinding[]>();
    for (const kb of pluginKeybindings) {
      const existing = groups.get(kb.helpSection) ?? [];
      existing.push({ key: kb.key, description: kb.description });
      groups.set(kb.helpSection, existing);
    }
    for (const [title, bindings] of groups) {
      sections.push({ title, bindings });
    }
  }
  return sections;
}, [pluginKeybindings]);
```

**Commit:** `git commit -m "feat(plugins): display plugin keybindings in help overlay"`

---

### Task 4H: TaskDetailView — Plugin Sections

**Files:**
- Modify: `src/ui/views/TaskDetailView.tsx`

**Changes:**

1. Accept plugin sections as props:
```typescript
import type { DetailSectionDefinition, PluginContext } from "../../plugins/types.ts";

interface TaskDetailViewProps {
  ...existing props...
  pluginSections?: DetailSectionDefinition[];
  pluginCtx?: PluginContext;
}
```

2. Render plugin sections after comments:
```typescript
{pluginSections?.map(section => {
  const Component = section.component;
  return (
    <Box key={section.id} flexDirection="column" marginTop={1}>
      <Text bold color="cyan">{section.label}</Text>
      <Component task={task} ctx={pluginCtx!} />
    </Box>
  );
})}
```

**Commit:** `git commit -m "feat(plugins): render plugin sections in TaskDetailView"`

---

## Phase 5: Verification

### Task 5: Type Check & Build

**Step 1:** Run `bunx tsc --noEmit` — expect 0 errors
**Step 2:** Run `bun run build` — expect successful bundle
**Step 3:** Run `bun run dev -- plugin list` — expect "No plugins installed."

**Commit:** Final commit if any fixups needed.

---

## Implementation Order & Parallelism

```
Phase 1:  [Task 1: types.ts]
              │
Phase 2:  [2A: hooks] [2B: views] [2C: extensions] [2D: palette] [2E: storage]
              │           │            │                │             │
Phase 3:  [3A: api-proxy]  [3B: loader]  [3C: installer]  [3D: cli/plugin]
              │               │              │                │
Phase 4:  [4A: cli/index] [4B: config] [4C: App.tsx] [4D: TasksView]
          [4E: TaskRow] [4F: Sidebar] [4G: HelpOverlay] [4H: TaskDetailView]
              │
Phase 5:  [5: Verify]
```

**Team Assignment:**

| Agent | Tasks | Focus |
|-------|-------|-------|
| core-architect | 1, 2A, 2B, 2C, 2D, 2E | Types + all registries + storage |
| api-engineer | 3A, 3B, 3C, 3D | API proxy, loader, installer, CLI |
| tui-engineer | 4C, 4D, 4E, 4F, 4G, 4H | All TUI component modifications |
| integrator | 4A, 4B, 5 | CLI entry point, config, verification |
