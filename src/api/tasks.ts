import { api } from "./client.ts";
import { createCrudModule } from "./crud.ts";
import type { Task, TaskFilter, CreateTaskParams, UpdateTaskParams } from "./types.ts";

const crud = createCrudModule<Task, CreateTaskParams, UpdateTaskParams>("/tasks");

export function getTasks(filter?: TaskFilter): Promise<Task[]> {
  const params: Record<string, string> = {};
  if (filter?.project_id) params.project_id = filter.project_id;
  if (filter?.label) params.label = filter.label;
  if (filter?.filter) params.filter = filter.filter;
  return crud.getAll(params);
}

export const getTask = crud.getOne;
export const createTask = crud.create;
export const updateTask = crud.update;
export const deleteTask = crud.remove;

export async function closeTask(id: string): Promise<void> {
  await api.post<void>(`/tasks/${id}/close`);
}

export async function reopenTask(id: string): Promise<void> {
  await api.post<void>(`/tasks/${id}/reopen`);
}
