#!/usr/bin/env bun
import { program } from "commander";
import chalk from "chalk";
import { registerTaskCommand, printTaskTable, groupByDate } from "./commands/task/index.ts";
import { printJsonFields } from "../utils/json-output.ts";
import { registerProjectCommand } from "./project.ts";
import { registerLabelCommand } from "./label.ts";
import { registerCommentCommand } from "./comment.ts";
import { registerTemplateCommand } from "./template.ts";
import { registerAuthCommand } from "./auth.ts";
import { registerSectionCommand } from "./section.ts";
import { registerCompletionCommand } from "./completion.ts";
import { registerCompletedCommand } from "./completed.ts";
import { registerReviewCommand } from "./review.ts";
import { registerMatrixCommand } from "./matrix.ts";
import { registerLogCommand } from "./log.ts";
import { registerStatsCommand } from "./stats.ts";
import { registerFilterCommand } from "./filter.ts";
import { registerPluginCommand } from "./plugin.ts";
import { loadCliPlugins } from "./plugin-loader.ts";
import { getTasks, createTask } from "../api/tasks.ts";
import { didYouMean, handleError, setDebug, debug } from "../utils/errors.ts";
import { validateContent, validatePriority } from "../utils/validation.ts";
import type { Task, Priority } from "../api/types.ts";
import { padEnd, priorityColor, priorityLabel, ID_WIDTH, PRI_WIDTH, getContentWidth, getDueWidth } from "../utils/format.ts";
import { formatTasksDelimited } from "../utils/output.ts";
import { parseQuickAdd, resolveProjectName, quickAddResultToParams } from "../utils/quick-add.ts";
import { getFilters, getAliases, setAlias, removeAlias } from "../config/index.ts";
import { cliExit } from "../utils/exit.ts";
import { batchCreateTasks } from "./commands/task/batch-helpers.ts";
import { initLogger, getLogger } from "../utils/logger.ts";

function tableSeparatorWidth(): number {
  return ID_WIDTH + 1 + PRI_WIDTH + 1 + getContentWidth() + 1 + getDueWidth() + 1 + 10;
}

