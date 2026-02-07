import { api } from "./client.ts";
import { requireToken } from "../config/index.ts";
import type { UserStats, DayStats, WeekStats } from "./types.ts";

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
  const syncRes = await fetch("https://api.todoist.com/sync/v9/sync", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireToken()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      resource_types: JSON.stringify(["stats"]),
      sync_token: "*",
    }),
  });
  if (!syncRes.ok) throw new Error(`Sync API error: ${syncRes.status}`);
  const syncData = (await syncRes.json()) as SyncStatsResponse;

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
