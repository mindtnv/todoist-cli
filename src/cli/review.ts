import type { Command } from "commander";
import chalk from "chalk";
import { createInterface } from "readline";
import type { Task } from "../api/types.ts";
import { getTasks } from "../api/tasks.ts";
import { getCompletedTasks } from "../api/completed.ts";
import { priorityColor, priorityLabel } from "../utils/format.ts";
import { handleError } from "../utils/errors.ts";

function printSeparator(): void {
  console.log(chalk.dim("\u2500".repeat(60)));
}

function printStepHeader(step: number, title: string): void {
  console.log("");
  console.log(chalk.bold.cyan(`Step ${step}: ${title}`));
  printSeparator();
}

function printTaskLine(t: Task): void {
  const pri = priorityLabel(t.priority);
  const due = t.due ? chalk.dim(` (${t.due.date})`) : "";
  const content = t.content.length > 50 ? t.content.slice(0, 49) + "..." : t.content;
  console.log(`  ${pri} ${content}${due}`);
}

function waitForEnter(rl: ReturnType<typeof createInterface>, prompt: string): Promise<void> {
  return new Promise((resolve) => {
    rl.question(chalk.dim(prompt), () => resolve());
  });
}

export function registerReviewCommand(program: Command): void {
  program
    .command("review")
    .description("Interactive GTD weekly review")
    .action(async () => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });

      try {
        console.log("");
        console.log(chalk.bold.magenta("=== Weekly Review ==="));
        console.log(chalk.dim("A guided review of your tasks and projects."));

        // Step 1: Inbox
        printStepHeader(1, "Inbox");
        const inboxTasks = await getTasks({ filter: "#Inbox" });
        if (inboxTasks.length === 0) {
          console.log(chalk.green("  Inbox is empty! Nothing to process."));
        } else {
          console.log(`  ${chalk.yellow(String(inboxTasks.length))} task${inboxTasks.length === 1 ? "" : "s"} in Inbox:`);
          console.log("");
          for (const t of inboxTasks) {
            printTaskLine(t);
          }
        }
        await waitForEnter(rl, "\nPress Enter to continue...");

        // Step 2: Overdue tasks
        printStepHeader(2, "Overdue Tasks");
        const overdueTasks = await getTasks({ filter: "overdue" });
        if (overdueTasks.length === 0) {
          console.log(chalk.green("  No overdue tasks!"));
        } else {
          console.log(`  ${chalk.red(String(overdueTasks.length))} overdue task${overdueTasks.length === 1 ? "" : "s"}:`);
          console.log("");
          for (const t of overdueTasks) {
            printTaskLine(t);
          }
        }
        await waitForEnter(rl, "\nPress Enter to continue...");

        // Step 3: Tasks with no due date
        printStepHeader(3, "Tasks With No Due Date");
        const allTasks = await getTasks({ filter: "no date" });
        if (allTasks.length === 0) {
          console.log(chalk.green("  All tasks have due dates!"));
        } else {
          console.log(`  ${chalk.yellow(String(allTasks.length))} task${allTasks.length === 1 ? "" : "s"} without a due date:`);
          console.log("");
          for (const t of allTasks) {
            printTaskLine(t);
          }
        }
        await waitForEnter(rl, "\nPress Enter to continue...");

        // Step 4: Completed this week
        printStepHeader(4, "Completed This Week");
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const completedTasks = await getCompletedTasks(weekAgo.toISOString());
        if (completedTasks.length === 0) {
          console.log(chalk.dim("  No tasks completed this week."));
        } else {
          console.log(`  ${chalk.green(String(completedTasks.length))} task${completedTasks.length === 1 ? "" : "s"} completed this week!`);
          console.log("");
          const top = completedTasks.slice(0, 10);
          for (const t of top) {
            console.log(`  ${chalk.green("\u2713")} ${t.content}`);
          }
          if (completedTasks.length > 10) {
            console.log(chalk.dim(`  ... and ${completedTasks.length - 10} more`));
          }
        }

        console.log("");
        printSeparator();
        console.log(chalk.bold.magenta("=== Review Complete ==="));
        console.log("");
      } catch (err) {
        handleError(err);
      } finally {
        rl.close();
      }
    });
}
