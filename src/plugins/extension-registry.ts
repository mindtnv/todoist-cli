import type {
  TaskColumnDefinition,
  DetailSectionDefinition,
  KeybindingDefinition,
  StatusBarItemDefinition,
  ExtensionRegistry,
} from "./types.ts";

export function createExtensionRegistry(): ExtensionRegistry {
  const columns: TaskColumnDefinition[] = [];
  const sections: DetailSectionDefinition[] = [];
  const keybindings: KeybindingDefinition[] = [];
  const statusBarItems: StatusBarItemDefinition[] = [];

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
        console.warn(`[plugins] Keybinding conflict: "${binding.key}" already registered, skipping`);
        return;
      }
      keybindings.push(binding);
    },

    addStatusBarItem(item: StatusBarItemDefinition) {
      if (statusBarItems.some(s => s.id === item.id)) {
        console.warn(`[plugin] Status bar item "${item.id}" already registered, skipping`);
        return;
      }
      statusBarItems.push(item);
    },

    removeTaskColumn(id: string) {
      const idx = columns.findIndex(c => c.id === id);
      if (idx !== -1) columns.splice(idx, 1);
    },

    removeDetailSection(id: string) {
      const idx = sections.findIndex(s => s.id === id);
      if (idx !== -1) sections.splice(idx, 1);
    },

    removeKeybinding(key: string) {
      const idx = keybindings.findIndex(k => k.key === key);
      if (idx !== -1) keybindings.splice(idx, 1);
    },

    removeStatusBarItem(id: string) {
      const idx = statusBarItems.findIndex(s => s.id === id);
      if (idx !== -1) statusBarItems.splice(idx, 1);
    },

    getTaskColumns: () => [...columns],
    getDetailSections: () => [...sections],
    getKeybindings: () => [...keybindings],
    getStatusBarItems: () => [...statusBarItems],
  };
}
