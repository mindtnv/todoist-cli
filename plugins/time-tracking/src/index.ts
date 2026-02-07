import type { TodoistPlugin, PluginContext, PluginRegistries } from "../../../src/plugins/types.ts";
import { TimerService } from "./timer.ts";
import { formatDuration, formatDurationShort, parseDurationInput } from "./format.ts";
import { registerTimeCommands } from "./cli/commands.ts";
import { TimeReportView } from "./ui/TimeReportView.tsx";
import { TimeLogSection } from "./ui/TimeLogSection.tsx";

let timer: TimerService | null = null;
let pluginCtx: PluginContext;

export function getTimer(): TimerService | null {
  return timer;
}

export function getPluginCtx(): PluginContext {
  return pluginCtx;
}

const plugin: TodoistPlugin = {
  name: "time-tracking",
  version: "1.0.0",
  description: "Track time spent on tasks",

  async onLoad(ctx: PluginContext) {
    pluginCtx = ctx;
    timer = new TimerService(ctx.storage);
    await timer.restoreState();
  },

  register({ hooks, views, extensions, palette }: PluginRegistries) {
    // ── Hooks ──

    hooks.on("task.completing", async (hookCtx) => {
      if (!timer) return;
      if (hookCtx.task && (timer.isRunningSync(hookCtx.task.id) || timer.isPausedSync(hookCtx.task.id))) {
        const elapsed = await timer.stop(hookCtx.task.id);
        return { message: `Timer stopped: ${formatDuration(elapsed)}` };
      }
    });

    hooks.on("task.deleting", async (hookCtx) => {
      if (!timer) return;
      if (hookCtx.task && (timer.isRunningSync(hookCtx.task.id) || timer.isPausedSync(hookCtx.task.id))) {
        await timer.stop(hookCtx.task.id);
      }
    });

    // ── Views ──

    views.addView({
      name: "time-report",
      label: "Time Report",
      component: TimeReportView,
      sidebar: { icon: "◷", section: "plugins" },
      shortcut: "T",
    });

    // ── Extensions ──

    extensions.addTaskColumn({
      id: "timer",
      label: "Time",
      width: 10,
      position: "after-priority",
      refreshInterval: 1000,
      render: (task) => {
        if (!timer) return "";
        if (timer.isRunningSync(task.id)) {
          return `▶${formatDuration(timer.getElapsedSync(task.id))}`;
        }
        if (timer.isPausedSync(task.id)) {
          return `⏸${formatDuration(timer.getElapsedSync(task.id))}`;
        }
        const total = timer.getTotalSync(task.id);
        if (total > 0) return formatDurationShort(total);
        return "";
      },
      color: (task) => {
        if (!timer) return "dim";
        if (timer.isRunningSync(task.id)) return "green";
        if (timer.isPausedSync(task.id)) return "yellow";
        return "dim";
      },
    });

    extensions.addStatusBarItem({
      id: "active-timer",
      refreshInterval: 1000,
      render: () => timer ? timer.getActiveFormatted() : "",
      color: () => {
        if (!timer) return "dim";
        if (timer.hasActiveTimer()) return "green";
        if (timer.hasPausedTimer()) return "yellow";
        return "dim";
      },
    });

    extensions.addDetailSection({
      id: "time-log",
      label: "Time Log",
      position: "after-comments",
      component: TimeLogSection,
    });

    extensions.addKeybinding({
      key: "ctrl+t",
      description: "Start/pause/stop timer",
      helpSection: "Time Tracking",
      action: async (_ctx, currentTask) => {
        if (!currentTask || !timer) return;
        if (timer.isRunningSync(currentTask.id)) {
          await timer.pause(currentTask.id);
          return { statusMessage: `Paused: ${formatDuration(timer.getElapsedSync(currentTask.id))}` };
        } else if (timer.isPausedSync(currentTask.id)) {
          const elapsed = await timer.stop(currentTask.id);
          return { statusMessage: `Stopped: ${formatDuration(elapsed)}` };
        } else {
          await timer.startTracking(currentTask.id);
          return { statusMessage: "Timer started" };
        }
      },
    });

    // ── Palette Commands ──

    palette.addCommands([
      {
        label: "Start Timer",
        category: "Time Tracking",
        shortcut: "ctrl+t",
        action: async (_ctx, task) => {
          if (task && timer) await timer.startTracking(task.id);
        },
      },
      {
        label: "Pause Timer",
        category: "Time Tracking",
        action: async (_ctx, task) => {
          if (task && timer) await timer.pause(task.id);
        },
      },
      {
        label: "Stop Timer",
        category: "Time Tracking",
        action: async () => {
          if (timer) await timer.stopActive();
        },
      },
      {
        label: "Add Time",
        category: "Time Tracking",
        inputPrompt: {
          label: "Duration",
          placeholder: "1h30m, 45m, 2h, 90",
          formatPreview: (value: string) => {
            if (!value.trim()) return "";
            const ms = parseDurationInput(value);
            if (ms <= 0) return "Invalid format (use: 1h30m, 45m, 2h, 90)";
            return `→ ${formatDurationShort(ms)}`;
          },
        },
        action: async (_ctx, task, _navigate, input) => {
          if (!task || !input || !timer) return;
          const ms = parseDurationInput(input);
          if (ms <= 0) return;
          await timer.addManualEntry(task.id, ms);
        },
      },
      {
        label: "Time Report",
        category: "Time Tracking",
        action: (_, __, navigate) => navigate("time-report"),
      },
    ]);
  },

  registerCommands(program, _ctx) {
    if (timer) registerTimeCommands(program, timer);
  },

  async onUnload() {
    if (timer) await timer.persistState();
  },
};

export default plugin;
