import type { Command } from "commander";
import chalk from "chalk";
import { createInterface } from "node:readline";
import type { Priority, CreateTaskParams } from "../../../api/types.ts";
import { createTask } from "../../../api/tasks.ts";
import { parseQuickAdd, resolveProjectName, resolveSectionName, quickAddResultToParams } from "../../../utils/quick-add.ts";
import { handleError } from "../../../utils/errors.ts";
import { validateContent, validatePriority, validateDateString } from "../../../utils/validation.ts";
import { getDefaults } from "../../../config/index.ts";
import { cliExit } from "../../../utils/exit.ts";
import { isClearValue } from "../../../utils/clear-values.ts";
import { readStdin } from "./helpers.ts";
import { resolveTaskArg, resolveProjectArg, resolveSectionArg } from "../../../utils/resolve.ts";
import { getCliHookRegistry } from "../../plugin-loader.ts";

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
      if (sharedOpts.parent) params.parent_id = await resolveTaskArg(sharedOpts.parent);
      if (sharedOpts.section) {
        const resolvedId = await resolveSectionName(sharedOpts.section, params.project_id);
        params.section_id = resolvedId ?? sharedOpts.section;
      }

      const hooks = getCliHookRegistry();
      try { await hooks?.emit("task.creating", { params }); } catch { /* hook errors non-fatal */ }
      const result = await createTask(params);
      try { await hooks?.emit("task.created", { task: result }); } catch { /* hook errors non-fatal */ }

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

export function registerAddCommand(task: Command): void {
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
        const hooks = getCliHookRegistry();

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
              const params = await quickAddResultToParams(parsed);
              // Shared flags override parsed values
              if (opts.project) params.project_id = await resolveProjectArg(opts.project);
              if (opts.priority) params.priority = parseInt(opts.priority, 10) as Priority;
              if (opts.label.length > 0) params.labels = opts.label;
              if (opts.due) params.due_string = opts.due;
              if (opts.deadline) params.deadline_date = opts.deadline;
              if (opts.parent) params.parent_id = await resolveTaskArg(opts.parent);
              if (opts.section) params.section_id = await resolveSectionArg(opts.section, params.project_id);

              try { await hooks?.emit("task.creating", { params }); } catch { /* hook errors non-fatal */ }
              const batchResult = await createTask(params);
              try { await hooks?.emit("task.created", { task: batchResult }); } catch { /* hook errors non-fatal */ }
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

        // Validate deadline format if provided
        if (opts.deadline && !isClearValue(opts.deadline)) {
          const dateError = validateDateString(opts.deadline);
          if (dateError) {
            console.error(chalk.red(dateError));
            cliExit(1);
          }
        }

        // Dry-run mode: preview quick-add parse result
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
        let projectId = opts.project ? await resolveProjectArg(opts.project) : (defaults.project ? await resolveProjectArg(defaults.project) : undefined);
        let labels = opts.label.length > 0 ? opts.label : (defaults.labels?.length ? [...defaults.labels] : undefined);
        let dueString = opts.due;
        let deadlineDate = opts.deadline;
        let parentId = opts.parent ? await resolveTaskArg(opts.parent) : undefined;
        let sectionId = opts.section ? await resolveSectionArg(opts.section, projectId) : undefined;

        if (!hasExplicitFlags) {
          // Use quick-add parser
          const parsed = parseQuickAdd(text);
          const quickParams = await quickAddResultToParams(parsed);
          content = quickParams.content;
          if (quickParams.priority) priority = quickParams.priority;
          if (quickParams.labels && quickParams.labels.length > 0) labels = quickParams.labels;
          if (quickParams.due_string) dueString = quickParams.due_string;
          if (quickParams.deadline_date) deadlineDate = quickParams.deadline_date;
          if (parsed.description && !description) description = parsed.description;
          if (quickParams.project_id) projectId = quickParams.project_id;
          if (quickParams.section_id) sectionId = quickParams.section_id;
        } else {
          if (opts.priority) priority = parseInt(opts.priority, 10) as Priority;
        }

        const mainParams: CreateTaskParams = {
          content,
          description,
          priority,
          project_id: projectId,
          labels,
          due_string: dueString,
          deadline_date: deadlineDate,
          parent_id: parentId,
          section_id: sectionId,
        };
        try { await hooks?.emit("task.creating", { params: mainParams }); } catch { /* hook errors non-fatal */ }
        const result = await createTask(mainParams);
        try { await hooks?.emit("task.created", { task: result }); } catch { /* hook errors non-fatal */ }

        if (opts.quiet) {
          console.log(result.id);
        } else {
          console.log(chalk.green(`Task created: ${result.content} (${result.id})`));
        }
      } catch (err) {
        handleError(err);
      }
    });
}
