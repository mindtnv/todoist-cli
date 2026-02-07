import type { Command } from "commander";
import chalk from "chalk";
import { reopenTask } from "../../../api/tasks.ts";
import { handleError } from "../../../utils/errors.ts";
import { cliExit } from "../../../utils/exit.ts";
import { resolveTaskArgs } from "../../../utils/resolve.ts";

export function registerReopenCommand(task: Command): void {
  task
    .command("reopen")
    .description("Reopen one or more completed tasks")
    .argument("[ids...]", "Task ID(s), or '-' to read from stdin")
    .option("-f, --filter <query>", "Reopen all tasks matching filter")
    .option("-q, --quiet", "Print only the task IDs")
    .action(async (ids: string[], opts: { filter?: string; quiet?: boolean }) => {
      try {
        const resolved = await resolveTaskArgs(ids, opts.filter);
        if (resolved.length === 0) {
          console.error(chalk.red("No tasks to reopen."));
          cliExit(1);
        }

        const results = await Promise.allSettled(resolved.map(id => reopenTask(id)));
        let success = 0;
        let failed = 0;
        for (let i = 0; i < results.length; i++) {
          if (results[i]!.status === "fulfilled") {
            success++;
            if (opts.quiet) console.log(resolved[i]);
          } else {
            failed++;
            if (!opts.quiet) console.error(chalk.red(`Failed: ${resolved[i]}`));
          }
        }
        if (!opts.quiet) {
          console.log(chalk.green(`Reopened ${success} task(s).`) + (failed > 0 ? chalk.red(` ${failed} failed.`) : ""));
        }
        cliExit(0);
      } catch (err) {
        handleError(err);
      }
    });
}
