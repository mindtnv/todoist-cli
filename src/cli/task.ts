import type { Command } from "commander";
import chalk from "chalk";
import { createInterface } from "node:readline";
import type { Task, Priority, CreateTaskParams } from "../api/types.ts";
import { getTasks, getTask, createTask, closeTask, deleteTask, updateTask, reopenTask } from "../api/tasks.ts";
import { getProjects } from "../api/projects.ts";
import { getLabels } from "../api/labels.ts";
import { getSections } from "../api/sections.ts";
import { getComments } from "../api/comments.ts";
import { parseQuickAdd, resolveProjectName, resolveSectionName } from "../utils/quick-add.ts";
import { padEnd, priorityLabel, truncate, ID_WIDTH, PRI_WIDTH, getContentWidth, getDueWidth } from "../utils/format.ts";
import { formatTasksDelimited } from "../utils/output.ts";
import { handleError } from "../utils/errors.ts";
import { getDefaults } from "../config/index.ts";
import { cliExit } from "../utils/exit.ts";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function readIdsFromStdin(): Promise<string[]> {
  const input = await readStdin();
  return input.split(/\s+/).map(s => s.trim()).filter(Boolean);
}

async function resolveIds(ids: string[], filterQuery?: string): Promise<string[]> {
  // If "-" is in the list, read from stdin
  if (ids.length === 1 && ids[0] === "-") {
    return readIdsFromStdin();
  }

  // If filter is provided, fetch matching task IDs
  if (filterQuery) {
    const tasks = await getTasks({ filter: filterQuery });
    return tasks.map(t => t.id);
  }

  return ids;
}

function formatDue(task: Task): string {
  const due = task.due ? task.due.date : "";
  if (task.deadline) {
    const dl = chalk.magenta(`DL:${task.deadline.date}`);
    return due ? `${due} ${dl}` : dl;
  }
  return due;
}

function tableSeparatorWidth(): number {
  return ID_WIDTH + 1 + PRI_WIDTH + 1 + getContentWidth() + 1 + getDueWidth() + 1 + 10;
}

export function printTaskTable(tasks: Task[], indent = 0, showHeader = true): void {
  const CONTENT_WIDTH = getContentWidth();
  const DUE_WIDTH = getDueWidth();

  if (tasks.length === 0 && indent === 0) {
    console.log(chalk.dim("No tasks found."));
    return;
  }

  if (indent === 0 && showHeader) {
    const header = `${padEnd("ID", ID_WIDTH)} ${padEnd("Pri", PRI_WIDTH)} ${padEnd("Content", CONTENT_WIDTH)} ${padEnd("Due", DUE_WIDTH)} Labels`;
    console.log(chalk.bold(header));
    console.log(chalk.dim("-".repeat(tableSeparatorWidth())));
  }

  for (const t of tasks) {
    const prefix = " ".repeat(indent * 2);
    const id = padEnd(t.id, ID_WIDTH);
    const pri = padEnd(priorityLabel(t.priority), PRI_WIDTH);
    const maxContent = CONTENT_WIDTH - 2 - indent * 2;
    const contentStr = truncate(t.content, maxContent);
    const content = padEnd(prefix + contentStr, CONTENT_WIDTH);
    const due = padEnd(formatDue(t), DUE_WIDTH);
    const labels = t.labels.length > 0 ? chalk.cyan(t.labels.join(", ")) : "";
    console.log(`${id} ${pri} ${content} ${due} ${labels}`);
  }
}

