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

    removeCommands(labels: string[]) {
      const labelSet = new Set(labels);
      for (let i = commands.length - 1; i >= 0; i--) {
        const cmd = commands[i];
        if (cmd && labelSet.has(cmd.label)) {
          commands.splice(i, 1);
        }
      }
    },

    getCommands() {
      return [...commands];
    },
  };
}
