import type { Command } from "commander";
import chalk from "chalk";
import type { CompletedTask } from "../api/types.ts";
import { getCompletedTasks } from "../api/completed.ts";
import { getProjects } from "../api/projects.ts";
import { padEnd } from "../utils/format.ts";
import { handleError } from "../utils/errors.ts";

function sinceToDate(since: string): string {
  const now = new Date();
  switch (since) {
    case "today": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d.toISOString();
    }
    case "7 days": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    case "30 days": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d.toISOString();
    }
    default:
      return since;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function registerCompletedCommand(program: Command): void {
  program
    .command("completed")
    .description("Show completed tasks")
    .option("--since <string>", 'Time range: "today", "7 days", "30 days"', "today")
    .option("--group-by <field>", "Group by: project")
    .action(async (opts: { since: string; groupBy?: string }) => {
      try {
        const sinceDate = sinceToDate(opts.since);
        const tasks = await getCompletedTasks(sinceDate);

        if (tasks.length === 0) {
          console.log(chalk.dim("No completed tasks found."));
          return;
        }

        if (opts.groupBy === "project") {
          const projects = await getProjects();
          const projectMap = new Map(projects.map((p) => [p.id, p.name]));
          const groups = new Map<string, CompletedTask[]>();

          for (const t of tasks) {
            const name = projectMap.get(t.project_id) ?? "Unknown";
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name)!.push(t);
          }

          for (const [projectName, items] of groups) {
            console.log("");
            console.log(chalk.bold.underline(projectName) + chalk.dim(` (${items.length})`));
            for (const t of items) {
              const date = chalk.dim(formatDate(t.completed_at));
              console.log(`  ${chalk.green("✓")} ${padEnd(t.content, 45)} ${date}`);
            }
          }
        } else {
          console.log(chalk.bold(`Completed tasks (since ${opts.since}):`));
          console.log(chalk.dim("-".repeat(70)));

          for (const t of tasks) {
            const date = chalk.dim(formatDate(t.completed_at));
            console.log(`  ${chalk.green("✓")} ${padEnd(t.content, 45)} ${date}`);
          }
        }

        console.log("");
        console.log(chalk.dim(`Total: ${tasks.length} task${tasks.length === 1 ? "" : "s"}`));
      } catch (err) {
        handleError(err);
      }
    });
}
