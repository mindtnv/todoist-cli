import type { Command } from "commander";
import chalk from "chalk";
import { getTask, closeTask } from "../../../api/tasks.ts";
import { handleError } from "../../../utils/errors.ts";
import { cliExit } from "../../../utils/exit.ts";
import { resolveTaskArgs } from "../../../utils/resolve.ts";
import { getCliHookRegistry } from "../../plugin-loader.ts";

export function registerCompleteCommand(task: Command): void {
  task
    .command("complete")
    .description("Complete one or more tasks")
    .argument("[ids...]", "Task ID(s), or '-' to read from stdin")
    .option("-f, --filter <query>", "Complete all tasks matching filter")
    .option("-q, --quiet", "Print only the task IDs")
    .option("--dry-run", "Preview which tasks would be completed")
    .action(async (ids: string[], opts: { filter?: string; quiet?: boolean; dryRun?: boolean }) => {
      try {
        const resolved = await resolveTaskArgs(ids, opts.filter);
        if (resolved.length === 0) {
          console.error(chalk.red("No tasks to complete."));
          cliExit(1);
        }

        if (opts.dryRun) {
          console.log(chalk.bold(`Would complete ${resolved.length} task(s):`));
          for (const id of resolved) {
            try {
              const t = await getTask(id);
              console.log(`  ${id}  ${t.content}`);
            } catch { console.log(`  ${id}`); }
          }
          return;
        }

        const hooks = getCliHookRegistry();
        const results = await Promise.allSettled(resolved.map(async (id) => {
          const task = await getTask(id);
          try { await hooks?.emit("task.completing", { task }); } catch { /* hook errors non-fatal */ }
          await closeTask(id);
          try { await hooks?.emit("task.completed", { task }); } catch { /* hook errors non-fatal */ }
        }));
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
          console.log(chalk.green(`Completed ${success} task(s).`) + (failed > 0 ? chalk.red(` ${failed} failed.`) : ""));
        }
        cliExit(0);
      } catch (err) {
        handleError(err);
      }
    });
}
