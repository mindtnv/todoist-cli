import chalk from "chalk";
import type { Task } from "../../../api/types.ts";
import { getTasks } from "../../../api/tasks.ts";
import { getProjects } from "../../../api/projects.ts";
import { resolveProjectName, resolveSectionName } from "../../../utils/quick-add.ts";
import { padEnd, priorityLabel, truncate, ID_WIDTH, PRI_WIDTH, getContentWidth, getDueWidth } from "../../../utils/format.ts";
import { saveLastList } from "../../../utils/resolve.ts";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

export async function readIdsFromStdin(): Promise<string[]> {
  const input = await readStdin();
  return input.split(/\s+/).map(s => s.trim()).filter(Boolean);
}

export { readStdin };

export async function resolveIds(ids: string[], filterQuery?: string): Promise<string[]> {
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

export function tableSeparatorWidth(): number {
  return 3 + 1 + ID_WIDTH + 1 + PRI_WIDTH + 1 + getContentWidth() + 1 + getDueWidth() + 1 + 10;
}

export function printTaskTable(tasks: Task[], indent = 0, showHeader = true, saveIndex = true, startIndex = 0): number {
  const CONTENT_WIDTH = getContentWidth();
  const DUE_WIDTH = getDueWidth();

  if (tasks.length === 0 && indent === 0) {
    console.log(chalk.dim("No tasks found."));
    return startIndex;
  }

  if (indent === 0 && showHeader) {
    const header = `${"#".padStart(3)} ${padEnd("ID", ID_WIDTH)} ${padEnd("Pri", PRI_WIDTH)} ${padEnd("Content", CONTENT_WIDTH)} ${padEnd("Due", DUE_WIDTH)} Labels`;
    console.log(chalk.bold(header));
    console.log(chalk.dim("-".repeat(tableSeparatorWidth())));
  }

  let idx = startIndex;
  for (const t of tasks) {
    const num = chalk.dim(String(idx + 1).padStart(3));
    const prefix = " ".repeat(indent * 2);
    const id = padEnd(t.id, ID_WIDTH);
    const pri = padEnd(priorityLabel(t.priority), PRI_WIDTH);
    const maxContent = CONTENT_WIDTH - 2 - indent * 2;
    const contentStr = truncate(t.content, maxContent);
    const content = padEnd(prefix + contentStr, CONTENT_WIDTH);
    const due = padEnd(formatDue(t), DUE_WIDTH);
    const labels = t.labels.length > 0 ? chalk.cyan(t.labels.join(", ")) : "";
    console.log(`${num} ${id} ${pri} ${content} ${due} ${labels}`);
    idx++;
  }

  if (saveIndex && indent === 0) {
    saveLastList("task", tasks.map(t => ({ id: t.id, label: t.content })));
  }

  return idx;
}

export function buildTree(tasks: Task[]): void {
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

  const header = `${"#".padStart(3)} ${padEnd("ID", ID_WIDTH)} ${padEnd("Pri", PRI_WIDTH)} ${padEnd("Content", CONTENT_WIDTH)} ${padEnd("Due", DUE_WIDTH)} Labels`;
  console.log(chalk.bold(header));
  console.log(chalk.dim("-".repeat(tableSeparatorWidth())));

  // Collect ordered tasks for index saving
  const orderedTasks: Task[] = [];
  let globalIdx = 0;

  function printLevel(parentId: string | null, depth: number): void {
    const children = childMap.get(parentId) ?? [];
    for (const t of children) {
      const num = chalk.dim(String(globalIdx + 1).padStart(3));
      const prefix = "  ".repeat(depth);
      const id = padEnd(t.id, ID_WIDTH);
      const pri = padEnd(priorityLabel(t.priority), PRI_WIDTH);
      const maxContent = CONTENT_WIDTH - 2 - depth * 2;
      const contentStr = truncate(t.content, maxContent);
      const content = padEnd(prefix + contentStr, CONTENT_WIDTH);
      const due = padEnd(formatDue(t), DUE_WIDTH);
      const labels = t.labels.length > 0 ? chalk.cyan(t.labels.join(", ")) : "";
      console.log(`${num} ${id} ${pri} ${content} ${due} ${labels}`);
      orderedTasks.push(t);
      globalIdx++;
      printLevel(t.id, depth + 1);
    }
  }

  // Print roots
  for (const root of roots) {
    const num = chalk.dim(String(globalIdx + 1).padStart(3));
    const id = padEnd(root.id, ID_WIDTH);
    const pri = padEnd(priorityLabel(root.priority), PRI_WIDTH);
    const contentStr = truncate(root.content, CONTENT_WIDTH - 2);
    const content = padEnd(contentStr, CONTENT_WIDTH);
    const due = padEnd(formatDue(root), DUE_WIDTH);
    const labels = root.labels.length > 0 ? chalk.cyan(root.labels.join(", ")) : "";
    console.log(`${num} ${id} ${pri} ${content} ${due} ${labels}`);
    orderedTasks.push(root);
    globalIdx++;
    printLevel(root.id, 1);
  }

  saveLastList("task", orderedTasks.map(t => ({ id: t.id, label: t.content })));
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

export function applyJq(data: unknown[], expr: string): unknown {
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

export async function groupByProject(tasks: Task[]): Promise<GroupedTasks[]> {
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

export function groupByLabel(tasks: Task[]): GroupedTasks[] {
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

export function printGrouped(groups: GroupedTasks[]): void {
  const CONTENT_WIDTH = getContentWidth();
  const DUE_WIDTH = getDueWidth();
  // Print header once before all groups
  const header = `${"#".padStart(3)} ${padEnd("ID", ID_WIDTH)} ${padEnd("Pri", PRI_WIDTH)} ${padEnd("Content", CONTENT_WIDTH)} ${padEnd("Due", DUE_WIDTH)} Labels`;
  console.log("");
  console.log(chalk.bold(header));
  console.log(chalk.dim("-".repeat(tableSeparatorWidth())));

  let globalIdx = 0;
  const allTasks: Task[] = [];
  for (const group of groups) {
    console.log("");
    console.log(chalk.bold.underline(group.label));
    globalIdx = printTaskTable(group.tasks, 0, false, false, globalIdx);
    allTasks.push(...group.tasks);
  }

  saveLastList("task", allTasks.map(t => ({ id: t.id, label: t.content })));
}

export async function resolveProjectOpt(value: string): Promise<string> {
  // If it looks like a raw ID (alphanumeric, long), use it directly
  // Otherwise try to resolve by name
  const resolved = await resolveProjectName(value);
  if (resolved) return resolved;
  // Fall back to using as-is (could be an ID)
  return value;
}

export async function resolveSectionOpt(value: string, projectId?: string): Promise<string> {
  const resolved = await resolveSectionName(value, projectId);
  if (resolved) return resolved;
  return value;
}
