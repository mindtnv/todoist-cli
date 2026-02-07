import { join, dirname, resolve, basename } from "path";
import { existsSync, readFileSync, symlinkSync, lstatSync, unlinkSync, realpathSync, cpSync, rmSync, renameSync, mkdirSync } from "fs";
import type {
  TodoistPlugin, PluginManifest, PluginContext,
  HookRegistry, ViewRegistry, ExtensionRegistry, PaletteRegistry,
  PluginConfigEntry, PluginLogger, PluginRegistries,
} from "./types.ts";
import { createPluginStorage } from "./storage.ts";
import type { PluginStorageWithClose } from "./storage.ts";
import { createApiProxy } from "./api-proxy.ts";
import { CONFIG_DIR, getConfig } from "../config/index.ts";
import { getLogger } from "../utils/logger.ts";

const log = getLogger("plugins");

const PLUGINS_DIR = join(CONFIG_DIR, "plugins");
const PLUGIN_DATA_DIR = join(CONFIG_DIR, "plugin-data");

// ── Constants & Version ─────────────────────────────────────────────

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

// ── Version Checking ────────────────────────────────────────────────

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

// ── Plugin Validation ───────────────────────────────────────────────

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

// ── Dependency & Symlink Management ─────────────────────────────────

/**
 * Plugins live in ~/.config/todoist-cli/plugins/ which is outside the CLI's
 * module resolution tree. They need access to host dependencies (react, ink,
 * chalk, etc.) and MUST share the same React instance to avoid hook errors.
 *
 * We create a symlink: PLUGINS_DIR/node_modules → CLI's node_modules.
 * Module resolution walks up from plugin files and finds this symlink.
 */
function ensureSharedDependencies(): void {
  if (!existsSync(PLUGINS_DIR)) return;

  const target = join(PLUGINS_DIR, "node_modules");

  let cliNodeModules: string;
  try {
    const reactPkg = require.resolve("react/package.json");
    cliNodeModules = realpathSync(join(dirname(reactPkg), ".."));
  } catch {
    return; // Non-fatal: plugins that don't need host deps will still work
  }

  // If a symlink already exists, verify it points to the CURRENT CLI's
  // node_modules. Different CLIs (dev vs npm) share the same PLUGINS_DIR,
  // so a stale symlink from a previous run would cause duplicate React.
  try {
    if (lstatSync(target).isSymbolicLink()) {
      if (realpathSync(target) === cliNodeModules) return; // Correct target
      unlinkSync(target); // Stale — recreate below
    } else {
      return; // Real directory — don't touch
    }
  } catch {
    // Doesn't exist at all — proceed to create
  }

  try {
    symlinkSync(cliNodeModules, target);
  } catch {
    // Non-fatal
  }
}

/**
 * Migrate plugin data from old location (plugins/<name>/data/) to new
 * location (plugin-data/<name>/) so updates don't wipe data.
 * Runs once per plugin — old dir is moved, not copied.
 */
function migratePluginData(name: string, pluginDir: string): void {
  const oldDataDir = join(pluginDir, "data");
  const newDataDir = join(PLUGIN_DATA_DIR, name);
  if (!existsSync(oldDataDir) || existsSync(newDataDir)) return;
  try {
    mkdirSync(PLUGIN_DATA_DIR, { recursive: true });
    renameSync(oldDataDir, newDataDir);
    log.info(`Migrated data for "${name}" to plugin-data/`);
  } catch (err) {
    log.warn(`Failed to migrate data for "${name}": ${err instanceof Error ? err.message : err}`);
  }
}

/** Directories to skip when syncing symlinked plugin sources */
const SYNC_SKIP = new Set(["node_modules", ".git", "data"]);

/**
 * For symlinked plugins (local marketplace dev), the runtime resolves the
 * symlink to the real path and looks for dependencies there — finding React
 * from the dev project instead of the host CLI. This creates a duplicate
 * React instance and breaks hooks.
 *
 * Fix: copy the plugin's source files into a physical directory under
 * PLUGINS_DIR. Module resolution from the physical copy walks up to
 * PLUGINS_DIR/node_modules (set up by ensureSharedDependencies), ensuring
 * a single shared React instance.
 *
 * No cleanup or exit handlers needed — copies persist harmlessly.
 */
