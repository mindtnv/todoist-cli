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

    removeView(name: string) {
      const idx = views.findIndex(v => v.name === name);
      if (idx !== -1) views.splice(idx, 1);
    },

    getViews() {
      return [...views];
    },
  };
}
