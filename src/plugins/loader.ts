import { join, dirname, resolve } from "path";
import { existsSync, readFileSync, symlinkSync, lstatSync, unlinkSync, realpathSync } from "fs";
import type {
  TodoistPlugin, PluginManifest, PluginContext,
  HookRegistry, ViewRegistry, ExtensionRegistry, PaletteRegistry,
  PluginConfigEntry, PluginLogger,
} from "./types.ts";
import { createPluginStorage } from "./storage.ts";
import type { PluginStorageWithClose } from "./storage.ts";
import { createApiProxy } from "./api-proxy.ts";
import { CONFIG_DIR, getConfig } from "../config/index.ts";

const PLUGINS_DIR = join(CONFIG_DIR, "plugins");

// Read CLI version from package.json at build time
const CLI_VERSION = (() => {
  try {
    const pkgPath = join(dirname(dirname(__dirname)), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version as string;
  } catch {
    return "0.0.0";
  }
})();

/**
 * Simple semver comparison. Handles `>=X.Y.Z` format.
 * Returns true if `current` satisfies the `required` constraint.
 */
function satisfiesVersion(required: string, current: string): boolean {
  const trimmed = required.trim();
  if (!trimmed) return true;

  const match = trimmed.match(/^>=\s*(\d+\.\d+\.\d+)$/);
  if (!match) {
    // Unsupported format — be lenient and allow
    return true;
  }

  const minVersion = match[1]!;
  const minParts = minVersion.split(".").map(Number);
  const curParts = current.split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    const min = minParts[i] ?? 0;
    const cur = curParts[i] ?? 0;
    if (cur > min) return true;
    if (cur < min) return false;
  }
  // All parts equal — satisfies >=
  return true;
}

function isValidPlugin(value: unknown): value is TodoistPlugin {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.name !== "string" || obj.name.length === 0) return false;
  if (typeof obj.version !== "string") return false;
  const optionalFns: string[] = [
    "onLoad", "onUnload", "registerHooks", "registerViews",
    "registerExtensions", "registerPaletteCommands",
  ];
  for (const key of optionalFns) {
    if (obj[key] !== undefined && typeof obj[key] !== "function") return false;
  }
  return true;
}

/**
 * Plugins live in ~/.config/todoist-cli/plugins/ which is outside the CLI's
 * module resolution tree. They need access to host dependencies (react, ink,
 * chalk, etc.) and MUST share the same React instance to avoid hook errors.
 *
 * We create a symlink: PLUGINS_DIR/node_modules → CLI's node_modules.
 * Bun's module resolution walks up from plugin files and finds this symlink.
 *
 * Alternatives considered and rejected:
 * - Bun.plugin onResolve: does not intercept runtime dynamic imports
 * - NODE_PATH: only works when set before process starts, not from within
 * - bun install per plugin: creates separate React copies → hook errors
 */
function ensureSharedDependencies(): void {
  if (!existsSync(PLUGINS_DIR)) return;

  const target = join(PLUGINS_DIR, "node_modules");

  // Valid symlink or real directory — nothing to do
  if (existsSync(target)) return;

  // Broken symlink (target moved): lstat succeeds but existsSync fails
  try {
    if (lstatSync(target).isSymbolicLink()) {
      unlinkSync(target);
    }
  } catch {
    // Doesn't exist at all — proceed to create
  }

  try {
    // Derive CLI's node_modules from a known dependency
    const reactPkg = require.resolve("react/package.json");
    const cliNodeModules = realpathSync(join(dirname(reactPkg), ".."));
    symlinkSync(cliNodeModules, target);
  } catch {
    // Non-fatal: plugins that don't need host deps will still work
  }
}

function createLogger(pluginName: string): PluginLogger {
  return {
    info: (msg: string) => console.log(`[plugin:${pluginName}] ${msg}`),
    warn: (msg: string) => console.warn(`[plugin:${pluginName}] ${msg}`),
    error: (msg: string) => console.error(`[plugin:${pluginName}] ${msg}`),
  };
}

