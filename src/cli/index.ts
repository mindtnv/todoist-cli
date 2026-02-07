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
import type { Task, Priority, CreateTaskParams } from "../api/types.ts";
import { padEnd, priorityColor, priorityLabel, ID_WIDTH, PRI_WIDTH, getContentWidth, getDueWidth } from "../utils/format.ts";
import { formatTasksDelimited } from "../utils/output.ts";
import { parseQuickAdd, resolveProjectName, resolveSectionName } from "../utils/quick-add.ts";
import { getFilters } from "../config/index.ts";
import { cliExit } from "../utils/exit.ts";

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

function printShortcutTable(tasks: Task[]): void {
  const CONTENT_WIDTH = getContentWidth();
  const DUE_WIDTH = getDueWidth();

  if (tasks.length === 0) {
    console.log(chalk.dim("No tasks found."));
    return;
  }

  const header = `${padEnd("ID", ID_WIDTH)} ${padEnd("Pri", PRI_WIDTH)} ${padEnd("Content", CONTENT_WIDTH)} ${padEnd("Due", DUE_WIDTH)} Labels`;
  console.log(chalk.bold(header));
  console.log(chalk.dim("-".repeat(tableSeparatorWidth())));

  for (const t of tasks) {
    const id = padEnd(t.id, ID_WIDTH);
    const pri = padEnd(priorityColor(t.priority)(`p${t.priority}`), PRI_WIDTH);
    const maxContent = CONTENT_WIDTH - 2;
    const content = padEnd(t.content.length > maxContent ? t.content.slice(0, maxContent - 1) + "..." : t.content, CONTENT_WIDTH);
    const due = padEnd(t.due?.date ?? "", DUE_WIDTH);
    const labels = t.labels.length > 0 ? chalk.cyan(t.labels.join(", ")) : "";
    console.log(`${id} ${pri} ${content} ${due} ${labels}`);
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

program
  .name("todoist")
  .description("CLI tool for managing Todoist tasks")
  .version("0.5.0")
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
    const render = async () => {
      let tasks = await getTasks({ filter: "today | overdue" });
      tasks.sort((a, b) => b.priority - a.priority);

      if (opts.timeline) { printTimeline(tasks); return; }
      if (opts.quiet) { for (const t of tasks) console.log(t.id); return; }
      if (opts.csv || opts.tsv) { console.log(formatTasksDelimited(tasks, opts.tsv ? "\t" : ",")); return; }
      if (opts.json !== undefined) {
        printJsonFields(tasks as unknown as Record<string, unknown>[], opts.json);
        return;
      }

      console.log(chalk.bold("Today & Overdue"));
      console.log("");
      printShortcutTable(tasks);
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

// Shortcut: todoist inbox
program
  .command("inbox")
  .description("Show inbox tasks")
  .option("--json <fields>", "Output JSON with specified fields (comma-separated)")
  .option("-q, --quiet", "Print only task IDs")
  .option("--csv", "Output in CSV format")
  .option("--tsv", "Output in TSV format")
  .option("-w, --watch [seconds]", "Auto-refresh (default: 5s)")
  .action(async (opts: { json?: string; quiet?: boolean; csv?: boolean; tsv?: boolean; watch?: string | boolean }) => {
    const render = async () => {
      const tasks = await getTasks({ filter: "#Inbox" });

      if (opts.quiet) { for (const t of tasks) console.log(t.id); return; }
      if (opts.csv || opts.tsv) { console.log(formatTasksDelimited(tasks, opts.tsv ? "\t" : ",")); return; }
      if (opts.json !== undefined) {
        printJsonFields(tasks as unknown as Record<string, unknown>[], opts.json);
        return;
      }

      console.log(chalk.bold("Inbox"));
      console.log("");
      printShortcutTable(tasks);
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
  .action(async (opts: { quiet?: boolean }) => {
    try {
      let tasks = await getTasks({ filter: "overdue" });
      // Sort oldest first
      tasks.sort((a, b) => {
        const aDate = a.due?.date ?? "9999";
        const bDate = b.due?.date ?? "9999";
        return aDate.localeCompare(bDate);
      });

      if (opts.quiet) {
        for (const t of tasks) console.log(t.id);
        return;
      }

      console.log(chalk.bold("Overdue Tasks"));
      console.log("");
      printShortcutTable(tasks);
    } catch (err) {
      handleError(err);
    }
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
  .action(async (query: string, opts: { quiet?: boolean }) => {
    try {
      const tasks = await getTasks({ filter: `search: ${query}` });

      if (opts.quiet) {
        for (const t of tasks) console.log(t.id);
        return;
      }

      console.log(chalk.bold(`Search: "${query}"`));
      console.log("");
      printShortcutTable(tasks);
    } catch (err) {
      handleError(err);
    }
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
        let success = 0;
        let failed = 0;
        for (const line of lines) {
          try {
            const parsed = parseQuickAdd(line);
            const params: CreateTaskParams = { content: parsed.content };
            if (parsed.description) params.description = parsed.description;
            if (parsed.priority) params.priority = parsed.priority;
            if (parsed.labels.length > 0) params.labels = parsed.labels;
            if (parsed.due_string) params.due_string = parsed.due_string;
            if (parsed.deadline) params.deadline_date = parsed.deadline;
            if (parsed.project_name) {
              const resolvedId = await resolveProjectName(parsed.project_name);
              if (resolvedId) params.project_id = resolvedId;
            }
            if (parsed.section_name) {
              const resolvedId = await resolveSectionName(parsed.section_name, params.project_id);
              if (resolvedId) params.section_id = resolvedId;
            }
            // Shared flags override
            if (opts.project) {
              const resolvedId = await resolveProjectName(opts.project);
              params.project_id = resolvedId ?? opts.project;
            }
            if (opts.priority) params.priority = parseInt(opts.priority, 10) as Priority;
            if (opts.label.length > 0) params.labels = opts.label;
            if (opts.due) params.due_string = opts.due;

            await createTask(params);
            success++;
          } catch (err) {
            failed++;
            console.error(chalk.red(`Failed to create "${line.trim()}": ${err instanceof Error ? err.message : err}`));
          }
        }
        console.log(chalk.green(`Created ${success} task${success === 1 ? "" : "s"}`) + (failed > 0 ? chalk.red(` (${failed} failed)`) : ""));
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
      const params: CreateTaskParams = { content: parsed.content };
      if (parsed.description) params.description = parsed.description;
      if (parsed.priority) params.priority = parsed.priority;
      if (parsed.labels.length > 0) params.labels = parsed.labels;
      if (parsed.due_string) params.due_string = parsed.due_string;
      if (parsed.deadline) params.deadline_date = parsed.deadline;
      if (parsed.project_name) {
        const resolvedId = await resolveProjectName(parsed.project_name);
        if (resolvedId) params.project_id = resolvedId;
      }
      if (parsed.section_name) {
        const resolvedId = await resolveSectionName(parsed.section_name, params.project_id);
        if (resolvedId) params.section_id = resolvedId;
      }
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
    .action(async (opts: { quiet?: boolean; csv?: boolean; tsv?: boolean; json?: string; count?: boolean; watch?: string | boolean }) => {
      const render = async () => {
        const tasks = await getTasks({ filter: query });
        if (opts.count) { console.log(String(tasks.length)); return; }
        if (opts.quiet) { for (const t of tasks) console.log(t.id); return; }
        if (opts.csv || opts.tsv) { console.log(formatTasksDelimited(tasks, opts.tsv ? "\t" : ",")); return; }
        if (opts.json !== undefined) {
          printJsonFields(tasks as unknown as Record<string, unknown>[], opts.json);
          return;
        }
        console.log(chalk.bold(name) + chalk.dim(` (${query})`));
        console.log("");
        printShortcutTable(tasks);
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
}

// "Did you mean?" for unknown commands
const knownCommands = [
  "task", "project", "label", "comment", "template", "section",
  "auth", "today", "inbox", "ui", "completion", "help",
  "completed", "review", "matrix", "log", "stats",
  "next", "upcoming", "overdue", "search", "deadlines", "a", "filter", "plugin",
  ...Object.keys(savedFilters),
];

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

async function main() {
  await loadCliPlugins(program);
  await program.parseAsync();
}

main();
