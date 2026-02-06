import { api } from "./client.ts";
import type { CompletedTask } from "./types.ts";

interface CompletedResponse {
  items: CompletedTask[];
  projects: Record<string, unknown>;
  sections: Record<string, unknown>;
}

export async function getCompletedTasks(since?: string): Promise<CompletedTask[]> {
  const params: Record<string, string> = {};
  if (since) params.since = since;
  const data = await api.get<CompletedResponse>("/tasks/completed", params);
  return data.items ?? [];
}