function formatTimeRange(task: Task): string {
  if (!task.due?.datetime) return "";
  const start = new Date(task.due.datetime);
  const hours = start.getHours().toString().padStart(2, "0");
  const minutes = start.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function printTimeline(tasks: Task[]): void {
  const timed: Task[] = [];
  const untimed: Task[] = [];

  for (const t of tasks) {
    if (t.due?.datetime) {
      timed.push(t);
    } else {
      untimed.push(t);
    }
  }

  timed.sort((a, b) => a.due!.datetime!.localeCompare(b.due!.datetime!));

  console.log(chalk.bold("Today's Timeline"));
  console.log(chalk.dim("-".repeat(60)));

  if (timed.length > 0) {
    for (const t of timed) {
      const time = chalk.cyan(formatTimeRange(t));
      const pri = priorityColor(t.priority)(`p${t.priority}`);
      const content = t.content.length > 40 ? t.content.slice(0, 39) + "..." : t.content;
      console.log(`  ${padEnd(time, 7)}  ${pri}  ${content}`);
    }
  }

  if (untimed.length > 0) {
    if (timed.length > 0) console.log("");
    console.log(chalk.dim("  No time set:"));
    for (const t of untimed) {
      const pri = priorityColor(t.priority)(`p${t.priority}`);
      const content = t.content.length > 40 ? t.content.slice(0, 39) + "..." : t.content;
      console.log(`  ${padEnd("", 7)}  ${pri}  ${content}`);
    }
  }

  if (timed.length === 0 && untimed.length === 0) {
    console.log(chalk.dim("  No tasks for today."));
  }
}


async function runWithWatch(interval: number, fn: () => Promise<void>): Promise<never> {
  while (true) {
    console.clear();
    await fn();
    console.log("");
    console.log(chalk.dim(`Refreshing every ${interval}s — press Ctrl+C to exit`));
    await new Promise(r => setTimeout(r, interval * 1000));
  }
}

interface FilterCommandOpts {
  quiet?: boolean;
  csv?: boolean;
  tsv?: boolean;
  json?: string;
  watch?: string | boolean;
  count?: boolean;
}

/**
 * Shared helper for shortcut and saved-filter commands.
 * Fetches tasks with a filter, applies optional sort, and outputs in the requested format.
 */
async function runFilterCommand(
  title: string,
  filter: string,
  opts: FilterCommandOpts,
  postFetch?: (tasks: Task[]) => Task[],
): Promise<void> {
  const render = async () => {
    let tasks = await getTasks({ filter });
    if (postFetch) tasks = postFetch(tasks);

    if (opts.count) { console.log(String(tasks.length)); return; }
    if (opts.quiet) { for (const t of tasks) console.log(t.id); return; }
    if (opts.csv || opts.tsv) { console.log(formatTasksDelimited(tasks, opts.tsv ? "\t" : ",")); return; }
    if (opts.json !== undefined) {
      printJsonFields(tasks as unknown as Record<string, unknown>[], opts.json);
      return;
    }

    console.log(title);
    console.log("");
    printTaskTable(tasks);
  };
  try {
    if (opts.watch !== undefined) {
      const interval = typeof opts.watch === "string" ? parseInt(opts.watch, 10) : 5;
      await runWithWatch(interval, render);
    }
    await render();
  } catch (err) {
    handleError(err);
  }
}

program
  .name("todoist")
  .description("CLI tool for managing Todoist tasks")
  .version("0.5.2")
  .option("--debug", "Enable debug output")
  .hook("preAction", () => {
    if (program.opts().debug) {
      setDebug(true);
      debug("Debug mode enabled");
    }
  });

registerAuthCommand(program);
registerTaskCommand(program);
registerProjectCommand(program);
registerLabelCommand(program);
registerCommentCommand(program);
registerTemplateCommand(program);
registerSectionCommand(program);
registerCompletionCommand(program);
registerCompletedCommand(program);
registerReviewCommand(program);
registerMatrixCommand(program);
registerLogCommand(program);
registerStatsCommand(program);
registerFilterCommand(program);
registerPluginCommand(program);

// Alias management: todoist alias list|set|remove
const aliasCmd = program
  .command("alias")
  .description("Manage command aliases");

aliasCmd
  .command("list")
  .description("Show all configured aliases")
  .action(() => {
    const aliases = getAliases();
    const entries = Object.entries(aliases);
    if (entries.length === 0) {
      console.log(chalk.dim("No aliases configured."));
      return;
    }
    for (const [name, command] of entries) {
      console.log(`  ${chalk.bold(name)} ${chalk.dim("->")} ${command}`);
    }
  });

aliasCmd
  .command("set")
  .description("Add or update an alias")
  .argument("<name>", "Alias name")
  .argument("<command>", "Command the alias expands to (quote if multi-word)")
  .action((name: string, command: string) => {
    setAlias(name, command);
    console.log(chalk.green(`Alias set: ${chalk.bold(name)} -> ${command}`));
  });

aliasCmd
  .command("remove")
  .description("Remove an alias")
  .argument("<name>", "Alias name to remove")
  .action((name: string) => {
    if (removeAlias(name)) {
      console.log(chalk.green(`Alias removed: ${chalk.bold(name)}`));
    } else {
      console.error(chalk.red(`Alias not found: ${name}`));
      cliExit(1);
    }
  });

// Shortcut: todoist today
program
  .command("today")
  .description("Show today's and overdue tasks, sorted by priority")
  .option("--timeline", "Show tasks in timeline view sorted by time")
  .option("--json <fields>", "Output JSON with specified fields (comma-separated)")
  .option("-q, --quiet", "Print only task IDs")
  .option("--csv", "Output in CSV format")
  .option("--tsv", "Output in TSV format")
  .option("-w, --watch [seconds]", "Auto-refresh (default: 5s)")
  .action(async (opts: { timeline?: boolean; json?: string; quiet?: boolean; csv?: boolean; tsv?: boolean; watch?: string | boolean }) => {
    if (opts.timeline) {
      try {
        const tasks = await getTasks({ filter: "today | overdue" });
        tasks.sort((a, b) => b.priority - a.priority);
        printTimeline(tasks);
      } catch (err) {
        handleError(err);
      }
      return;
    }
    await runFilterCommand(chalk.bold("Today & Overdue"), "today | overdue", opts, (tasks) => {
      tasks.sort((a, b) => b.priority - a.priority);
      return tasks;
    });
  });

// Shortcut: todoist inbox
program
  .command("inbox")
  .description("Show inbox tasks")
  .option("--json <fields>", "Output JSON with specified fields (comma-separated)")
  .option("-q, --quiet", "Print only task IDs")
  .option("--csv", "Output in CSV format")
  .option("--tsv", "Output in TSV format")
  .option("-w, --watch [seconds]", "Auto-refresh (default: 5s)")
  .action(async (opts: FilterCommandOpts) => {
    await runFilterCommand(chalk.bold("Inbox"), "#Inbox", opts);
  });

// Shortcut: todoist next -- highest priority actionable task
program
  .command("next")
  .description("Show the highest-priority task due today or overdue")
  .option("-q, --quiet", "Print only the task ID")
  .action(async (opts: { quiet?: boolean }) => {
    try {
      let tasks = await getTasks({ filter: "today | overdue" });
      // Sort: highest priority first (4=highest in Todoist), then earliest due
      tasks.sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        const aDate = a.due?.date ?? "9999";
        const bDate = b.due?.date ?? "9999";
        return aDate.localeCompare(bDate);
      });

      if (tasks.length === 0) {
        console.log(chalk.dim("No actionable tasks. You're all caught up!"));
        return;
      }

      const t = tasks[0]!;

      if (opts.quiet) {
        console.log(t.id);
        return;
      }

      console.log(chalk.bold("Next task:"));
      console.log("");
      console.log(`  ${priorityLabel(t.priority)}  ${chalk.bold(t.content)}`);
      if (t.due) {
        console.log(`  ${chalk.dim("Due:")} ${t.due.date}`);
      }
      if (t.labels.length > 0) {
        console.log(`  ${chalk.dim("Labels:")} ${chalk.cyan(t.labels.join(", "))}`);
      }
      console.log(`  ${chalk.dim("ID:")} ${t.id}`);
      console.log("");
    } catch (err) {
      handleError(err);
    }
  });