function buildTree(tasks: Task[]): void {
  const CONTENT_WIDTH = getContentWidth();
  const DUE_WIDTH = getDueWidth();
  const childMap = new Map<string | null, Task[]>();

  for (const t of tasks) {
    const parentKey = t.parent_id ?? null;
    if (!childMap.has(parentKey)) childMap.set(parentKey, []);
    childMap.get(parentKey)!.push(t);
  }

  const taskIds = new Set(tasks.map((t) => t.id));

  // Root tasks: no parent or parent not in the list
  const roots = tasks.filter((t) => t.parent_id === null || !taskIds.has(t.parent_id));

  if (roots.length === 0) {
    console.log(chalk.dim("No tasks found."));
    return;
  }

  const header = `${padEnd("ID", ID_WIDTH)} ${padEnd("Pri", PRI_WIDTH)} ${padEnd("Content", CONTENT_WIDTH)} ${padEnd("Due", DUE_WIDTH)} Labels`;
  console.log(chalk.bold(header));
  console.log(chalk.dim("-".repeat(tableSeparatorWidth())));

  function printLevel(parentId: string | null, depth: number): void {
    const children = childMap.get(parentId) ?? [];
    for (const t of children) {
      const prefix = "  ".repeat(depth);
      const id = padEnd(t.id, ID_WIDTH);
      const pri = padEnd(priorityLabel(t.priority), PRI_WIDTH);
      const maxContent = CONTENT_WIDTH - 2 - depth * 2;
      const contentStr = truncate(t.content, maxContent);
      const content = padEnd(prefix + contentStr, CONTENT_WIDTH);
      const due = padEnd(formatDue(t), DUE_WIDTH);
      const labels = t.labels.length > 0 ? chalk.cyan(t.labels.join(", ")) : "";
      console.log(`${id} ${pri} ${content} ${due} ${labels}`);
      printLevel(t.id, depth + 1);
    }
  }

  // Print roots
  for (const root of roots) {
    const id = padEnd(root.id, ID_WIDTH);
    const pri = padEnd(priorityLabel(root.priority), PRI_WIDTH);
    const contentStr = truncate(root.content, CONTENT_WIDTH - 2);
    const content = padEnd(contentStr, CONTENT_WIDTH);
    const due = padEnd(formatDue(root), DUE_WIDTH);
    const labels = root.labels.length > 0 ? chalk.cyan(root.labels.join(", ")) : "";
    console.log(`${id} ${pri} ${content} ${due} ${labels}`);
    printLevel(root.id, 1);
  }
}

// JSON output helpers

export function pickFields(tasks: Task[], fields: string[]): Record<string, unknown>[] {
  return tasks.map((t) => {
    const obj: Record<string, unknown> = {};
    for (const f of fields) {
      if (f in t) {
        obj[f] = (t as unknown as Record<string, unknown>)[f];
      }
    }
    return obj;
  });
}

function applyJq(data: unknown[], expr: string): unknown {
  // Support: .[].fieldname, .[N], .[N].fieldname
  const dotBracketField = /^\.\[\]\.\s*(\w+)$/.exec(expr);
  if (dotBracketField) {
    const field = dotBracketField[1]!;
    return data.map((item) => (item as Record<string, unknown>)[field]);
  }

  const dotIndex = /^\.\[(\d+)\]$/.exec(expr);
  if (dotIndex) {
    const idx = parseInt(dotIndex[1]!, 10);
    return data[idx];
  }

  const dotIndexField = /^\.\[(\d+)\]\.(\w+)$/.exec(expr);
  if (dotIndexField) {
    const idx = parseInt(dotIndexField[1]!, 10);
    const field = dotIndexField[2]!;
    const item = data[idx];
    if (item && typeof item === "object") {
      return (item as Record<string, unknown>)[field];
    }
    return undefined;
  }

  // Passthrough for unrecognized
  return data;
}

// Grouping helpers

interface GroupedTasks {
  label: string;
  tasks: Task[];
}

async function groupByProject(tasks: Task[]): Promise<GroupedTasks[]> {
  const projects = await getProjects();
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const groups = new Map<string, Task[]>();

  for (const t of tasks) {
    const name = projectMap.get(t.project_id) ?? "Unknown";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(t);
  }

  return Array.from(groups.entries()).map(([label, tasks]) => ({ label, tasks }));
}