function syncSymlinkedPlugin(pluginDir: string, name: string): string {
  try {
    if (!lstatSync(pluginDir).isSymbolicLink()) return pluginDir;
  } catch {
    return pluginDir;
  }

  try {
    const realDir = realpathSync(pluginDir);
    const syncDir = join(PLUGINS_DIR, `_dev_${name}`);

    // Remove stale copy first so deleted source files don't linger
    if (existsSync(syncDir)) {
      rmSync(syncDir, { recursive: true, force: true });
    }

    cpSync(realDir, syncDir, {
      recursive: true,
      filter: (src: string) => {
        if (src === realDir) return true;
        // Use path.basename for cross-platform compatibility
        return !SYNC_SKIP.has(basename(src));
      },
    });

    log.debug(`Synced symlinked plugin "${name}" → ${syncDir}`);
    return syncDir;
  } catch (err) {
    log.warn(`Failed to sync symlinked plugin "${name}": ${err instanceof Error ? err.message : err}`);
    return pluginDir; // Fallback to original (may still work under Bun dev)
  }
}

// ── Plugin Logger ───────────────────────────────────────────────────

function createLogger(pluginName: string): PluginLogger {
  const pluginLog = getLogger(`plugin:${pluginName}`);
  return {
    info: (msg: string) => pluginLog.info(msg),
    warn: (msg: string) => pluginLog.warn(msg),
    error: (msg: string) => pluginLog.error(msg),
  };
}

// ── Topological Sort ────────────────────────────────────────────────

/**
 * Topological sort of plugin entries based on their `after` field.
 * If plugin B has `after: "A"`, A is loaded before B.
 * Falls back to original order on circular dependencies.
 */
function topologicalSort(
  entries: Array<[string, PluginConfigEntry]>,
): Array<[string, PluginConfigEntry]> {
  if (!entries.some(([, c]) => c.after)) return entries;

  const nameSet = new Set(entries.map(([name]) => name));
  const remaining = new Map(entries);
  const added = new Set<string>();
  const result: Array<[string, PluginConfigEntry]> = [];

  // Warn about unknown dependencies
  for (const [name, config] of entries) {
    if (config.after && !nameSet.has(config.after)) {
      log.warn(`Plugin "${name}" declares after: "${config.after}", but "${config.after}" is not known. Ignoring.`);
    }
  }

  while (remaining.size > 0) {
    let progress = false;
    for (const [name, config] of remaining) {
      if (!config.after || added.has(config.after) || !nameSet.has(config.after)) {
        result.push([name, config]);
        added.add(name);
        remaining.delete(name);
        progress = true;
      }
    }
    if (!progress) {
      const circular = [...remaining.keys()];
      log.warn(`Circular dependency among: ${circular.join(", ")}. Using original order.`);
      for (const [name, config] of remaining) result.push([name, config]);
      break;
    }
  }

  return result;
}

// ── Context Tracking ────────────────────────────────────────────────

/**
 * Tracks which PluginContext registered each item across all registries.
 * Replaces the six individual Map<string, PluginContext> fields with a
 * single consolidated data structure.
 *
 * Adding a new tracked category requires only adding a new ContextMapName
 * and the corresponding tracking calls in the registry factory function.
 */
class ContextTracker {
  private readonly maps = new Map<string, Map<string, PluginContext>>();

  /** Get or create a named context map */
  getMap(name: string): Map<string, PluginContext> {
    let map = this.maps.get(name);
    if (!map) {
      map = new Map();
      this.maps.set(name, map);
    }
    return map;
  }

  track(mapName: string, key: string, ctx: PluginContext): void {
    this.getMap(mapName).set(key, ctx);
  }

  untrack(mapName: string, key: string): void {
    this.getMap(mapName).delete(key);
  }

  /**
   * Remove all entries owned by `ctx` across all maps.
   * Returns removed entries grouped by map name for cleanup callbacks.
   */
  removeAllForContext(ctx: PluginContext): Map<string, string[]> {
    const removed = new Map<string, string[]>();
    for (const [mapName, map] of this.maps) {
      const keys: string[] = [];
      for (const [key, registeredCtx] of map) {
        if (registeredCtx === ctx) keys.push(key);
      }
      for (const key of keys) map.delete(key);
      if (keys.length > 0) removed.set(mapName, keys);
    }
    return removed;
  }
}

/** Creates a ViewRegistry wrapper that tracks registrations in the ContextTracker */
function trackingViewRegistry(
  views: ViewRegistry, tracker: ContextTracker, ctx: PluginContext,
): ViewRegistry {
  return {
    addView(view) {
      views.addView(view);
      tracker.track("view", view.name, ctx);
    },
    removeView(name) {
      views.removeView(name);
      tracker.untrack("view", name);
    },
    getViews: () => views.getViews(),
  };
}