// Shortcut: todoist upcoming -- next 7 days grouped by date
program
  .command("upcoming")
  .description("Show tasks for the next 7 days, grouped by date")
  .option("-q, --quiet", "Print only task IDs")
  .option("--csv", "Output in CSV format")
  .option("--tsv", "Output in TSV format")
  .option("-w, --watch [seconds]", "Auto-refresh (default: 5s)")
  .action(async (opts: { quiet?: boolean; csv?: boolean; tsv?: boolean; watch?: string | boolean }) => {
    const render = async () => {
      const tasks = await getTasks({ filter: "7 days" });

      if (opts.quiet) { for (const t of tasks) console.log(t.id); return; }
      if (opts.csv || opts.tsv) { console.log(formatTasksDelimited(tasks, opts.tsv ? "\t" : ",")); return; }

      if (tasks.length === 0) {
        console.log(chalk.dim("No upcoming tasks in the next 7 days."));
        return;
      }

      console.log(chalk.bold("Upcoming (next 7 days)"));

      const groups = groupByDate(tasks);
      const header = `${padEnd("ID", ID_WIDTH)} ${padEnd("Pri", PRI_WIDTH)} ${padEnd("Content", getContentWidth())} ${padEnd("Due", getDueWidth())} Labels`;
      console.log("");
      console.log(chalk.bold(header));
      console.log(chalk.dim("-".repeat(tableSeparatorWidth())));

      for (const group of groups) {
        console.log("");
        console.log(chalk.bold.underline(group.label));
        printTaskTable(group.tasks, 0, false);
      }
    };
    try {
      if (opts.watch !== undefined) {
        const interval = typeof opts.watch === "string" ? parseInt(opts.watch, 10) : 5;
        await runWithWatch(interval, render);
      }
      await render();
    } catch (err) {
      handleError(err);
    }
  });

// Shortcut: todoist overdue
program
  .command("overdue")
  .description("Show overdue tasks, oldest first")
  .option("-q, --quiet", "Print only task IDs")
  .option("--csv", "Output in CSV format")
  .option("--tsv", "Output in TSV format")
  .option("--json <fields>", "Output JSON with specified fields")
  .option("-w, --watch [seconds]", "Auto-refresh (default: 5s)")
  .action(async (opts: FilterCommandOpts) => {
    await runFilterCommand(chalk.bold("Overdue Tasks"), "overdue", opts, (tasks) => {
      // Sort oldest first
      tasks.sort((a, b) => {
        const aDate = a.due?.date ?? "9999";
        const bDate = b.due?.date ?? "9999";
        return aDate.localeCompare(bDate);
      });
      return tasks;
    });
  });

