import type {
  TaskColumnDefinition,
  DetailSectionDefinition,
  KeybindingDefinition,
  StatusBarItemDefinition,
  ModalDefinition,
  ExtensionRegistry,
} from "./types.ts";

export function createExtensionRegistry(): ExtensionRegistry {
  const columns: TaskColumnDefinition[] = [];
  const sections: DetailSectionDefinition[] = [];
  const keybindings: KeybindingDefinition[] = [];
  const statusBarItems: StatusBarItemDefinition[] = [];
  const modals: ModalDefinition[] = [];

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

    addModal(definition: ModalDefinition) {
      if (modals.some(m => m.id === definition.id)) {
        console.warn(`[plugin] Modal "${definition.id}" already registered, skipping`);
        return;
      }
      modals.push(definition);
    },

    removeModal(id: string) {
      const idx = modals.findIndex(m => m.id === id);
      if (idx !== -1) modals.splice(idx, 1);
    },

    getTaskColumns: () => [...columns],
    getDetailSections: () => [...sections],
    getKeybindings: () => [...keybindings],
    getStatusBarItems: () => [...statusBarItems],
    getModals: () => [...modals],
  };
}
