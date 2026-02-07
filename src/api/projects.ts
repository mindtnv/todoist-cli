import { api, stripUndefined } from "./client.ts";
import type { Project, CreateProjectParams, UpdateProjectParams } from "./types.ts";

export async function getProjects(): Promise<Project[]> {
  return api.get<Project[]>("/projects");
}

export async function getProject(id: string): Promise<Project> {
  return api.get<Project>(`/projects/${id}`);
}

export async function createProject(params: CreateProjectParams): Promise<Project> {
  return api.post<Project>("/projects", stripUndefined(params as unknown as Record<string, unknown>));
}

export async function updateProject(id: string, params: UpdateProjectParams): Promise<Project> {
  return api.patch<Project>(`/projects/${id}`, stripUndefined(params as Record<string, unknown>));
}

export async function deleteProject(id: string): Promise<void> {
  await api.del(`/projects/${id}`);
}
