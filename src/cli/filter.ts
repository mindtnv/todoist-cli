import type { Command } from "commander";
import chalk from "chalk";
import { getFilters, saveFilter, removeFilter } from "../config/index.ts";
import { getTasks } from "../api/tasks.ts";
import { printTaskTable } from "./commands/task/index.ts";
import { handleError } from "../utils/errors.ts";
import { cliExit } from "../utils/exit.ts";

export function registerFilterCommand(program: Command): void {
  const filter = program
    .command("filter")
    .description("Manage saved filters");

  filter
    .command("save")
    .description("Save a named filter")
    .argument("<name>", "Filter name (used as shortcut)")
    .argument("<query>", "Todoist filter query")
    .action((name: string, query: string) => {
      saveFilter(name, query);
      console.log(chalk.green(`Filter saved: ${chalk.bold(name)} → "${query}"`));
      console.log(chalk.dim(`Run with: todoist filter run ${name}`));
    });

  filter
    .command("list")
    .description("List saved filters")
    .action(() => {
      const filters = getFilters();
      const entries = Object.entries(filters);
      if (entries.length === 0) {
        console.log(chalk.dim("No saved filters."));
        return;
      }
      console.log(chalk.bold("Saved Filters"));
      console.log(chalk.dim("-".repeat(50)));
      for (const [name, query] of entries) {
        console.log(`  ${chalk.cyan(name)}  →  ${query}`);
      }
    });

  filter
    .command("delete")
    .description("Delete a saved filter")
    .argument("<name>", "Filter name")
    .action((name: string) => {
      if (removeFilter(name)) {
        console.log(chalk.green(`Filter "${name}" deleted.`));
      } else {
        console.error(chalk.red(`Filter "${name}" not found.`));
        cliExit(1);
      }
    });

  filter
    .command("run")
    .description("Run a saved filter")
    .argument("<name>", "Filter name")
    .option("-q, --quiet", "Print only task IDs")
    .option("--json <fields>", "Output JSON with specified fields")
    .option("--csv", "Output in CSV format")
    .option("--tsv", "Output in TSV format")
    .option("--count", "Show only the count")
    .action(async (name: string, opts: { quiet?: boolean; json?: string; csv?: boolean; tsv?: boolean; count?: boolean }) => {
      try {
        const filters = getFilters();
        const query = filters[name];
        if (!query) {
          console.error(chalk.red(`Filter "${name}" not found.`));
          const available = Object.keys(filters);
          if (available.length > 0) {
            console.error(chalk.dim(`Available: ${available.join(", ")}`));
          }
          cliExit(1);
        }

        const tasks = await getTasks({ filter: query });

        if (opts.count) {
          console.log(String(tasks.length));
          return;
        }

        if (opts.quiet) {
          for (const t of tasks) console.log(t.id);
          return;
        }

        if (opts.json !== undefined) {
          const fields = opts.json.split(",").map(f => f.trim());
          const data = tasks.map(t => {
            const obj: Record<string, unknown> = {};
            for (const f of fields) {
              if (f in t) obj[f] = (t as unknown as Record<string, unknown>)[f];
            }
            return obj;
          });
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        if (opts.csv || opts.tsv) {
          const { formatTasksDelimited } = await import("../utils/output.ts");
          console.log(formatTasksDelimited(tasks, opts.tsv ? "\t" : ","));
          return;
        }

        console.log(chalk.bold(`Filter: ${name}`) + chalk.dim(` (${query})`));
        console.log("");
        printTaskTable(tasks);
      } catch (err) {
        handleError(err);
      }
    });
}