function groupByLabel(tasks: Task[]): GroupedTasks[] {
  const groups = new Map<string, Task[]>();

  for (const t of tasks) {
    if (t.labels.length === 0) {
      const key = "(no label)";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    } else {
      for (const l of t.labels) {
        if (!groups.has(l)) groups.set(l, []);
        groups.get(l)!.push(t);
      }
    }
  }

  return Array.from(groups.entries()).map(([label, tasks]) => ({ label, tasks }));
}

export function groupByDate(tasks: Task[]): GroupedTasks[] {
  const groups = new Map<string, Task[]>();

  for (const t of tasks) {
    const key = t.due?.date ?? "(no due date)";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  // Sort by date
  const entries = Array.from(groups.entries()).sort(([a], [b]) => {
    if (a === "(no due date)") return 1;
    if (b === "(no due date)") return -1;
    return a.localeCompare(b);
  });

  return entries.map(([label, tasks]) => ({ label, tasks }));
}

function printGrouped(groups: GroupedTasks[]): void {
  const CONTENT_WIDTH = getContentWidth();
  const DUE_WIDTH = getDueWidth();
  // Print header once before all groups
  const header = `${padEnd("ID", ID_WIDTH)} ${padEnd("Pri", PRI_WIDTH)} ${padEnd("Content", CONTENT_WIDTH)} ${padEnd("Due", DUE_WIDTH)} Labels`;
  console.log("");
  console.log(chalk.bold(header));
  console.log(chalk.dim("-".repeat(tableSeparatorWidth())));

  for (const group of groups) {
    console.log("");
    console.log(chalk.bold.underline(group.label));
    printTaskTable(group.tasks, 0, false);
  }
}

async function resolveProjectOpt(value: string): Promise<string> {
  // If it looks like a raw ID (alphanumeric, long), use it directly
  // Otherwise try to resolve by name
  const resolved = await resolveProjectName(value);
  if (resolved) return resolved;
  // Fall back to using as-is (could be an ID)
  return value;
}

async function resolveSectionOpt(value: string, projectId?: string): Promise<string> {
  const resolved = await resolveSectionName(value, projectId);
  if (resolved) return resolved;
  return value;
}

function askQuestion(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
  });
}

async function interactiveAdd(sharedOpts: {
  priority?: string;
  project?: string;
  label: string[];
  due?: string;
  deadline?: string;
  parent?: string;
  section?: string;
  description?: string;
  quiet?: boolean;
}): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    let addMore = true;
    while (addMore) {
      const content = await askQuestion(rl, chalk.cyan("? Task: "));
      if (!content.trim()) {
        console.log(chalk.dim("Empty task, skipping."));
        addMore = false;
        break;
      }

      const dueInput = await askQuestion(rl, chalk.cyan("? Due date (empty to skip): "));
      const projectInput = await askQuestion(rl, chalk.cyan("? Project (empty for Inbox): "));
      const priorityInput = await askQuestion(rl, chalk.cyan("? Priority (1=normal, 4=urgent, default 1): "));
      const labelsInput = await askQuestion(rl, chalk.cyan("? Labels (comma separated, empty to skip): "));
      const descInput = await askQuestion(rl, chalk.cyan("? Description (empty to skip): "));

      const params: CreateTaskParams = { content: content.trim() };

      // Due date
      const dueStr = dueInput.trim() || sharedOpts.due;
      if (dueStr) params.due_string = dueStr;

      // Project
      const projectStr = projectInput.trim() || sharedOpts.project;
      if (projectStr) {
        const resolvedId = await resolveProjectName(projectStr);
        params.project_id = resolvedId ?? projectStr;
      }

      // Priority
      const priStr = priorityInput.trim() || sharedOpts.priority;
      if (priStr) {
        const p = parseInt(priStr, 10);
        if (p >= 1 && p <= 4) params.priority = p as Priority;
      }

      // Labels
      const labelList = labelsInput.trim()
        ? labelsInput.split(",").map(l => l.trim()).filter(Boolean)
        : sharedOpts.label.length > 0 ? sharedOpts.label : undefined;
      if (labelList && labelList.length > 0) params.labels = labelList;

      // Description
      const desc = descInput.trim() || sharedOpts.description;
      if (desc) params.description = desc;

      // Deadline
      if (sharedOpts.deadline) params.deadline_date = sharedOpts.deadline;
      if (sharedOpts.parent) params.parent_id = sharedOpts.parent;
      if (sharedOpts.section) {
        const resolvedId = await resolveSectionName(sharedOpts.section, params.project_id);
        params.section_id = resolvedId ?? sharedOpts.section;
      }

      const result = await createTask(params);

      if (sharedOpts.quiet) {
        console.log(result.id);
      } else {
        const parts: string[] = [`"${result.content}"`];
        if (params.project_id) parts.push(`in ${projectStr || params.project_id}`);
        if (params.due_string) parts.push(`(due ${params.due_string})`);
        if (params.priority && params.priority > 1) parts.push(`p${params.priority}`);
        if (params.labels && params.labels.length > 0) parts.push(`[${params.labels.map(l => `@${l}`).join(", ")}]`);
        console.log(chalk.green(`Created: ${parts.join(" ")}`));
      }

      const again = await askQuestion(rl, chalk.cyan("Add another? (y/N): "));
      addMore = again.trim().toLowerCase() === "y";
    }
  } finally {
    rl.close();
  }
  cliExit(0);
}

