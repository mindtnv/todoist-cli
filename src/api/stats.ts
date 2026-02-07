import { api } from "./client.ts";
import type { UserStats, DayStats, WeekStats } from "./types.ts";

const SYNC_API_BASE = "https://api.todoist.com/sync/v9";

interface UserResponse {
  karma: number;
  karma_trend: string;
  completed_today: number;
  completed_count: number;
}

interface SyncStatsResponse {
  stats?: {
    completed_count: number;
    days_items: Array<{ date: string; total_completed: number }>;
    week_items: Array<{ from: string; to: string; total_completed: number }>;
  };
}

export async function getStats(): Promise<UserStats> {
  const syncData = await api.postForm<SyncStatsResponse>(
    "/sync",
    new URLSearchParams({
      resource_types: JSON.stringify(["stats"]),
      sync_token: "*",
    }),
    SYNC_API_BASE,
  );

  const user = await api.get<UserResponse>("/user");

  const stats = syncData.stats;

  return {
    completed_count: user.completed_count,
    karma: user.karma,
    karma_trend: user.karma_trend,
    completed_today: user.completed_today,
    days_items: (stats?.days_items ?? []) as DayStats[],
    week_items: (stats?.week_items ?? []) as WeekStats[],
  };
}
