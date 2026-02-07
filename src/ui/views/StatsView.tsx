import { Box, Text } from "ink";
import { getStats } from "../../api/stats.ts";
import { useAsyncData } from "../hooks/useAsyncData.ts";
import { ViewShell } from "../components/ViewShell.tsx";

interface StatsViewProps {
  onBack: () => void;
}

function formatKarma(karma: number): string {
  return karma.toLocaleString();
}

function trendArrow(trend: string): string {
  if (trend === "up") return " \u2191";
  if (trend === "down") return " \u2193";
  return "";
}

function trendColor(trend: string): string {
  if (trend === "up") return "green";
  if (trend === "down") return "red";
  return "gray";
}

function renderBar(value: number, maxValue: number, maxWidth: number): string {
  if (maxValue === 0) return "";
  const width = Math.round((value / maxValue) * maxWidth);
  return "\u2588".repeat(Math.max(width, value > 0 ? 1 : 0));
}

function formatDayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[date.getDay()] ?? dateStr.slice(5);
}

function formatWeekLabel(fromStr: string): string {
  const date = new Date(fromStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()] ?? "";
  const day = String(date.getDate()).padStart(2, "0");
  return `${month} ${day}`;
}

export function StatsView({ onBack }: StatsViewProps) {
  const { data: stats, loading, error } = useAsyncData(() => getStats());

  if (loading || error || !stats) {
    return (
      <ViewShell title="Productivity Stats" onBack={onBack} loading={loading} error={error ?? (!loading ? "No data" : null)}>
        <></>
      </ViewShell>
    );
  }

  const recentDays = stats.days_items.slice(-7);
  const maxDayValue = Math.max(...recentDays.map((d) => d.total_completed), 1);
  const termCols = process.stdout.columns ?? 80;
  // Reserve space for borders, padding, label (~10), value (~5)
  const barMaxWidth = Math.max(10, termCols - 30);

  const recentWeeks = stats.week_items.slice(-4);
  const maxWeekValue = Math.max(...recentWeeks.map((w) => w.total_completed), 1);

  return (
    <ViewShell title="Productivity Stats" onBack={onBack}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Productivity Stats</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          Karma: <Text bold>{formatKarma(stats.karma)}</Text>
          <Text color={trendColor(stats.karma_trend)}>{trendArrow(stats.karma_trend)}</Text>
        </Text>
        <Text>   Completed today: </Text>
        <Text bold color="green">{stats.completed_today}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          Total completed: <Text bold>{stats.completed_count.toLocaleString()}</Text>
        </Text>
      </Box>

      {recentDays.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="yellow">Daily (last 7 days):</Text>
          {recentDays.map((day) => (
            <Box key={day.date}>
              <Text color="gray">{`  ${formatDayLabel(day.date).padEnd(5)}`}</Text>
              <Text color="green">{renderBar(day.total_completed, maxDayValue, barMaxWidth)}</Text>
              <Text color="gray">{`  ${day.total_completed}`}</Text>
            </Box>
          ))}
        </Box>
      )}

      {recentWeeks.length > 0 && (
        <Box flexDirection="column">
          <Text bold color="yellow">Weekly:</Text>
          {recentWeeks.map((week) => (
            <Box key={week.from}>
              <Text color="gray">{`  ${formatWeekLabel(week.from).padEnd(7)}`}</Text>
              <Text color="blue">{renderBar(week.total_completed, maxWeekValue, barMaxWidth)}</Text>
              <Text color="gray">{`  ${week.total_completed}`}</Text>
            </Box>
          ))}
        </Box>
      )}

      {recentDays.length === 0 && recentWeeks.length === 0 && (
        <Box marginTop={1}>
          <Text color="gray">No activity data available</Text>
        </Box>
      )}
    </ViewShell>
  );
}
