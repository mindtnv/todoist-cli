import chalk from "chalk";
import type { Priority } from "../../../api/types.ts";
import type { HookRegistry } from "../../../plugins/types.ts";
import { createTask } from "../../../api/tasks.ts";
import { parseQuickAdd, quickAddResultToParams } from "../../../utils/quick-add.ts";
import { resolveProjectArg, resolveSectionArg, resolveTaskArg } from "../../../utils/resolve.ts";

interface BatchOptions {
  project?: string;
  priority?: string;
  labels?: string[];
  due?: string;
  deadline?: string;
  parent?: string;
  section?: string;
}

export async function batchCreateTasks(
  lines: string[],
  opts: BatchOptions,
  hooks?: HookRegistry | null,
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  for (const line of lines) {
    try {
      const parsed = parseQuickAdd(line);
      const params = await quickAddResultToParams(parsed);
      // Apply overrides from opts
      if (opts.project) params.project_id = await resolveProjectArg(opts.project);
      if (opts.priority) params.priority = parseInt(opts.priority, 10) as Priority;
      if (opts.labels && opts.labels.length > 0) params.labels = opts.labels;
      if (opts.due) params.due_string = opts.due;
      if (opts.deadline) params.deadline_date = opts.deadline;
      if (opts.parent) params.parent_id = await resolveTaskArg(opts.parent);
      if (opts.section) params.section_id = await resolveSectionArg(opts.section, params.project_id);

      try { await hooks?.emit("task.creating", { params }); } catch { /* hook errors non-fatal */ }
      const result = await createTask(params);
      try { await hooks?.emit("task.created", { task: result }); } catch { /* hook errors non-fatal */ }
      success++;
    } catch (err) {
      failed++;
      console.error(chalk.red(`Failed to create "${line.trim()}": ${err instanceof Error ? err.message : err}`));
    }
  }
  console.log(chalk.green(`Created ${success} task${success === 1 ? "" : "s"}`) + (failed > 0 ? chalk.red(` (${failed} failed)`) : ""));
  return { success, failed };
}
