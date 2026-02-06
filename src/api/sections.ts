import { api } from "./client.ts";
import type { Section, CreateSectionParams, UpdateSectionParams } from "./types.ts";

export async function getSections(projectId?: string): Promise<Section[]> {
  const params: Record<string, string> = {};
  if (projectId) params.project_id = projectId;
  return api.get<Section[]>("/sections", params);
}

export async function createSection(params: CreateSectionParams): Promise<Section> {
  return api.post<Section>("/sections", params as unknown as Record<string, unknown>);
}

export async function updateSection(id: string, params: UpdateSectionParams): Promise<Section> {
  return api.post<Section>(`/sections/${id}`, params as unknown as Record<string, unknown>);
}

export async function deleteSection(id: string): Promise<void> {
  await api.del(`/sections/${id}`);
}
