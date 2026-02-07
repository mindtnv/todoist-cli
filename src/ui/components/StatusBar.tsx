import React, { useState, useEffect, useRef } from "react";
import { Box, Text } from "ink";
import type { StatusBarItemDefinition, PluginContext } from "../../plugins/types.ts";

interface StatusBarProps {
  items: StatusBarItemDefinition[];
  contextMap: Map<string, PluginContext>;
}

export function StatusBar({ items, contextMap }: StatusBarProps) {
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (items.length === 0) return;

    const intervals = items
      .map((item) => item.refreshInterval)
      .filter((v): v is number => typeof v === "number" && v > 0);

    if (intervals.length === 0) return;

    // Reset tick to prevent unbounded growth over long sessions
    setTick(0);

    const minInterval = Math.min(...intervals);
    intervalRef.current = setInterval(() => {
      // Use modular increment to avoid Number.MAX_SAFE_INTEGER overflow in very long sessions
      setTick((t) => (t + 1) % 1_000_000);
    }, minInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [items]);

  if (items.length === 0) return null;

  const rendered = items
    .map((item) => {
      const ctx = contextMap.get(item.id);
      if (!ctx) return null;
      const text = item.render(ctx);
      if (!text) return null;
      const color = item.color ? item.color(ctx) : undefined;
      return { id: item.id, text, color };
    })
    .filter(Boolean) as { id: string; text: string; color: string | undefined }[];

  if (rendered.length === 0) return null;

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Box gap={1}>
        {rendered.map((item, i) => (
          <React.Fragment key={item.id}>
            {i > 0 && <Text color="gray" dimColor>{"\u2502"}</Text>}
            <Text color={item.color}>{item.text}</Text>
          </React.Fragment>
        ))}
      </Box>
    </Box>
  );
}
