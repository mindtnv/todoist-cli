import { api } from "./client.ts";
import type { ActivityEvent } from "./types.ts";

export async function getActivity(limit?: number): Promise<ActivityEvent[]> {
  const params: Record<string, string> = {};
  if (limit) params.limit = String(limit);
  return api.get<ActivityEvent[]>("/activities", params);
}