/**
 * Topological sort of plugin entries based on their `after` field.
 * Uses Kahn's algorithm. If plugin B has `after: "A"`, A is loaded before B.
 *
 * - If `after` references a non-existent plugin, logs a warning and ignores the dependency.
 * - If a circular dependency is detected, logs a warning and falls back to the original order.
 */
function topologicalSort(
  entries: Array<[string, PluginConfigEntry]>,
): Array<[string, PluginConfigEntry]> {
  const nameSet = new Set(entries.map(([name]) => name));
  const entryMap = new Map(entries.map(([name, config]) => [name, config]));

  // Build adjacency list and in-degree count
  // Edge: after -> name (after must come before name)
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dep -> list of plugins that depend on it

  for (const [name] of entries) {
    inDegree.set(name, 0);
    dependents.set(name, []);
  }

  let hasDependencies = false;

  for (const [name, config] of entries) {
    const after = config.after;
    if (!after) continue;

    if (!nameSet.has(after)) {
      console.warn(
        `[plugins] Plugin "${name}" declares after: "${after}", but "${after}" is not a known plugin. Ignoring dependency.`
      );
      continue;
    }

    hasDependencies = true;
    inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
    dependents.get(after)!.push(name);
  }

  // If no dependencies exist, skip sorting and return original order
  if (!hasDependencies) return entries;

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const dependent of dependents.get(current) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  if (sorted.length !== entries.length) {
    // Circular dependency detected — fall back to original order
    const unsorted = entries
      .filter(([name]) => !sorted.includes(name))
      .map(([name]) => name);
    console.warn(
      `[plugins] Circular dependency detected among plugins: ${unsorted.join(", ")}. Falling back to original order.`
    );
    return entries;
  }

  return sorted.map((name) => [name, entryMap.get(name)!] as [string, PluginConfigEntry]);
}

export interface LoadedPlugins {
  plugins: Array<{ plugin: TodoistPlugin; ctx: PluginContext }>;
  storages: PluginStorageWithClose[];
  hooks: HookRegistry;
  views: ViewRegistry;
  extensions: ExtensionRegistry;
  palette: PaletteRegistry;
  /** Maps view name to the PluginContext of the plugin that registered it */
  viewContextMap: Map<string, PluginContext>;
  /** Maps keybinding key to the PluginContext of the plugin that registered it */
  keybindingContextMap: Map<string, PluginContext>;
  /** Maps column id to the PluginContext of the plugin that registered it */
  columnContextMap: Map<string, PluginContext>;
  /** Maps detail section id to the PluginContext of the plugin that registered it */
  detailSectionContextMap: Map<string, PluginContext>;
  /** Maps palette command label to the PluginContext of the plugin that registered it */
  paletteContextMap: Map<string, PluginContext>;
  /** Maps status bar item id to the PluginContext of the plugin that registered it */
  statusBarContextMap: Map<string, PluginContext>;
}

