import type { Command } from "commander";
import chalk from "chalk";
import { updateTask } from "../../../api/tasks.ts";
import { handleError } from "../../../utils/errors.ts";
import { cliExit } from "../../../utils/exit.ts";
import { resolveTaskArgs, resolveProjectArg, resolveSectionArg } from "../../../utils/resolve.ts";

export function registerMoveCommand(task: Command): void {
  task
    .command("move")
    .description("Move tasks to another project/section")
    .argument("[ids...]", "Task ID(s), or '-' to read from stdin")
    .requiredOption("--project <name-or-id>", "Target project name or ID")
    .option("--section <name-or-id>", "Target section name or ID")
    .option("-f, --filter <query>", "Move all tasks matching filter")
    .option("-q, --quiet", "Print only task IDs")
    .action(async (ids: string[], opts: { project: string; section?: string; filter?: string; quiet?: boolean }) => {
      try {
        const resolved = await resolveTaskArgs(ids, opts.filter);
        if (resolved.length === 0) {
          console.error(chalk.red("No tasks to move."));
          cliExit(1);
        }

        const projectId = await resolveProjectArg(opts.project);
        const params: Record<string, unknown> = { project_id: projectId };

        if (opts.section) {
          params.section_id = await resolveSectionArg(opts.section, projectId);
        }

        const results = await Promise.allSettled(resolved.map(id => updateTask(id, params)));
        let success = 0;
        for (let i = 0; i < results.length; i++) {
          if (results[i]!.status === "fulfilled") {
            success++;
            if (opts.quiet) console.log(resolved[i]);
          } else {
            if (!opts.quiet) console.error(chalk.red(`Failed: ${resolved[i]}`));
          }
        }
        if (!opts.quiet) {
          console.log(chalk.green(`Moved ${success} task(s) to ${opts.project}.`));
        }
      } catch (err) {
        handleError(err);
      }
    });
}
