import { useState, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { getActivity } from "../../api/activity.ts";
import type { ActivityEvent } from "../../api/types.ts";

interface ActivityViewProps {
  onBack: () => void;
}

function eventColor(eventType: string): string {
  if (eventType === "completed") return "green";
  if (eventType === "added" || eventType === "created") return "blue";
  if (eventType === "updated") return "cyan";
  if (eventType === "deleted") return "red";
  if (eventType === "uncompleted") return "blue";
  if (eventType === "archived") return "gray";
  if (eventType === "unarchived") return "white";
  if (eventType === "shared") return "magenta";
  return "white";
}

const eventLabels: Record<string, string> = {
  completed: "Completed",
  added: "Added",
  created: "Added",
  updated: "Updated",
  deleted: "Deleted",
  uncompleted: "Reopened",
  archived: "Archived",
  unarchived: "Unarchived",
  shared: "Shared",
};

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  const time = `${h}:${minutes} ${ampm}`;

  if (d.toDateString() === today.toDateString()) return time;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()} ${time}`;
}

function eventDescription(event: ActivityEvent): string {
  const extra = event.extra_data;
  if (extra && typeof extra.content === "string") {
    return extra.content;
  }
  if (extra && typeof extra.name === "string") {
    return extra.name;
  }
  return `${event.object_type} #${event.object_id}`;
}

export function ActivityView({ onBack }: ActivityViewProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const { stdout } = useStdout();

  useEffect(() => {
    let cancelled = false;
    getActivity(50)
      .then((items) => {
        if (!cancelled) {
          setEvents(items);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load activity");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const viewHeight = Math.max((stdout?.rows ?? 24) - 8, 5);
  const maxScroll = Math.max(0, events.length - viewHeight);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onBack();
      return;
    }
    if (input === "j" || key.downArrow) {
      setScrollOffset((s) => Math.min(s + 1, maxScroll));
      return;
    }
    if (input === "k" || key.upArrow) {
      setScrollOffset((s) => Math.max(s - 1, 0));
      return;
    }
    if (key.ctrl && input === "d") {
      setScrollOffset((s) => Math.min(s + Math.floor(viewHeight / 2), maxScroll));
      return;
    }
    if (key.ctrl && input === "u") {
      setScrollOffset((s) => Math.max(s - Math.floor(viewHeight / 2), 0));
      return;
    }
    if (input === "G") {
      setScrollOffset(maxScroll);
      return;
    }
    if (input === "g") {
      setScrollOffset(0);
      return;
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="cyan">Activity Log</Text>
          <Box marginTop={1}>
            <Text color="gray">Loading...</Text>
          </Box>
        </Box>
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="cyan">Activity Log</Text>
          <Box marginTop={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        </Box>
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Box>
      </Box>
    );
  }

  if (events.length === 0) {
    return (
      <Box flexDirection="column" width="100%" height="100%">
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
          <Text bold color="cyan">Activity Log</Text>
          <Box marginTop={1}>
            <Text color="gray">No activity found</Text>
          </Box>
        </Box>
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Box>
      </Box>
    );
  }

  const visibleEvents = events.slice(scrollOffset, scrollOffset + viewHeight);

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">Activity Log</Text>
          <Text color="gray">{`  (${events.length} events)`}</Text>
        </Box>

        <Box flexDirection="column">
          {visibleEvents.map((event, i) => (
            <Box key={`${event.id}-${i}`}>
              <Box width={18}>
                <Text color="gray">{formatTimestamp(event.event_date)}</Text>
              </Box>
              <Box width={12}>
                <Text color={eventColor(event.event_type)} bold>
                  {eventLabels[event.event_type] ?? event.event_type}
                </Text>
              </Box>
              <Text>{eventDescription(event)}</Text>
            </Box>
          ))}
        </Box>
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
        <Text>
          <Text color="gray">[j/k]</Text><Text> scroll  </Text>
          <Text color="gray">[Esc]</Text><Text> back</Text>
        </Text>
        {maxScroll > 0 && (
          <Text color="gray" dimColor>
            {`${scrollOffset + 1}-${Math.min(scrollOffset + viewHeight, events.length)}/${events.length}`}
          </Text>
        )}
      </Box>
    </Box>
  );
}