export async function loadPlugins(
  hooks: HookRegistry,
  views: ViewRegistry,
  extensions: ExtensionRegistry,
  palette: PaletteRegistry,
): Promise<LoadedPlugins> {
  const config = getConfig();
  const pluginConfigs = config.plugins as
    Record<string, PluginConfigEntry> | undefined;

  const viewContextMap = new Map<string, PluginContext>();
  const keybindingContextMap = new Map<string, PluginContext>();
  const columnContextMap = new Map<string, PluginContext>();
  const detailSectionContextMap = new Map<string, PluginContext>();
  const paletteContextMap = new Map<string, PluginContext>();
  const statusBarContextMap = new Map<string, PluginContext>();

  const storages: PluginStorageWithClose[] = [];

  const loaded: LoadedPlugins = {
    plugins: [], storages, hooks, views, extensions, palette,
    viewContextMap, keybindingContextMap, columnContextMap,
    detailSectionContextMap, paletteContextMap, statusBarContextMap,
  };

  if (!pluginConfigs) return loaded;

  ensureSharedDependencies();

  // ── Topological sort by `after` field ──
  // If plugin B has `after: "A"`, then A must load before B.
  const entries = Object.entries(pluginConfigs);
  const sortedEntries = topologicalSort(entries);

  for (const [name, pluginConfig] of sortedEntries) {
    if (pluginConfig.enabled === false) continue;

    const pluginDir = pluginConfig.path
      ? resolve(CONFIG_DIR, pluginConfig.path)
      : join(PLUGINS_DIR, name);
    if (!existsSync(pluginDir)) {
      console.warn(`[plugins] Directory not found for "${name}", skipping`);
      continue;
    }

    try {
      const manifestPath = join(pluginDir, "plugin.json");
      let manifest: PluginManifest | null = null;
      if (existsSync(manifestPath)) {
        try {
          manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest;
        } catch (parseErr) {
          console.warn(`[plugins] Invalid plugin.json for "${name}":`, parseErr instanceof Error ? parseErr.message : parseErr);
          // Continue without manifest — will use default main path
        }
      }

      // Version compatibility check
      const requiredVersion = manifest?.engines?.["todoist-cli"];
      if (requiredVersion && !satisfiesVersion(requiredVersion, CLI_VERSION)) {
        console.warn(
          `[plugins] Plugin "${name}" requires todoist-cli ${requiredVersion}, ` +
          `but current version is ${CLI_VERSION}. Skipping.`
        );
        continue;
      }

      const mainFile = manifest?.main ?? "./src/index.ts";
      const modulePath = join(pluginDir, mainFile);
      const mod = await import(modulePath);
      const plugin: TodoistPlugin = mod.default ?? mod;

      if (!isValidPlugin(plugin)) {
        console.warn(`[plugins] Plugin at "${pluginDir}" is not a valid TodoistPlugin (must have name, version, and valid lifecycle methods), skipping`);
        continue;
      }

      const dataDir = join(pluginDir, "data");
      const storage = createPluginStorage(dataDir);
      storages.push(storage);
      const api = createApiProxy(hooks, manifest?.permissions);
      const log = createLogger(plugin.name);

      const { source: _, enabled: _e, after: _a, ...pluginSpecificConfig } = pluginConfig;

      const ctx: PluginContext = {
        api,
        storage,
        config: pluginSpecificConfig,
        pluginDir,
        log,
      };

      if (plugin.onLoad) await plugin.onLoad(ctx);
      if (plugin.registerHooks) plugin.registerHooks(hooks);

      // Track view registrations to map view-name -> ctx
      if (plugin.registerViews) {
        const trackingViewRegistry: ViewRegistry = {
          addView(view) {
            views.addView(view);
            viewContextMap.set(view.name, ctx);
          },
          removeView(name) {
            views.removeView(name);
            viewContextMap.delete(name);
          },
          getViews: () => views.getViews(),
        };
        plugin.registerViews(trackingViewRegistry);
      }

      // Track extension registrations to map ids -> ctx
      if (plugin.registerExtensions) {
        const trackingExtRegistry: ExtensionRegistry = {
          addTaskColumn(column) {
            extensions.addTaskColumn(column);
            columnContextMap.set(column.id, ctx);
          },
          addDetailSection(section) {
            extensions.addDetailSection(section);
            detailSectionContextMap.set(section.id, ctx);
          },
          addKeybinding(binding) {
            extensions.addKeybinding(binding);
            keybindingContextMap.set(binding.key, ctx);
          },
          addStatusBarItem(item) {
            extensions.addStatusBarItem(item);
            statusBarContextMap.set(item.id, ctx);
          },
          removeTaskColumn(id) {
            extensions.removeTaskColumn(id);
            columnContextMap.delete(id);
          },
          removeDetailSection(id) {
            extensions.removeDetailSection(id);
            detailSectionContextMap.delete(id);
          },
          removeKeybinding(key) {
            extensions.removeKeybinding(key);
            keybindingContextMap.delete(key);
          },
          removeStatusBarItem(id) {
            extensions.removeStatusBarItem(id);
            statusBarContextMap.delete(id);
          },
          addModal(definition) {
            extensions.addModal(definition);
          },
          removeModal(id) {
            extensions.removeModal(id);
          },
          getTaskColumns: () => extensions.getTaskColumns(),
          getDetailSections: () => extensions.getDetailSections(),
          getKeybindings: () => extensions.getKeybindings(),
          getStatusBarItems: () => extensions.getStatusBarItems(),
          getModals: () => extensions.getModals(),
        };
        plugin.registerExtensions(trackingExtRegistry);
      }

      // Track palette command registrations to map label -> ctx
      if (plugin.registerPaletteCommands) {
        const trackingPaletteRegistry: PaletteRegistry = {
          addCommands(commands) {
            palette.addCommands(commands);
            for (const cmd of commands) {
              paletteContextMap.set(cmd.label, ctx);
            }
          },
          removeCommands(labels) {
            palette.removeCommands(labels);
            for (const label of labels) {
              paletteContextMap.delete(label);
            }
          },
          getCommands: () => palette.getCommands(),
        };
        plugin.registerPaletteCommands(trackingPaletteRegistry);
      }

      loaded.plugins.push({ plugin, ctx });
    } catch (err) {
      console.error(`[plugins] Failed to load "${name}":`, err instanceof Error ? err.message : err);
    }
  }

  return loaded;
}

