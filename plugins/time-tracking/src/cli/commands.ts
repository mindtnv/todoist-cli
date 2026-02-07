import type { Command } from "commander";
import chalk from "chalk";
import type { TimerService, TimeEntry } from "../timer.ts";
import { formatDuration, formatDurationShort, formatDate, parseDurationInput } from "../format.ts";

export function registerTimeCommands(program: Command, timer: TimerService): void {
  const time = program
    .command("time")
    .description("Track time on tasks");

  time
    .command("start <taskId>")
    .description("Start timer for a task")
    .action(async (taskId: string) => {
      try {
        const active = timer.getActive();
        if (active) {
          const elapsed = await timer.stopActive();
          console.log(chalk.yellow(`Stopped previous timer: ${formatDuration(elapsed)}`));
        }
        await timer.startTracking(taskId);
        console.log(chalk.green(`▶ Timer started for task ${taskId}`));
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  time
    .command("stop [taskId]")
    .description("Stop active timer (or timer for specific task)")
    .action(async (taskId?: string) => {
      try {
        if (taskId) {
          const elapsed = await timer.stop(taskId);
          if (elapsed === 0) {
            console.log(chalk.dim("No active timer for this task."));
            return;
          }
          console.log(chalk.green(`⏹ Stopped: ${formatDuration(elapsed)}`));
        } else {
          const active = timer.getActive();
          if (!active) {
            console.log(chalk.dim("No active timer."));
            return;
          }
          const elapsed = await timer.stopActive();
          console.log(chalk.green(`⏹ Stopped: ${formatDuration(elapsed)} (task ${active.taskId})`));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  time
    .command("pause [taskId]")
    .description("Pause active timer (or timer for specific task)")
    .action(async (taskId?: string) => {
      try {
        const active = timer.getActive();
        if (!active) {
          console.log(chalk.dim("No active timer."));
          return;
        }
        if (active.paused) {
          console.log(chalk.dim("Timer is already paused."));
          return;
        }
        const id = taskId ?? active.taskId;
        await timer.pause(id);
        console.log(chalk.yellow(`⏸ Paused: ${formatDuration(active.elapsed)} (task ${id})`));
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  time
    .command("status")
    .description("Show active timer")
    .action(() => {
      const active = timer.getActive();
      if (!active) {
        console.log(chalk.dim("No active timer."));
        return;
      }
      const icon = active.paused ? "⏸" : "▶";
      const state = active.paused ? chalk.yellow("paused") : chalk.green("running");
      console.log(`${icon} Task ${active.taskId} (${state})`);
      console.log(`  Elapsed: ${chalk.bold(formatDuration(active.elapsed))}`);
    });

  time
    .command("delete <taskId> <entryIndex>")
    .description("Delete a time entry by index (0-based)")
    .action(async (taskId: string, entryIndexStr: string) => {
      try {
        const entryIndex = parseInt(entryIndexStr, 10);
        if (isNaN(entryIndex)) {
          console.error(chalk.red("Entry index must be a number."));
          process.exit(1);
        }
        await timer.deleteEntry(taskId, entryIndex);
        console.log(chalk.green(`Deleted entry #${entryIndex} for task ${taskId}.`));
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  time
    .command("edit <taskId> <entryIndex>")
    .description("Edit duration of a time entry")
    .requiredOption("--duration <minutes>", "New duration in minutes")
    .action(async (taskId: string, entryIndexStr: string, opts: { duration: string }) => {
      try {
        const entryIndex = parseInt(entryIndexStr, 10);
        if (isNaN(entryIndex)) {
          console.error(chalk.red("Entry index must be a number."));
          process.exit(1);
        }
        const minutes = parseFloat(opts.duration);
        if (isNaN(minutes) || minutes <= 0) {
          console.error(chalk.red("Duration must be a positive number (in minutes)."));
          process.exit(1);
        }
        const durationMs = Math.round(minutes * 60 * 1000);
        await timer.editEntryDuration(taskId, entryIndex, durationMs);
        console.log(chalk.green(`Updated entry #${entryIndex} for task ${taskId} to ${formatDuration(durationMs)}.`));
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  time
    .command("add <taskId>")
    .description("Add a manual time entry")
    .requiredOption("--duration <value>", "Duration (e.g. 30m, 1h30m, 2h, 90)")
    .action(async (taskId: string, opts: { duration: string }) => {
      try {
        const durationMs = parseDurationInput(opts.duration);
        if (durationMs <= 0) {
          console.error(chalk.red("Duration must be positive. Examples: 30m, 1h30m, 2h, 90 (minutes)"));
          process.exit(1);
        }
        await timer.addManualEntry(taskId, durationMs);
        console.log(chalk.green(`\u2713 Added ${formatDuration(durationMs)} to task ${taskId}`));
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  time
    .command("log <taskId>")
    .description("Show time entries for a task")
    .action(async (taskId: string) => {
      try {
        const entries = await timer.getEntries(taskId);
        if (entries.length === 0) {
          console.log(chalk.dim("No time entries for this task."));
          return;
        }

        const total = entries.reduce((s, e) => s + e.duration, 0);
        console.log(chalk.bold(`Time Log — Task ${taskId}`));
        console.log(chalk.dim(`Total: ${formatDuration(total)}`));
        console.log("");

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]!;
          const date = formatDate(entry.start);
          const startTime = new Date(entry.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
          const endTime = new Date(entry.end).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
          const dur = formatDuration(entry.duration);
          console.log(`  ${chalk.dim(`[${i}]`)} ${chalk.dim(date)} ${startTime}-${endTime}  ${chalk.cyan(dur)}`);
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });

  time
    .command("report")
    .description("Show time report")
    .option("--days <n>", "Days to include", "7")
    .option("--json", "Output as JSON")
    .action(async (opts: { days: string; json?: boolean }) => {
      try {
        const days = parseInt(opts.days, 10);
        const entries = await timer.getAllEntries(days);

        if (entries.length === 0) {
          console.log(chalk.dim(`No time entries in the last ${days} days.`));
          return;
        }

        // Group by task
        const byTask = new Map<string, { total: number; entries: TimeEntry[] }>();
        for (const entry of entries) {
          const existing = byTask.get(entry.taskId) ?? { total: 0, entries: [] };
          existing.total += entry.duration;
          existing.entries.push(entry);
          byTask.set(entry.taskId, existing);
        }

        if (opts.json) {
          const data = Object.fromEntries(
            [...byTask.entries()].map(([taskId, { total, entries: taskEntries }]) => [
              taskId,
              {
                total_ms: total,
                total_formatted: formatDuration(total),
                entries: taskEntries.map(e => ({
                  start: new Date(e.start).toISOString(),
                  end: new Date(e.end).toISOString(),
                  duration_ms: e.duration,
                })),
              },
            ]),
          );
          console.log(JSON.stringify(data, null, 2));
          return;
        }

        const grandTotal = entries.reduce((s, e) => s + e.duration, 0);
        console.log(chalk.bold(`Time Report — Last ${days} days`));
        console.log(chalk.dim(`Grand total: ${formatDuration(grandTotal)}`));
        console.log("");

        // Sort by total time desc
        const sorted = [...byTask.entries()].sort((a, b) => b[1].total - a[1].total);

        for (const [taskId, { total }] of sorted) {
          const percentage = Math.round((total / grandTotal) * 100);
          const bar = "█".repeat(Math.max(1, Math.round(percentage / 5)));
          console.log(
            `  ${chalk.bold(taskId)}  ${chalk.cyan(formatDurationShort(total))}  ${chalk.dim(`${percentage}%`)}  ${chalk.green(bar)}`
          );
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
        process.exit(1);
      }
    });
}
