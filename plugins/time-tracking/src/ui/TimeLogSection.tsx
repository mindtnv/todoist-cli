import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { Task } from "../../../../src/api/types.ts";
import type { PluginContext } from "../../../../src/plugins/types.ts";
import { getTimer } from "../index.ts";
import { formatDuration, formatDate } from "../format.ts";
import type { TimeEntry } from "../timer.ts";

interface TimeLogSectionProps {
  task: Task;
  ctx: PluginContext;
}

export function TimeLogSection({ task, ctx: _ctx }: TimeLogSectionProps) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [_tick, setTick] = useState(0);

  const timer = getTimer();

  const isActive = timer ? (timer.isRunningSync(task.id) || timer.isPausedSync(task.id)) : false;
  const isRunning = timer ? timer.isRunningSync(task.id) : false;
  const isPaused = timer ? timer.isPausedSync(task.id) : false;

  // Initial load
  useEffect(() => {
    if (!timer) return;
    let cancelled = false;
    timer.getEntries(task.id).then((e) => {
      if (!cancelled) {
        setEntries(e);
        setTotal(e.reduce((s, entry) => s + entry.duration, 0));
      }
    }).catch((err) => {
      console.error("TimeLogSection: failed to load entries", err);
    });
    return () => { cancelled = true; };
  }, [task.id]);

  // Live tick every 1s when timer is active
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  // Re-fetch entries every 5s when timer is active
  useEffect(() => {
    if (!isActive || !timer) return;
    let cancelled = false;
    const interval = setInterval(() => {
      timer.getEntries(task.id).then((e) => {
        if (!cancelled) {
          setEntries(e);
          setTotal(e.reduce((s, entry) => s + entry.duration, 0));
        }
      });
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isActive, task.id]);

  const liveElapsed = (isActive && timer) ? timer.getElapsedSync(task.id) : 0;

  if (!timer) {
    return (
      <Box>
        <Text color="dim">Plugin not initialized</Text>
      </Box>
    );
  }

  if (entries.length === 0 && !isActive) {
    return (
      <Box>
        <Text color="dim">No time tracked</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {isRunning && (
        <Text color="green">{"▶ Running: "}{formatDuration(liveElapsed)}</Text>
      )}
      {isPaused && (
        <Text color="yellow">{"⏸ Paused: "}{formatDuration(liveElapsed)}</Text>
      )}
      <Text color="dim">Total: {formatDuration(total)}</Text>
      {entries.slice(-5).map((entry, i) => {
        const date = formatDate(entry.start);
        const dur = formatDuration(entry.duration);
        return (
          <Box key={i} paddingLeft={1}>
            <Text color="dim">{date}</Text>
            <Text color="cyan">{`  ${dur}`}</Text>
          </Box>
        );
      })}
      {entries.length > 5 && (
        <Box paddingLeft={1}>
          <Text color="dim">... and {entries.length - 5} more entries</Text>
        </Box>
      )}
    </Box>
  );
}
