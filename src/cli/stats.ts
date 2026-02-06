import type { Command } from "commander";
import chalk from "chalk";
import { getStats } from "../api/stats.ts";
import { cliExit } from "../utils/exit.ts";

function bar(value: number, max: number, width: number): string {
  if (max === 0) return chalk.dim("░".repeat(width));
  const filled = Math.round((value / max) * width);
  return chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(width - filled));
}

export function registerStatsCommand(program: Command): void {
  program
    .command("stats")
    .description("Show productivity statistics")
    .action(async () => {
      try {
        const stats = await getStats();

        console.log("");
        console.log(chalk.bold.magenta("Productivity Stats"));
        console.log(chalk.dim("─".repeat(40)));

        // Summary
        console.log(`  ${chalk.bold("Karma:")}            ${chalk.yellow(String(stats.karma))} (${stats.karma_trend})`);
        console.log(`  ${chalk.bold("Completed today:")}  ${chalk.green(String(stats.completed_today))}`);
        console.log(`  ${chalk.bold("Completed total:")}  ${chalk.green(String(stats.completed_count))}`);

        // Daily breakdown
        if (stats.days_items.length > 0) {
          console.log("");
          console.log(chalk.bold("  Daily (last 7 days):"));
          const maxDaily = Math.max(...stats.days_items.map((d) => d.total_completed), 1);
          const recent = stats.days_items.slice(-7);
          for (const day of recent) {
            const date = chalk.dim(day.date.slice(5)); // MM-DD
            const count = String(day.total_completed).padStart(3, " ");
            console.log(`    ${date}  ${bar(day.total_completed, maxDaily, 20)}  ${count}`);
          }
        }

        // Weekly breakdown
        if (stats.week_items.length > 0) {
          console.log("");
          console.log(chalk.bold("  Weekly:"));
          const maxWeekly = Math.max(...stats.week_items.map((w) => w.total_completed), 1);
          const recent = stats.week_items.slice(-4);
          for (const week of recent) {
            const from = chalk.dim(week.from.slice(5));
            const to = chalk.dim(week.to.slice(5));
            const count = String(week.total_completed).padStart(3, " ");
            console.log(`    ${from} - ${to}  ${bar(week.total_completed, maxWeekly, 16)}  ${count}`);
          }
        }

        console.log("");
      } catch (err) {
        console.error(chalk.red(`Failed to fetch stats: ${(err as Error).message}`));
        cliExit(1);
      }
    });
}
