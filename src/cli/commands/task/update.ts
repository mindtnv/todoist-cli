import type { Command } from "commander";
import chalk from "chalk";
import { getTask, updateTask } from "../../../api/tasks.ts";
import type { UpdateTaskParams } from "../../../api/types.ts";
import { handleError } from "../../../utils/errors.ts";
import { validateContent, validatePriority, validateDateString } from "../../../utils/validation.ts";
import { cliExit } from "../../../utils/exit.ts";
import { resolveTaskArg, resolveProjectArg, resolveSectionArg } from "../../../utils/resolve.ts";
import { getCliHookRegistry } from "../../plugin-loader.ts";

export function registerUpdateCommand(task: Command): void {
  task
    .command("update")
    .description("Update a task")
    .argument("<id>", "Task ID")
    .option("--text <text>", "New content")
    .option("--priority <priority>", "New priority (1-4)")
    .option("--due <string>", "New due date string (use 'none' or 'clear' to remove)")
    .option("--deadline <date>", "Deadline date YYYY-MM-DD (use 'none' or 'clear' to remove)")
    .option("--description <text>", "New description")
    .option("--label <spec>", "Add/remove labels. Examples: --label errands (add), --label add:errands, --label remove:waiting. Repeat for multiple.", (val: string, acc: string[]) => { acc.push(val); return acc; }, [] as string[])
    .option("--project <name-or-id>", "Move to project (name or ID)")
    .option("--section <name-or-id>", "Move to section (name or ID)")
    .action(async (rawId: string, opts: { text?: string; priority?: string; due?: string; deadline?: string; description?: string; label: string[]; project?: string; section?: string }) => {
      try {
        const id = await resolveTaskArg(rawId);

        // Validate content if provided
        if (opts.text) {
          const contentError = validateContent(opts.text);
          if (contentError) {
            console.error(chalk.red(contentError));
            cliExit(1);
          }
        }

        // Validate priority if provided
        if (opts.priority) {
          const p = parseInt(opts.priority, 10);
          const priError = validatePriority(p);
          if (priError) {
            console.error(chalk.red(priError));
            cliExit(1);
          }
        }

        // Validate deadline format if provided
        if (opts.deadline && opts.deadline !== "none" && opts.deadline !== "clear") {
          const dateError = validateDateString(opts.deadline);
          if (dateError) {
            console.error(chalk.red(dateError));
            cliExit(1);
          }
        }

        const params: Record<string, unknown> = {};
        if (opts.text) params.content = opts.text;
        if (opts.priority) params.priority = parseInt(opts.priority, 10);
        if (opts.description !== undefined) params.description = opts.description;

        if (opts.due) {
          if (opts.due === "none" || opts.due === "clear") {
            params.due_string = null as unknown as string;
          } else {
            params.due_string = opts.due;
          }
        }

        if (opts.deadline) {
          if (opts.deadline === "none" || opts.deadline === "clear") {
            params.deadline_date = null;
          } else {
            params.deadline_date = opts.deadline;
          }
        }

        if (opts.project) {
          params.project_id = await resolveProjectArg(opts.project);
        }

        if (opts.section) {
          params.section_id = await resolveSectionArg(opts.section, params.project_id as string | undefined);
        }

        // Handle label add/remove
        if (opts.label.length > 0) {
          const task = await getTask(id);
          let labels = [...task.labels];

          for (const spec of opts.label) {
            if (spec.startsWith("add:")) {
              const name = spec.slice(4).replace(/^@/, "");
              if (!labels.includes(name)) labels.push(name);
            } else if (spec.startsWith("remove:")) {
              const name = spec.slice(7).replace(/^@/, "");
              labels = labels.filter((l) => l !== name);
            } else {
              // Treat as add
              const name = spec.replace(/^@/, "");
              if (!labels.includes(name)) labels.push(name);
            }
          }

          params.labels = labels;
        }

        if (Object.keys(params).length === 0) {
          console.error(chalk.red("No update options provided. Use --text, --priority, --due, --deadline, --description, --label, --project, or --section."));
          cliExit(1);
        }

        const hooks = getCliHookRegistry();
        const task = await getTask(id);
        try { await hooks?.emit("task.updating", { task, changes: params as UpdateTaskParams }); } catch { /* hook errors non-fatal */ }
        const result = await updateTask(id, params);
        try { await hooks?.emit("task.updated", { task: result, changes: params as UpdateTaskParams }); } catch { /* hook errors non-fatal */ }
        console.log(chalk.green(`Task ${result.id} updated: ${result.content}`));
      } catch (err) {
        handleError(err);
      }
    });
}
