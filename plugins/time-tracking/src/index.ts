import type { TodoistPlugin, PluginContext } from "../../../src/plugins/types.ts";
import { TimerService } from "./timer.ts";
import { formatDuration, formatDurationShort, parseDurationInput } from "./format.ts";
import { registerTimeCommands } from "./cli/commands.ts";
import { TimeReportView } from "./ui/TimeReportView.tsx";
import { TimeLogSection } from "./ui/TimeLogSection.tsx";

let timer: TimerService;
let pluginCtx: PluginContext;

export function getTimer(): TimerService {
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

  registerHooks(hooks) {
    // Auto-stop timer when task is completed (running or paused)
    hooks.on("task.completing", async (hookCtx) => {
      if (hookCtx.task && (timer.isRunningSync(hookCtx.task.id) || timer.isPausedSync(hookCtx.task.id))) {
        const elapsed = await timer.stop(hookCtx.task.id);
        return { message: `Timer stopped: ${formatDuration(elapsed)}` };
      }
    });

    // Auto-stop timer when task is deleted (running or paused)
    hooks.on("task.deleting", async (hookCtx) => {
      if (hookCtx.task && (timer.isRunningSync(hookCtx.task.id) || timer.isPausedSync(hookCtx.task.id))) {
        await timer.stop(hookCtx.task.id);
      }
    });
  },

  registerExtensions(ext) {
    // Timer column in TaskRow
    ext.addTaskColumn({
      id: "timer",
      label: "Time",
      width: 10,
      position: "after-priority",
      refreshInterval: 1000,
      render: (task) => {
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
        if (timer.isRunningSync(task.id)) return "green";
        if (timer.isPausedSync(task.id)) return "yellow";
        return "dim";
      },
    });

    // Status bar item showing active timer
    ext.addStatusBarItem({
      id: "active-timer",
      refreshInterval: 1000,
      render: () => timer.getActiveFormatted(),
      color: () => {
        if (timer.hasActiveTimer()) return "green";
        if (timer.hasPausedTimer()) return "yellow";
        return "dim";
      },
    });

    // Time log section in task detail view
    ext.addDetailSection({
      id: "time-log",
      label: "Time Log",
      position: "after-comments",
      component: TimeLogSection,
    });

    // Ctrl+T keybinding to cycle timer: stopped -> start, running -> pause, paused -> stop
    ext.addKeybinding({
      key: "ctrl+t",
      description: "Start/pause/stop timer",
      helpSection: "Time Tracking",
      action: async (_ctx, currentTask) => {
        if (!currentTask) return;
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
  },

  registerCommands(program, _ctx) {
    registerTimeCommands(program, timer);
  },

  registerViews(registry) {
    registry.addView({
      name: "time-report",
      label: "Time Report",
      component: TimeReportView,
      sidebar: { icon: "◷", section: "plugins" },
      shortcut: "T",
    });
  },

  registerPaletteCommands(palette) {
    palette.addCommands([
      {
        label: "Start Timer",
        category: "Time Tracking",
        shortcut: "ctrl+t",
        action: async (_ctx, task) => {
          if (task) await timer.startTracking(task.id);
        },
      },
      {
        label: "Pause Timer",
        category: "Time Tracking",
        action: async (_ctx, task) => {
          if (task) await timer.pause(task.id);
        },
      },
      {
        label: "Stop Timer",
        category: "Time Tracking",
        action: async () => {
          await timer.stopActive();
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
          if (!task || !input) return;
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

  async onUnload() {
    await timer.persistState();
  },
};

export default plugin;