/** Creates an ExtensionRegistry wrapper that tracks registrations in the ContextTracker */
function trackingExtensionRegistry(
  ext: ExtensionRegistry, tracker: ContextTracker, ctx: PluginContext,
): ExtensionRegistry {
  return {
    addTaskColumn(col) { ext.addTaskColumn(col); tracker.track("column", col.id, ctx); },
    addDetailSection(sec) { ext.addDetailSection(sec); tracker.track("detailSection", sec.id, ctx); },
    addKeybinding(b) { ext.addKeybinding(b); tracker.track("keybinding", b.key, ctx); },
    addStatusBarItem(item) { ext.addStatusBarItem(item); tracker.track("statusBar", item.id, ctx); },
    removeTaskColumn(id) { ext.removeTaskColumn(id); tracker.untrack("column", id); },
    removeDetailSection(id) { ext.removeDetailSection(id); tracker.untrack("detailSection", id); },
    removeKeybinding(key) { ext.removeKeybinding(key); tracker.untrack("keybinding", key); },
    removeStatusBarItem(id) { ext.removeStatusBarItem(id); tracker.untrack("statusBar", id); },
    addModal(d) { ext.addModal(d); },
    removeModal(id) { ext.removeModal(id); },
    addSidebarSection(s) { ext.addSidebarSection(s); },
    removeSidebarSection(id) { ext.removeSidebarSection(id); },
    getTaskColumns: () => ext.getTaskColumns(),
    getDetailSections: () => ext.getDetailSections(),
    getKeybindings: () => ext.getKeybindings(),
    getStatusBarItems: () => ext.getStatusBarItems(),
    getModals: () => ext.getModals(),
    getSidebarSections: () => ext.getSidebarSections(),
  };
}

/** Creates a PaletteRegistry wrapper that tracks registrations in the ContextTracker */
function trackingPaletteRegistry(
  palette: PaletteRegistry, tracker: ContextTracker, ctx: PluginContext,
): PaletteRegistry {
  return {
    addCommands(commands) {
      palette.addCommands(commands);
      for (const cmd of commands) tracker.track("palette", cmd.label, ctx);
    },
    removeCommands(labels) {
      palette.removeCommands(labels);
      for (const label of labels) tracker.untrack("palette", label);
    },
    getCommands: () => palette.getCommands(),
  };
}

/** Creates a HookRegistry wrapper that auto-tags the plugin name on every on() call */
function trackingHookRegistry(hooks: HookRegistry, pluginName: string): HookRegistry {
  return {
    on(event, handler, name) { hooks.on(event, handler, name ?? pluginName); },
    off: hooks.off.bind(hooks),
    emit: hooks.emit.bind(hooks),
    removeAllForPlugin: hooks.removeAllForPlugin.bind(hooks),
  };
}

// ── Public API ──────────────────────────────────────────────────────

