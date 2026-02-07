import type { Command } from "commander";
import { registerAddCommand } from "./add.ts";
import { registerListCommand } from "./list.ts";
import { registerShowCommand } from "./show.ts";
import { registerCompleteCommand } from "./complete.ts";
import { registerReopenCommand } from "./reopen.ts";
import { registerDeleteCommand } from "./delete.ts";
import { registerUpdateCommand } from "./update.ts";
import { registerMoveCommand } from "./move.ts";

// Re-export helpers used by index.ts
export { printTaskTable, pickFields, groupByDate } from "./helpers.ts";

export function registerTaskCommand(program: Command): void {
  const task = program
    .command("task")
    .description("Manage tasks");

  registerAddCommand(task);
  registerListCommand(task);
  registerShowCommand(task);
  registerCompleteCommand(task);
  registerReopenCommand(task);
  registerDeleteCommand(task);
  registerUpdateCommand(task);
  registerMoveCommand(task);
}
