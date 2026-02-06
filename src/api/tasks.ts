import { api } from "./client.ts";
import type { Task, TaskFilter, CreateTaskParams, UpdateTaskParams } from "./types.ts";

export async function getTasks(filter?: TaskFilter): Promise<Task[]> {
  const params: Record<string, string> = {};
  if (filter?.project_id) params.project_id = filter.project_id;
  if (filter?.label) params.label = filter.label;
  if (filter?.filter) params.filter = filter.filter;
  return api.get<Task[]>("/tasks", params);
}

export async function getTask(id: string): Promise<Task> {
  return api.get<Task>(`/tasks/${id}`);
}

export async function createTask(params: CreateTaskParams): Promise<Task> {
  return api.post<Task>("/tasks", params as unknown as Record<string, unknown>);
}

export async function updateTask(id: string, params: UpdateTaskParams): Promise<Task> {
  return api.post<Task>(`/tasks/${id}`, params as unknown as Record<string, unknown>);
}

export async function closeTask(id: string): Promise<void> {
  await api.post<void>(`/tasks/${id}/close`);
}

export async function reopenTask(id: string): Promise<void> {
  await api.post<void>(`/tasks/${id}/reopen`);
}

export async function deleteTask(id: string): Promise<void> {
  await api.del(`/tasks/${id}`);
}
