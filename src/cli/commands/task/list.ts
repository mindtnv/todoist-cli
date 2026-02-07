import type { Command } from "commander";
import chalk from "chalk";
import { getTasks } from "../../../api/tasks.ts";
import { formatTasksDelimited } from "../../../utils/output.ts";
import { printJsonFields } from "../../../utils/json-output.ts";
import { handleError } from "../../../utils/errors.ts";
import { cliExit } from "../../../utils/exit.ts";
import {
  printTaskTable,
  buildTree,
  pickFields,
  applyJq,
  groupByProject,
  groupByLabel,
  groupByDate,
  printGrouped,
  resolveProjectOpt,
} from "./helpers.ts";
import { sortTasks } from "../../../utils/sorting.ts";

export function registerListCommand(task: Command): void {
  task
    .command("list")
    .description("List tasks")
    .option("-p, --priority <priority>", "Filter by priority (1-4)")
    .option("-P, --project <name-or-id>", "Filter by project name or ID")
    .option("-l, --label <name>", "Filter by label")
    .option("--today", "Show tasks due today")
    .option("--overdue", "Show overdue tasks")
    .option("-f, --filter <query>", "Todoist filter query (e.g. 'today & p1')")
    .option("--tree", "Show tasks in a hierarchical tree view")
    .option("--json <fields>", "Output JSON with specified fields (comma-separated)")
    .option("--jq <expr>", "Apply jq-like expression to JSON output")
    .option("-q, --quiet", "Print only task IDs")
    .option("--group-by <field>", "Group tasks by: project, label, or date")
    .option("--sort <field>", "Sort by: priority, date, content")
    .option("--count", "Show only the count of matching tasks")
    .option("--csv", "Output in CSV format")
    .option("--tsv", "Output in TSV format")
    .action(async (opts: {
      priority?: string;
      project?: string;
      label?: string;
      today?: boolean;
      overdue?: boolean;
      filter?: string;
      tree?: boolean;
      json?: string;
      jq?: string;
      quiet?: boolean;
      groupBy?: string;
      sort?: string;
      count?: boolean;
      csv?: boolean;
      tsv?: boolean;
    }) => {
      try {
        let filter: string | undefined = opts.filter;
        if (!filter && opts.today) filter = "today";
        else if (!filter && opts.overdue) filter = "overdue";

        let projectId = opts.project ? await resolveProjectOpt(opts.project) : undefined;

        let tasks = await getTasks({
          project_id: projectId,
          label: opts.label,
          filter,
        });

        if (opts.priority) {
          const p = parseInt(opts.priority, 10);
          tasks = tasks.filter((t) => t.priority === p);
        }

        // Sort
        if (opts.sort) {
          tasks = sortTasks(tasks, opts.sort as "priority" | "date" | "content");
        }

        // Count mode
        if (opts.count) {
          console.log(String(tasks.length));
          return;
        }

        // CSV/TSV output
        if (opts.csv || opts.tsv) {
          console.log(formatTasksDelimited(tasks, opts.tsv ? "\t" : ","));
          return;
        }

        // Quiet mode: just IDs
        if (opts.quiet) {
          for (const t of tasks) console.log(t.id);
          return;
        }

        // JSON output
        if (opts.json !== undefined) {
          if (opts.jq) {
            const fields = opts.json.split(",").map((f) => f.trim());
            const data = pickFields(tasks, fields);
            const result = applyJq(data, opts.jq);
            console.log(JSON.stringify(result, null, 2));
          } else {
            printJsonFields(tasks as unknown as Record<string, unknown>[], opts.json);
          }
          return;
        }

        // jq without --json: use all fields
        if (opts.jq) {
          const result = applyJq(tasks as unknown as Record<string, unknown>[], opts.jq);
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Group-by mode
        if (opts.groupBy) {
          let groups;
          switch (opts.groupBy) {
            case "project":
              groups = await groupByProject(tasks);
              break;
            case "label":
              groups = groupByLabel(tasks);
              break;
            case "date":
              groups = groupByDate(tasks);
              break;
            default:
              console.error(chalk.red(`Unknown group-by field: ${opts.groupBy}. Use: project, label, or date`));
              cliExit(2);
          }
          printGrouped(groups);
          return;
        }

        // Tree view
        if (opts.tree) {
          buildTree(tasks);
          return;
        }

        // Default table
        printTaskTable(tasks);
      } catch (err) {
        handleError(err);
      }
    });
}