export function registerTaskCommand(program: Command): void {
  const task = program
    .command("task")
    .description("Manage tasks");

  task
    .command("add")
    .description("Add a new task (interactive mode if no text given)")
    .argument("[text]", "Task content (or quick-add string like 'Buy milk tomorrow #Shopping p1 @errands')")
    .option("-p, --priority <priority>", "Priority (1-4)")
    .option("-P, --project <name-or-id>", "Project name or ID")
    .option("-l, --label <name>", "Label name (can be repeated)", (val: string, acc: string[]) => { acc.push(val); return acc; }, [] as string[])
    .option("-d, --due <string>", "Due date string (e.g. 'tomorrow', '2025-01-15')")
    .option("--deadline <date>", "Deadline date (YYYY-MM-DD)")
    .option("--parent <id>", "Parent task ID (creates a subtask)")
    .option("--section <name-or-id>", "Section name or ID")
    .option("-D, --description <text>", "Task description")
    .option("-e, --editor", "Open $EDITOR for multi-line description")
    .option("--batch", "Read tasks from stdin (one per line)")
    .option("--dry-run", "Preview what quick-add would parse without creating")
    .option("-q, --quiet", "Print only the task ID")
    .addHelpText("after", `
Examples:
  todoist task add "Buy milk tomorrow #Shopping p1 @errands"
  todoist task add "Meeting" -d "next monday 10am" -P Work
  todoist task add "Report" -D "Include Q1 numbers"
  todoist task add "Draft" -e                     # open $EDITOR for description
  todoist task add "Buy milk" --dry-run           # preview parse result
  todoist task add                                # interactive mode
  todoist task add --batch < tasks.txt
  echo "Task 1\\nTask 2" | todoist task add --batch --project Work
`)
    .action(async (text: string | undefined, opts: {
      priority?: string;
      project?: string;
      label: string[];
      due?: string;
      deadline?: string;
      parent?: string;
      section?: string;
      description?: string;
      editor?: boolean;
      batch?: boolean;
      dryRun?: boolean;
      quiet?: boolean;
    }) => {
      try {
        // Batch mode: read tasks from stdin
        if (opts.batch) {
          const input = await readStdin();
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
              // Shared flags override parsed values
              if (opts.project) params.project_id = await resolveProjectOpt(opts.project);
              if (opts.priority) params.priority = parseInt(opts.priority, 10) as Priority;
              if (opts.label.length > 0) params.labels = opts.label;
              if (opts.due) params.due_string = opts.due;
              if (opts.deadline) params.deadline_date = opts.deadline;
              if (opts.parent) params.parent_id = opts.parent;
              if (opts.section) params.section_id = await resolveSectionOpt(opts.section, params.project_id);

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

        // Interactive mode: no text argument provided
        if (text === undefined) {
          await interactiveAdd(opts);
          return;
        }

        // Dry-run mode: preview quick-add parse result
        if (opts.dryRun) {
          const parsed = parseQuickAdd(text);
          console.log(chalk.bold("Preview:"));
          console.log(`  ${chalk.dim("Content:")}   ${parsed.content}`);
          if (parsed.due_string) console.log(`  ${chalk.dim("Due:")}       ${parsed.due_string}`);
          if (parsed.priority) console.log(`  ${chalk.dim("Priority:")}  p${parsed.priority}`);
          if (parsed.project_name) console.log(`  ${chalk.dim("Project:")}   ${parsed.project_name}`);
          if (parsed.section_name) console.log(`  ${chalk.dim("Section:")}   ${parsed.section_name}`);
          if (parsed.deadline) console.log(`  ${chalk.dim("Deadline:")}  ${parsed.deadline}`);
          if (parsed.labels.length > 0) console.log(`  ${chalk.dim("Labels:")}    ${parsed.labels.join(", ")}`);
          cliExit(0);
        }

        // Get description from --editor flag
        let description = opts.description;
        if (opts.editor) {
          const { writeFileSync, readFileSync } = await import("node:fs");
          const { spawnSync } = await import("node:child_process");
          const tmpFile = `/tmp/todoist-desc-${Date.now()}.md`;
          writeFileSync(tmpFile, description ?? "");
          const editor = process.env.EDITOR || process.env.VISUAL || "vi";
          spawnSync(editor, [tmpFile], { stdio: "inherit" });
          description = readFileSync(tmpFile, "utf-8");
          if (description.trim() === "") description = undefined;
        }

        const hasExplicitFlags = opts.priority !== undefined || opts.project !== undefined ||
          opts.label.length > 0 || opts.due !== undefined || opts.deadline !== undefined ||
          opts.parent !== undefined || opts.section !== undefined;

        // Apply config defaults
        const defaults = getDefaults();

        let content = text;
        let priority: Priority = (defaults.priority ?? 1) as Priority;
        let projectId = opts.project ? await resolveProjectOpt(opts.project) : (defaults.project ? await resolveProjectOpt(defaults.project) : undefined);
        let labels = opts.label.length > 0 ? opts.label : (defaults.labels?.length ? [...defaults.labels] : undefined);
        let dueString = opts.due;
        let deadlineDate = opts.deadline;
        let parentId = opts.parent;
        let sectionId = opts.section ? await resolveSectionOpt(opts.section, projectId) : undefined;

        if (!hasExplicitFlags) {
          // Use quick-add parser
          const parsed = parseQuickAdd(text);
          content = parsed.content;
          if (parsed.priority) priority = parsed.priority;
          if (parsed.labels.length > 0) labels = parsed.labels;
          if (parsed.due_string) dueString = parsed.due_string;
          if (parsed.deadline) deadlineDate = parsed.deadline;
          if (parsed.project_name) {
            const resolvedId = await resolveProjectName(parsed.project_name);
            if (resolvedId) projectId = resolvedId;
          }
          if (parsed.section_name) {
            const resolvedId = await resolveSectionName(parsed.section_name, projectId);
            if (resolvedId) sectionId = resolvedId;
          }
        } else {
          if (opts.priority) priority = parseInt(opts.priority, 10) as Priority;
        }

        const result = await createTask({
          content,
          description,
          priority,
          project_id: projectId,
          labels,
          due_string: dueString,
          deadline_date: deadlineDate,
          parent_id: parentId,
          section_id: sectionId,
        });

        if (opts.quiet) {
          console.log(result.id);
        } else {
          console.log(chalk.green(`Task created: ${result.content} (${result.id})`));
        }
      } catch (err) {
        handleError(err);
      }
    });

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
          switch (opts.sort) {
            case "priority":
              tasks.sort((a, b) => b.priority - a.priority);
              break;
            case "date":
              tasks.sort((a, b) => {
                if (!a.due && !b.due) return 0;
                if (!a.due) return 1;
                if (!b.due) return -1;
                return a.due.date.localeCompare(b.due.date);
              });
              break;
            case "content":
              tasks.sort((a, b) => a.content.localeCompare(b.content));
              break;
          }
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
          const fields = opts.json.split(",").map((f) => f.trim());
          const data = pickFields(tasks, fields);

          if (opts.jq) {
            const result = applyJq(data, opts.jq);
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(JSON.stringify(data, null, 2));
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
          let groups: GroupedTasks[];
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

  task
    .command("show")
    .description("Show full details of a task")
    .argument("<id>", "Task ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        const [t, projects, allTasks] = await Promise.all([
          getTask(id),
          getProjects(),
          getTasks(),
        ]);
        const projectName = projects.find((p) => p.id === t.project_id)?.name ?? t.project_id;

        // Resolve section name
        let sectionName: string | null = null;
        if (t.section_id) {
          const sections = await getSections(t.project_id);
          sectionName = sections.find(s => s.id === t.section_id)?.name ?? t.section_id;
        }

        // Resolve parent task content
        let parentContent: string | null = null;
        if (t.parent_id) {
          try {
            const parent = await getTask(t.parent_id);
            parentContent = parent.content;
          } catch { /* ignore */ }
        }

        // Get subtasks
        const subtasks = allTasks.filter(st => st.parent_id === t.id);

        // Get comments
        let comments: { id: string; content: string; posted_at: string }[] = [];
        try {
          comments = await getComments(t.id);
        } catch { /* comments may not be available */ }

        if (opts.json) {
          console.log(JSON.stringify({ ...t, project_name: projectName, section_name: sectionName, subtasks, comments }, null, 2));
          return;
        }

        console.log("");
        console.log(chalk.bold(t.content));
        if (t.description) {
          console.log("");
          console.log(chalk.dim("  " + t.description.split("\n").join("\n  ")));
        }
        console.log("");
        console.log(`  ${chalk.dim("ID:")}          ${t.id}`);
        console.log(`  ${chalk.dim("Priority:")}    ${priorityLabel(t.priority)}`);
        console.log(`  ${chalk.dim("Project:")}     ${projectName}`);
        if (sectionName) {
          console.log(`  ${chalk.dim("Section:")}     ${sectionName}`);
        }
        if (t.parent_id) {
          console.log(`  ${chalk.dim("Parent:")}      ${parentContent ?? t.parent_id}`);
        }
        if (t.due) {
          const dueStr = t.due.datetime ?? t.due.date;
          const recurring = t.due.is_recurring ? chalk.cyan(` (recurring: ${t.due.string})`) : "";
          console.log(`  ${chalk.dim("Due:")}         ${dueStr}${recurring}`);
        }
        if (t.deadline) {
          console.log(`  ${chalk.dim("Deadline:")}    ${chalk.magenta(t.deadline.date)}`);
        }
        if (t.labels.length > 0) {
          console.log(`  ${chalk.dim("Labels:")}      ${chalk.cyan(t.labels.join(", "))}`);
        }
        const created = (t as unknown as Record<string, unknown>).added_at ?? t.created_at;
        if (created) console.log(`  ${chalk.dim("Created:")}     ${created}`);
        if (t.url) console.log(`  ${chalk.dim("URL:")}         ${t.url}`);

        // Subtasks
        if (subtasks.length > 0) {
          console.log("");
          console.log(chalk.bold(`  Subtasks (${subtasks.length}):`));
          for (const st of subtasks) {
            const pri = priorityLabel(st.priority);
            const due = st.due ? chalk.dim(` (${st.due.date})`) : "";
            console.log(`    ${pri}  ${st.content}${due}`);
          }
        }

        // Comments
        if (comments.length > 0) {
          console.log("");
          console.log(chalk.bold(`  Comments (${comments.length}):`));
          for (const c of comments) {
            const date = new Date(c.posted_at);
            const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
            console.log(`    ${chalk.dim(timeStr)}  ${c.content}`);
          }
        }

        console.log("");
      } catch (err) {
        handleError(err);
      }
    });

  task
    .command("complete")
    .description("Complete one or more tasks")
    .argument("[ids...]", "Task ID(s), or '-' to read from stdin")
    .option("-f, --filter <query>", "Complete all tasks matching filter")
    .option("-q, --quiet", "Print only the task IDs")
    .option("--dry-run", "Preview which tasks would be completed")
    .action(async (ids: string[], opts: { filter?: string; quiet?: boolean; dryRun?: boolean }) => {
      try {
        const resolved = await resolveIds(ids, opts.filter);
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

        const results = await Promise.allSettled(resolved.map(id => closeTask(id)));
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

  task
    .command("reopen")
    .description("Reopen one or more completed tasks")
    .argument("[ids...]", "Task ID(s), or '-' to read from stdin")
    .option("-f, --filter <query>", "Reopen all tasks matching filter")
    .option("-q, --quiet", "Print only the task IDs")
    .action(async (ids: string[], opts: { filter?: string; quiet?: boolean }) => {
      try {
        const resolved = await resolveIds(ids, opts.filter);
        if (resolved.length === 0) {
          console.error(chalk.red("No tasks to reopen."));
          cliExit(1);
        }

        const results = await Promise.allSettled(resolved.map(id => reopenTask(id)));
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
          console.log(chalk.green(`Reopened ${success} task(s).`) + (failed > 0 ? chalk.red(` ${failed} failed.`) : ""));
        }
        cliExit(0);
      } catch (err) {
        handleError(err);
      }
    });

  task
    .command("delete")
    .description("Delete one or more tasks")
    .argument("[ids...]", "Task ID(s), or '-' to read from stdin")
    .option("-f, --filter <query>", "Delete all tasks matching filter")
    .option("-q, --quiet", "Print only the task IDs")
    .option("--dry-run", "Preview which tasks would be deleted")
    .action(async (ids: string[], opts: { filter?: string; quiet?: boolean; dryRun?: boolean }) => {
      try {
        const resolved = await resolveIds(ids, opts.filter);
        if (resolved.length === 0) {
          console.error(chalk.red("No tasks to delete."));
          cliExit(1);
        }

        if (opts.dryRun) {
          console.log(chalk.bold(`Would delete ${resolved.length} task(s):`));
          for (const id of resolved) {
            try {
              const t = await getTask(id);
              console.log(`  ${id}  ${t.content}`);
            } catch { console.log(`  ${id}`); }
          }
          return;
        }

        const results = await Promise.allSettled(resolved.map(id => deleteTask(id)));
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
          console.log(chalk.green(`Deleted ${success} task(s).`) + (failed > 0 ? chalk.red(` ${failed} failed.`) : ""));
        }
        cliExit(0);
      } catch (err) {
        handleError(err);
      }
    });

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
    .action(async (id: string, opts: { text?: string; priority?: string; due?: string; deadline?: string; description?: string; label: string[]; project?: string; section?: string }) => {
      try {
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
          params.project_id = await resolveProjectOpt(opts.project);
        }

        if (opts.section) {
          params.section_id = await resolveSectionOpt(opts.section, params.project_id as string | undefined);
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

        const result = await updateTask(id, params);
        console.log(chalk.green(`Task ${result.id} updated: ${result.content}`));
      } catch (err) {
        handleError(err);
      }
    });

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
        const resolved = await resolveIds(ids, opts.filter);
        if (resolved.length === 0) {
          console.error(chalk.red("No tasks to move."));
          cliExit(1);
        }

        const projectId = await resolveProjectOpt(opts.project);
        const params: Record<string, unknown> = { project_id: projectId };

        if (opts.section) {
          params.section_id = await resolveSectionOpt(opts.section, projectId);
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