// Shortcut: todoist deadlines -- tasks with upcoming deadlines
program
  .command("deadlines")
  .description("Show tasks with upcoming deadlines")
  .option("--days <n>", "Number of days to look ahead", "14")
  .option("-q, --quiet", "Print only task IDs")
  .action(async (opts: { days: string; quiet?: boolean }) => {
    try {
      const days = parseInt(opts.days, 10);
      const tasks = await getTasks({ filter: `deadline before: in ${days} days` });

      // Sort by deadline date (closest first)
      tasks.sort((a, b) => {
        const aDate = a.deadline?.date ?? "9999";
        const bDate = b.deadline?.date ?? "9999";
        return aDate.localeCompare(bDate);
      });

      if (opts.quiet) {
        for (const t of tasks) console.log(t.id);
        return;
      }

      console.log(chalk.bold(`Deadlines (next ${days} days)`));
      console.log("");

      if (tasks.length === 0) {
        console.log(chalk.dim("No tasks with upcoming deadlines."));
        return;
      }

      const DL_WIDTH = 12;
      const CW = getContentWidth();
      const header = `${padEnd("ID", ID_WIDTH)} ${padEnd("Pri", PRI_WIDTH)} ${padEnd("Content", CW)} ${padEnd("Deadline", DL_WIDTH)} Due`;
      console.log(chalk.bold(header));
      console.log(chalk.dim("-".repeat(ID_WIDTH + 1 + PRI_WIDTH + 1 + CW + 1 + DL_WIDTH + 1 + 12)));

      for (const t of tasks) {
        const id = padEnd(t.id, ID_WIDTH);
        const pri = padEnd(priorityColor(t.priority)(`p${t.priority}`), PRI_WIDTH);
        const maxContent = CW - 2;
        const content = padEnd(t.content.length > maxContent ? t.content.slice(0, maxContent - 1) + "..." : t.content, CW);
        const deadline = padEnd(t.deadline ? chalk.magenta(t.deadline.date) : "", DL_WIDTH);
        const due = t.due?.date ?? "";
        console.log(`${id} ${pri} ${content} ${deadline} ${due}`);
      }
    } catch (err) {
      handleError(err);
    }
  });

// Shortcut: todoist search <query>
program
  .command("search")
  .description("Search tasks by text")
  .argument("<query>", "Search query")
  .option("-q, --quiet", "Print only task IDs")
  .option("--csv", "Output in CSV format")
  .option("--tsv", "Output in TSV format")
  .option("--json <fields>", "Output JSON with specified fields")
  .option("-w, --watch [seconds]", "Auto-refresh (default: 5s)")
  .action(async (query: string, opts: FilterCommandOpts) => {
    await runFilterCommand(chalk.bold(`Search: "${query}"`), `search: ${query}`, opts);
  });

program
  .command("ui")
  .description("Launch interactive TUI (press ? for keyboard shortcuts)")
  .action(async () => {
    const { launchUI } = await import("../ui/App.tsx");
    await launchUI();
  });

