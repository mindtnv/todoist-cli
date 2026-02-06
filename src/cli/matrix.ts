import type { Command } from "commander";
import chalk from "chalk";
import type { Task, Priority } from "../api/types.ts";
import { getTasks } from "../api/tasks.ts";
import { padEnd, truncate } from "../utils/format.ts";
import { handleError } from "../utils/errors.ts";

const COL_WIDTH = 35;

function formatTaskLine(task: Task): string {
  const content = truncate(task.content, COL_WIDTH - 4);
  return `  ${content}`;
}

function renderQuadrant(title: string, tasks: Task[], color: (s: string) => string): string[] {
  const lines: string[] = [];
  lines.push(color(` ${title}`));
  if (tasks.length === 0) {
    lines.push(chalk.dim("  (empty)"));
  } else {
    for (const t of tasks.slice(0, 8)) {
      lines.push(formatTaskLine(t));
    }
    if (tasks.length > 8) {
      lines.push(chalk.dim(`  +${tasks.length - 8} more`));
    }
  }
  return lines;
}

function mergeColumns(left: string[], right: string[], colWidth: number): string[] {
  const maxLen = Math.max(left.length, right.length);
  const result: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    const l = padEnd(left[i] ?? "", colWidth);
    const r = padEnd(right[i] ?? "", colWidth);
    result.push(`${l} ${chalk.dim("\u2502")} ${r}`);
  }
  return result;
}

export function registerMatrixCommand(program: Command): void {
  program
    .command("matrix")
    .description("Eisenhower matrix view")
    .option("--today", "Only show tasks due today")
    .action(async (opts: { today?: boolean }) => {
      try {
        let tasks: Task[];
        if (opts.today) {
          tasks = await getTasks({ filter: "today" });
        } else {
          tasks = await getTasks();
        }

        const buckets: Record<Priority, Task[]> = { 1: [], 2: [], 3: [], 4: [] };
        for (const t of tasks) {
          buckets[t.priority].push(t);
        }

        const totalWidth = COL_WIDTH * 2 + 3;
        const hLine = chalk.dim("\u2500".repeat(COL_WIDTH));
        const hSep = `${hLine}${chalk.dim("\u253C")}${hLine}`;
        const topBorder = `${chalk.dim("\u250C")}${hLine}${chalk.dim("\u252C")}${hLine}${chalk.dim("\u2510")}`;
        const midBorder = `${chalk.dim("\u251C")}${hSep.replace(/\u253C/, "\u253C")}${chalk.dim("\u2524")}`;
        const botBorder = `${chalk.dim("\u2514")}${hLine}${chalk.dim("\u2534")}${hLine}${chalk.dim("\u2518")}`;

        const header = chalk.dim(" ".repeat(Math.floor((totalWidth - 20) / 2))) + chalk.bold("Eisenhower Matrix");
        console.log("");
        console.log(header);
        console.log("");

        // Top quadrants: p4 (DO FIRST / urgent) | p3 (SCHEDULE)
        const q1 = renderQuadrant("DO FIRST (p4)", buckets[4], chalk.red.bold);
        const q2 = renderQuadrant("SCHEDULE (p3)", buckets[3], chalk.yellow.bold);
        const topRows = mergeColumns(q1, q2, COL_WIDTH);

        // Bottom quadrants: p2 (DELEGATE) | p1 (ELIMINATE / normal)
        const q3 = renderQuadrant("DELEGATE (p2)", buckets[2], chalk.blue.bold);
        const q4 = renderQuadrant("ELIMINATE (p1)", buckets[1], chalk.white.bold);
        const botRows = mergeColumns(q3, q4, COL_WIDTH);

        console.log(topBorder);
        for (const row of topRows) {
          console.log(`${chalk.dim("\u2502")}${row}${chalk.dim("\u2502")}`);
        }
        console.log(midBorder);
        for (const row of botRows) {
          console.log(`${chalk.dim("\u2502")}${row}${chalk.dim("\u2502")}`);
        }
        console.log(botBorder);
        console.log("");

        const total = tasks.length;
        console.log(chalk.dim(`Total: ${total} task${total === 1 ? "" : "s"} — p4: ${buckets[4].length}, p3: ${buckets[3].length}, p2: ${buckets[2].length}, p1: ${buckets[1].length}`));
      } catch (err) {
        handleError(err);
      }
    });
}
