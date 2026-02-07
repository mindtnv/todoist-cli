import type { Command } from "commander";
import chalk from "chalk";
import { getFilters, saveFilter, removeFilter } from "../config/index.ts";
import { getTasks } from "../api/tasks.ts";
import { printTaskTable } from "./commands/task/index.ts";
import { handleError, CliError, EXIT_NOT_FOUND } from "../utils/errors.ts";
import { printJsonFields } from "../utils/json-output.ts";

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
        handleError(new CliError(`Filter "${name}" not found.`, {
          code: EXIT_NOT_FOUND,
          suggestion: "Run `todoist filter list` to see available filters.",
        }));
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
          const available = Object.keys(filters);
          const suggestion = available.length > 0
            ? `Available filters: ${available.join(", ")}`
            : "No saved filters. Create one with: todoist filter save <name> <query>";
          throw new CliError(`Filter "${name}" not found.`, {
            code: EXIT_NOT_FOUND,
            suggestion,
          });
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
          printJsonFields(tasks as unknown as Record<string, unknown>[], opts.json);
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