export async function unloadPlugins(loaded: LoadedPlugins): Promise<void> {
  const {
    views, extensions, palette, hooks,
    viewContextMap, keybindingContextMap, columnContextMap,
    detailSectionContextMap, paletteContextMap, statusBarContextMap,
  } = loaded;

  for (const { plugin, ctx } of loaded.plugins) {
    try {
      if (plugin.onUnload) await plugin.onUnload(ctx);
    } catch (err) {
      console.error(`[plugins] Error unloading "${plugin.name}":`, err);
    }

    // Clean up all registered views for this plugin
    for (const [name, registeredCtx] of viewContextMap) {
      if (registeredCtx === ctx) {
        views.removeView(name);
        viewContextMap.delete(name);
      }
    }

    // Clean up keybindings
    for (const [key, registeredCtx] of keybindingContextMap) {
      if (registeredCtx === ctx) {
        extensions.removeKeybinding(key);
        keybindingContextMap.delete(key);
      }
    }

    // Clean up task columns
    for (const [id, registeredCtx] of columnContextMap) {
      if (registeredCtx === ctx) {
        extensions.removeTaskColumn(id);
        columnContextMap.delete(id);
      }
    }

    // Clean up detail sections
    for (const [id, registeredCtx] of detailSectionContextMap) {
      if (registeredCtx === ctx) {
        extensions.removeDetailSection(id);
        detailSectionContextMap.delete(id);
      }
    }

    // Clean up palette commands
    const paletteLabelsToRemove: string[] = [];
    for (const [label, registeredCtx] of paletteContextMap) {
      if (registeredCtx === ctx) {
        paletteLabelsToRemove.push(label);
        paletteContextMap.delete(label);
      }
    }
    if (paletteLabelsToRemove.length > 0) {
      palette.removeCommands(paletteLabelsToRemove);
    }

    // Clean up status bar items
    for (const [id, registeredCtx] of statusBarContextMap) {
      if (registeredCtx === ctx) {
        extensions.removeStatusBarItem(id);
        statusBarContextMap.delete(id);
      }
    }

    // Clean up hook handlers registered by this plugin
    hooks.removeAllForPlugin(plugin.name);
  }

  // Close all plugin storage database connections
  for (const storage of loaded.storages) {
    try {
      storage.close();
    } catch {
      // Ignore close errors during shutdown
    }
  }
}
