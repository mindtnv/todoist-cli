import type { Command } from "commander";
import { createHookRegistry } from "../plugins/hook-registry.ts";
import { createViewRegistry } from "../plugins/view-registry.ts";
import { createExtensionRegistry } from "../plugins/extension-registry.ts";
import { createPaletteRegistry } from "../plugins/palette-registry.ts";
import { loadPlugins, type LoadedPlugins } from "../plugins/loader.ts";
import type { HookRegistry } from "../plugins/types.ts";

let loadedPlugins: LoadedPlugins | null = null;
let hookRegistry: HookRegistry | null = null;

/**
 * Load all plugins and register their CLI commands on the Commander program.
 */
export async function loadCliPlugins(program: Command): Promise<void> {
  const hooks = createHookRegistry();
  const views = createViewRegistry();
  const extensions = createExtensionRegistry();
  const palette = createPaletteRegistry();

  const loaded = await loadPlugins(hooks, views, extensions, palette);
  loadedPlugins = loaded;
  hookRegistry = hooks;

  for (const { plugin, ctx } of loaded.plugins) {
    if (plugin.registerCommands) {
      plugin.registerCommands(program, ctx);
    }
  }
}

export function getCliHookRegistry(): HookRegistry | null {
  return hookRegistry;
}

export function getCliLoadedPlugins(): LoadedPlugins | null {
  return loadedPlugins;
}