// Quick alias: todoist a "task text with quick-add syntax"
program
  .command("a")
  .description("Quick add a task (alias for 'task add')")
  .argument("[text...]", "Task content with quick-add syntax")
  .option("--batch", "Read tasks from stdin (one per line)")
  .option("-P, --project <name-or-id>", "Project name or ID")
  .option("-p, --priority <priority>", "Priority (1-4)")
  .option("-l, --label <name>", "Label name (can be repeated)", (val: string, acc: string[]) => { acc.push(val); return acc; }, [] as string[])
  .option("-d, --due <string>", "Due date string")
  .option("--dry-run", "Preview what quick-add would parse without creating")
  .option("-q, --quiet", "Print only the task ID")
  .action(async (words: string[], opts: {
    batch?: boolean;
    project?: string;
    priority?: string;
    label: string[];
    due?: string;
    dryRun?: boolean;
    quiet?: boolean;
  }) => {
    try {
      const text = words.join(" ");

      // Batch mode
      if (opts.batch) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) chunks.push(chunk);
        const input = Buffer.concat(chunks).toString("utf-8");
        const lines = input.split("\n").filter(l => l.trim());
        if (lines.length === 0) {
          console.error(chalk.red("No tasks provided on stdin."));
          cliExit(1);
        }
        await batchCreateTasks(lines, {
          project: opts.project,
          priority: opts.priority,
          labels: opts.label,
          due: opts.due,
        });
        cliExit(0);
      }

      if (!text.trim()) {
        console.error(chalk.red("No task text provided. Use: todoist a \"task text\""));
        cliExit(1);
      }

      // Validate content
      const contentError = validateContent(text);
      if (contentError) {
        console.error(chalk.red(contentError));
        cliExit(1);
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

      // Dry-run mode
      if (opts.dryRun) {
        const parsed = parseQuickAdd(text);
        console.log(chalk.bold("Preview:"));
        console.log(`  ${chalk.dim("Content:")}       ${parsed.content}`);
        if (parsed.description) console.log(`  ${chalk.dim("Description:")}   ${parsed.description}`);
        if (parsed.due_string) console.log(`  ${chalk.dim("Due:")}           ${parsed.due_string}`);
        if (parsed.priority) console.log(`  ${chalk.dim("Priority:")}      p${parsed.priority}`);
        if (parsed.project_name) console.log(`  ${chalk.dim("Project:")}       ${parsed.project_name}`);
        if (parsed.section_name) console.log(`  ${chalk.dim("Section:")}       ${parsed.section_name}`);
        if (parsed.deadline) console.log(`  ${chalk.dim("Deadline:")}      ${parsed.deadline}`);
        if (parsed.labels.length > 0) console.log(`  ${chalk.dim("Labels:")}        ${parsed.labels.join(", ")}`);
        cliExit(0);
      }

      // Parse and create
      const parsed = parseQuickAdd(text);
      const params = await quickAddResultToParams(parsed);
      // Explicit flags override quick-add
      if (opts.project) {
        const resolvedId = await resolveProjectName(opts.project);
        params.project_id = resolvedId ?? opts.project;
      }
      if (opts.priority) params.priority = parseInt(opts.priority, 10) as Priority;
      if (opts.label.length > 0) params.labels = opts.label;
      if (opts.due) params.due_string = opts.due;

      const result = await createTask(params);
      if (opts.quiet) {
        console.log(result.id);
      } else {
        console.log(chalk.green(`Task created: ${result.content} (${result.id})`));
      }
    } catch (err) {
      handleError(err);
    }
  });

// Register saved filters as top-level commands
const savedFilters = getFilters();
for (const [name, query] of Object.entries(savedFilters)) {
  program
    .command(name)
    .description(`Saved filter: ${query}`)
    .option("-q, --quiet", "Print only task IDs")
    .option("--csv", "Output in CSV format")
    .option("--tsv", "Output in TSV format")
    .option("--json <fields>", "Output JSON with specified fields")
    .option("--count", "Show only the count")
    .option("-w, --watch [seconds]", "Auto-refresh (default: 5s)")
    .action(async (opts: FilterCommandOpts) => {
      await runFilterCommand(
        chalk.bold(name) + chalk.dim(` (${query})`),
        query,
        opts,
      );
    });
}

async function main() {
  initLogger();
  const log = getLogger("cli");
  log.info("Starting todoist-cli v" + program.version());

  await loadCliPlugins(program);

  // Derive known commands dynamically after all commands (including plugins) are registered
  const knownCommands = program.commands.map((c) => c.name());

  // "Did you mean?" for unknown commands
  program.on("command:*", (operands: string[]) => {
    const unknown = operands[0];
    if (unknown) {
      const suggestion = didYouMean(unknown, knownCommands);
      console.error(chalk.red(`Unknown command: ${unknown}`));
      if (suggestion) {
        console.error(chalk.yellow(`Did you mean: ${chalk.bold(suggestion)}?`));
      }
      console.error(chalk.dim("Run 'todoist --help' for usage information."));
      cliExit(2);
    }
  });

  // Alias resolution: expand user-defined aliases before parsing
  const aliases = getAliases();
  const firstArg = process.argv[2];
  if (firstArg && aliases[firstArg]) {
    const expansion = aliases[firstArg].split(/\s+/);
    process.argv = [
      process.argv[0]!,
      process.argv[1]!,
      ...expansion,
      ...process.argv.slice(3),
    ];
  }

  await program.parseAsync();
}

main();
