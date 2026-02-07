import type { PaletteCommandDefinition, PaletteRegistry } from "./types.ts";

export function createPaletteRegistry(): PaletteRegistry {
  const commands: PaletteCommandDefinition[] = [];

  return {
    addCommands(newCommands: PaletteCommandDefinition[]) {
      for (const cmd of newCommands) {
        if (commands.some(c => c.label === cmd.label)) {
          console.warn(`[plugins] Palette command "${cmd.label}" already registered, skipping`);
          continue;
        }
        commands.push(cmd);
      }
    },

    getCommands() {
      return [...commands];
    },
  };
}
