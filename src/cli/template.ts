import type { Command } from "commander";
import chalk from "chalk";
import { getTask } from "../api/tasks.ts";
import { createTask } from "../api/tasks.ts";
import { addTemplate, getTemplates } from "../config/index.ts";
import type { TaskTemplate } from "../api/types.ts";
import { cliExit } from "../utils/exit.ts";

export function registerTemplateCommand(program: Command): void {
  const template = program
    .command("template")
    .description("Manage task templates");

  template
    .command("save")
    .description("Save a task as a template")
    .argument("<task-id>", "Task ID to use as template source")
    .argument("<name>", "Template name")
    .action(async (taskId: string, name: string) => {
      try {
        const task = await getTask(taskId);
        const tmpl: TaskTemplate = {
          name,
          content: task.content,
          description: task.description || undefined,
          priority: task.priority,
          labels: task.labels.length > 0 ? task.labels : undefined,
          due_string: task.due?.string || undefined,
        };
        addTemplate(tmpl);
        console.log(chalk.green(`Template "${name}" saved from task: ${task.content}`));
      } catch (err) {
        console.error(chalk.red(`Failed to save template: ${(err as Error).message}`));
        cliExit(1);
      }
    });

  template
    .command("apply")
    .description("Create a task from a template")
    .argument("<name>", "Template name")
    .option("-P, --project <id>", "Project ID for the new task")
    .action(async (name: string, opts: { project?: string }) => {
      try {
        const templates = getTemplates();
        const tmpl = templates.find((t) => t.name === name);
        if (!tmpl) {
          console.error(chalk.red(`Template "${name}" not found.`));
          cliExit(1);
        }

        const result = await createTask({
          content: tmpl.content,
          description: tmpl.description,
          priority: tmpl.priority,
          labels: tmpl.labels,
          due_string: tmpl.due_string,
          project_id: opts.project,
        });
        console.log(chalk.green(`Task created from template "${name}": ${result.content} (${result.id})`));
      } catch (err) {
        console.error(chalk.red(`Failed to apply template: ${(err as Error).message}`));
        cliExit(1);
      }
    });

  template
    .command("list")
    .description("List all saved templates")
    .action(() => {
      const templates = getTemplates();
      if (templates.length === 0) {
        console.log(chalk.dim("No templates saved."));
        return;
      }

      const header = `${"Name".padEnd(20)} ${"Content".padEnd(40)} ${"Priority".padEnd(10)} Labels`;
      console.log(chalk.bold(header));
      console.log(chalk.dim("-".repeat(80)));

      for (const t of templates) {
        const name = t.name.padEnd(20);
        const content = (t.content.length > 38 ? t.content.slice(0, 37) + "..." : t.content).padEnd(40);
        const priority = (t.priority ? `p${t.priority}` : "-").padEnd(10);
        const labels = t.labels ? chalk.cyan(t.labels.join(", ")) : "";
        console.log(`${name} ${content} ${priority} ${labels}`);
      }
    });
}
