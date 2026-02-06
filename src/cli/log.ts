import type { Command } from "commander";
import chalk from "chalk";
import { getActivity } from "../api/activity.ts";
import { padEnd } from "../utils/format.ts";
import { handleError } from "../utils/errors.ts";

function eventColor(eventType: string): (text: string) => string {
  switch (eventType) {
    case "completed": return chalk.green;
    case "added":
    case "created": return chalk.blue;
    case "updated": return chalk.yellow;
    case "deleted": return chalk.red;
    default: return chalk.white;
  }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) +
    " " + d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function registerLogCommand(program: Command): void {
  program
    .command("log")
    .description("Show activity log")
    .option("-n, --limit <number>", "Number of events to show", "30")
    .action(async (opts: { limit: string }) => {
      try {
        const events = await getActivity(parseInt(opts.limit, 10));

        if (events.length === 0) {
          console.log(chalk.dim("No activity found."));
          return;
        }

        console.log(chalk.bold("Activity log:"));
        console.log(chalk.dim("-".repeat(70)));

        for (const e of events) {
          const time = chalk.dim(formatTimestamp(e.event_date));
          const colorFn = eventColor(e.event_type);
          const type = padEnd(colorFn(e.event_type), 12);
          const extra = e.extra_data && typeof e.extra_data === "object" && "content" in e.extra_data
            ? chalk.dim(` — ${String(e.extra_data.content)}`)
            : `${e.object_type}`;
          console.log(`  ${time}  ${type}  ${extra}`);
        }

        console.log("");
        console.log(chalk.dim(`Total: ${events.length} event${events.length === 1 ? "" : "s"}`));
      } catch (err) {
        handleError(err);
      }
    });
}
