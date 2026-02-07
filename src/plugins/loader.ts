import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import type {
  TodoistPlugin, PluginManifest, PluginContext,
  HookRegistry, ViewRegistry, ExtensionRegistry, PaletteRegistry,
  PluginConfigEntry, PluginLogger,
} from "./types.ts";
import { createPluginStorage } from "./storage.ts";
import type { PluginStorageWithClose } from "./storage.ts";
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

  if (!pluginConfigs || !existsSync(PLUGINS_DIR)) return loaded;

  for (const [name, pluginConfig] of Object.entries(pluginConfigs)) {
    if (pluginConfig.enabled === false) continue;

    const pluginDir = join(PLUGINS_DIR, name);
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

      const mainFile = manifest?.main ?? "./dist/index.js";
      const modulePath = join(pluginDir, mainFile);
      const mod = await import(modulePath);
      const plugin: TodoistPlugin = mod.default ?? mod;

      if (!plugin.name) {
        console.warn(`[plugins] Plugin at "${pluginDir}" has no name, skipping`);
        continue;
      }

      const dataDir = join(pluginDir, "data");
      const storage = createPluginStorage(dataDir);
      storages.push(storage);
      const api = createApiProxy(hooks);
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
          getTaskColumns: () => extensions.getTaskColumns(),
          getDetailSections: () => extensions.getDetailSections(),
          getKeybindings: () => extensions.getKeybindings(),
          getStatusBarItems: () => extensions.getStatusBarItems(),
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
  for (const { plugin } of loaded.plugins) {
    try {
      if (plugin.onUnload) await plugin.onUnload();
    } catch (err) {
      console.error(`[plugins] Error unloading "${plugin.name}":`, err);
    }
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
