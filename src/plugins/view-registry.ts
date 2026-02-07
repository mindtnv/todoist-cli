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
