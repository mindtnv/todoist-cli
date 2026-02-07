import { useState, useEffect, useMemo, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PluginViewProps } from "../../../../src/plugins/types.ts";
import { getTimer } from "../index.ts";
import { formatDuration, formatDurationShort, formatDate } from "../format.ts";
import type { TimeEntry } from "../timer.ts";

export function TimeReportView({ onBack, tasks }: PluginViewProps) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("");
  const [scrollOffset, setScrollOffset] = useState(0);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up status message timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setScrollOffset(0);
    const timer = getTimer();
    timer.getAllEntries(days).then((e) => {
      if (!cancelled) {
        setEntries(e);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setEntries([]);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [days]);

  const taskNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) {
      map.set(t.id, t.content);
    }
    return map;
  }, [tasks]);

  // Group by date
  const byDate = useMemo(() => {
    const groups = new Map<string, { entries: TimeEntry[]; total: number }>();
    for (const entry of entries) {
      const date = formatDate(entry.start);
      const existing = groups.get(date) ?? { entries: [], total: 0 };
      existing.entries.push(entry);
      existing.total += entry.duration;
      groups.set(date, existing);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  const grandTotal = entries.reduce((s, e) => s + e.duration, 0);

  const termHeight = process.stdout.rows ?? 24;
  const viewportSize = Math.max(3, termHeight - 10);
  const maxScroll = Math.max(0, byDate.length - viewportSize);
  const visibleGroups = byDate.slice(scrollOffset, scrollOffset + viewportSize);

  useInput((input, key) => {
    if (input === "j" || key.downArrow) {
      setScrollOffset((o) => Math.min(o + 1, maxScroll));
      return;
    }
    if (input === "k" || key.upArrow) {
      setScrollOffset((o) => Math.max(0, o - 1));
      return;
    }
    if (key.ctrl && input === "d") {
      setScrollOffset((o) => Math.min(o + 10, maxScroll));
      return;
    }
    if (key.ctrl && input === "u") {
      setScrollOffset((o) => Math.max(0, o - 10));
      return;
    }
    if (input === "q" || key.escape) {
      onBack();
      return;
    }
    if (input === "7") setDays(7);
    if (input === "3") setDays(30);
    if (input === "1") setDays(1);
    if (input === "e" && entries.length > 0) {
      try {
        const exportDir = join(homedir(), ".config", "todoist-cli", "exports");
        mkdirSync(exportDir, { recursive: true });
        const dateStr = formatDate(Date.now());
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, "0")}${now.getMinutes().toString().padStart(2, "0")}${now.getSeconds().toString().padStart(2, "0")}`;
        const filePath = join(exportDir, `time-report-${dateStr}-${timeStr}.csv`);

        const csvLines = ["Date,Task ID,Task Name,Duration (minutes),Duration (formatted)"];
        for (const entry of entries) {
          const date = formatDate(entry.start);
          const name = (taskNameMap.get(entry.taskId) ?? entry.taskId)
            .replace(/"/g, '""')
            .replace(/[\r\n]+/g, " ");
          const minutes = Math.round(entry.duration / 60000);
          const formatted = formatDurationShort(entry.duration);
          csvLines.push(`${date},"${entry.taskId}","${name}",${minutes},"${formatted}"`);
        }
        writeFileSync(filePath, csvLines.join("\n") + "\n");
        setStatusMsg(`Exported to ${filePath}`);
      } catch (err) {
        setStatusMsg(`Export failed: ${err instanceof Error ? err.message : "unknown error"}`);
      }
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => setStatusMsg(""), 5000);
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="gray">Loading time report...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">Time Report — Last {days} days</Text>
        <Text bold color="white">Grand Total: {formatDuration(grandTotal)}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color="dim">
          [1] Today  [7] 7 days  [3] 30 days  [e] Export CSV  [j/k] Scroll  [q] Back
        </Text>
      </Box>

      {statusMsg !== "" && (
        <Box marginTop={1}>
          <Text color="green">{statusMsg}</Text>
        </Box>
      )}

      {entries.length === 0 ? (
        <Box marginTop={1}>
          <Text color="dim">No time entries found.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {visibleGroups.map(([date, { entries: dayEntries, total }]) => {
            const byTask = new Map<string, number>();
            for (const e of dayEntries) {
              byTask.set(e.taskId, (byTask.get(e.taskId) ?? 0) + e.duration);
            }
            const sortedTasks = [...byTask.entries()].sort((a, b) => b[1] - a[1]);
            const dayPct = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
            const dayPctColor = dayPct > 20 ? "green" : dayPct > 10 ? "yellow" : "dim";

            return (
              <Box key={date} flexDirection="column" marginTop={1}>
                <Box>
                  <Text bold color="yellow">{date}</Text>
                  <Text color="dim">{`  ${formatDurationShort(total)}`}</Text>
                  <Text color={dayPctColor}>{`  (${dayPct.toFixed(0)}%)`}</Text>
                </Box>
                {sortedTasks.map(([taskId, taskTotal]) => {
                  const name = taskNameMap.get(taskId) ?? taskId;
                  const truncated = name.length > 50 ? name.slice(0, 47) + "..." : name;
                  const pct = grandTotal > 0 ? (taskTotal / grandTotal) * 100 : 0;
                  const pctColor = pct > 20 ? "green" : pct > 10 ? "yellow" : "dim";
                  return (
                    <Box key={taskId} paddingLeft={2}>
                      <Text color="cyan">{formatDurationShort(taskTotal).padEnd(8)}</Text>
                      <Text>{truncated}</Text>
                      <Text color={pctColor}>{`  ${pct.toFixed(0)}%`}</Text>
                    </Box>
                  );
                })}
              </Box>
            );
          })}
          {byDate.length > viewportSize && (
            <Box marginTop={1}>
              <Text color="gray" dimColor>
                {scrollOffset + 1}-{Math.min(scrollOffset + viewportSize, byDate.length)}/{byDate.length} days  j/k scroll  Ctrl-d/u page
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