export interface LoadedPlugins {
  plugins: Array<{ plugin: TodoistPlugin; ctx: PluginContext }>;
  storages: PluginStorageWithClose[];
  hooks: HookRegistry;
  views: ViewRegistry;
  extensions: ExtensionRegistry;
  palette: PaletteRegistry;
  /** @internal Used by unloadPlugins for cleanup */
  _tracker: ContextTracker;
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

/** Internal fields stripped from plugin config before passing to ctx.config */
const INTERNAL_CONFIG_KEYS = new Set(["source", "enabled", "after", "path"]);

export async function loadPlugins(
  hooks: HookRegistry,
  views: ViewRegistry,
  extensions: ExtensionRegistry,
  palette: PaletteRegistry,
): Promise<LoadedPlugins> {
  const config = getConfig();
  const pluginConfigs = config.plugins as
    Record<string, PluginConfigEntry> | undefined;

  const tracker = new ContextTracker();
  const storages: PluginStorageWithClose[] = [];

  const loaded: LoadedPlugins = {
    plugins: [], storages, hooks, views, extensions, palette,
    _tracker: tracker,
    // Backward-compatible accessors backed by the shared tracker
    get viewContextMap() { return tracker.getMap("view"); },
    get keybindingContextMap() { return tracker.getMap("keybinding"); },
    get columnContextMap() { return tracker.getMap("column"); },
    get detailSectionContextMap() { return tracker.getMap("detailSection"); },
    get paletteContextMap() { return tracker.getMap("palette"); },
    get statusBarContextMap() { return tracker.getMap("statusBar"); },
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
      log.warn(`Directory not found for "${name}", skipping`);
      continue;
    }

    try {
      log.debug(`Loading plugin "${name}" from ${pluginDir}`);
      const manifestPath = join(pluginDir, "plugin.json");
      let manifest: PluginManifest | null = null;
      if (existsSync(manifestPath)) {
        try {
          manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as PluginManifest;
        } catch (parseErr) {
          log.warn(`Invalid plugin.json for "${name}": ${parseErr instanceof Error ? parseErr.message : parseErr}`);
        }
      }

      // Version compatibility check
      const requiredVersion = manifest?.engines?.["todoist-cli"];
      if (requiredVersion && !satisfiesVersion(requiredVersion, CLI_VERSION)) {
        log.warn(
          `Plugin "${name}" requires todoist-cli ${requiredVersion}, ` +
          `but current version is ${CLI_VERSION}. Skipping.`
        );
        continue;
      }

      const mainFile = manifest?.main ?? "./src/index.ts";

      // For symlinked plugins, copy sources into PLUGINS_DIR so module
      // resolution finds the host's React/Ink (prevents dual-React crashes)
      const loadDir = syncSymlinkedPlugin(pluginDir, name);
      const modulePath = join(loadDir, mainFile);

      const mod = await import(modulePath);
      const plugin: TodoistPlugin = mod.default ?? mod;

      if (!isValidPlugin(plugin)) {
        log.warn(`Plugin at "${pluginDir}" is not a valid TodoistPlugin (must have name, version, and valid lifecycle methods), skipping`);
        continue;
      }

      // Data lives outside plugin dir so updates don't wipe it
      migratePluginData(name, pluginDir);
      const dataDir = join(PLUGIN_DATA_DIR, name);
      const storage = createPluginStorage(dataDir);
      storages.push(storage);
      const api = createApiProxy(hooks);
      const pluginLog = createLogger(plugin.name);

      // Strip internal loader keys from config before passing to plugin
      const pluginSpecificConfig: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(pluginConfig)) {
        if (!INTERNAL_CONFIG_KEYS.has(k)) pluginSpecificConfig[k] = v;
      }

      const ctx: PluginContext = {
        api, storage, config: pluginSpecificConfig, pluginDir, log: pluginLog,
      };

      if (plugin.onLoad) await plugin.onLoad(ctx);
      if (plugin.register) {
        const registries: PluginRegistries = {
          hooks: trackingHookRegistry(hooks, plugin.name),
          views: trackingViewRegistry(views, tracker, ctx),
          extensions: trackingExtensionRegistry(extensions, tracker, ctx),
          palette: trackingPaletteRegistry(palette, tracker, ctx),
        };
        plugin.register(registries);
      }

      loaded.plugins.push({ plugin, ctx });
      const displayVersion = manifest?.version ?? plugin.version ?? "?";
      log.info(`Loaded plugin "${name}" v${displayVersion}`);
    } catch (err) {
      log.error(`Failed to load "${name}": ${err instanceof Error ? err.message : err}`, err);
    }
  }

  return loaded;
}

/** Maps context map names to their registry removal functions */
function buildRemovers(
  views: ViewRegistry, extensions: ExtensionRegistry, palette: PaletteRegistry,
): Record<string, (keys: string[]) => void> {
  return {
    view: (keys) => keys.forEach((k) => views.removeView(k)),
    keybinding: (keys) => keys.forEach((k) => extensions.removeKeybinding(k)),
    column: (keys) => keys.forEach((k) => extensions.removeTaskColumn(k)),
    detailSection: (keys) => keys.forEach((k) => extensions.removeDetailSection(k)),
    statusBar: (keys) => keys.forEach((k) => extensions.removeStatusBarItem(k)),
    palette: (keys) => palette.removeCommands(keys),
  };
}

export async function unloadPlugins(loaded: LoadedPlugins): Promise<void> {
  log.debug(`Unloading ${loaded.plugins.length} plugin(s)`);
  const { views, extensions, palette, hooks, _tracker } = loaded;
  const removers = buildRemovers(views, extensions, palette);

  for (const { plugin, ctx } of loaded.plugins) {
    try {
      if (plugin.onUnload) await plugin.onUnload(ctx);
    } catch (err) {
      log.error(`Error unloading "${plugin.name}"`, err);
    }

    // Remove all tracked registrations for this plugin in one pass
    const removed = _tracker.removeAllForContext(ctx);
    for (const [mapName, keys] of removed) {
      removers[mapName]?.(keys);
    }

    hooks.removeAllForPlugin(plugin.name);
  }

  // Close all plugin storage database connections
  for (const storage of loaded.storages) {
    try { storage.close(); } catch { /* Ignore close errors during shutdown */ }
  }
}
