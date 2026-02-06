import { api } from "./client.ts";
import type { Label, CreateLabelParams, UpdateLabelParams } from "./types.ts";

export async function getLabels(): Promise<Label[]> {
  return api.get<Label[]>("/labels");
}

export async function createLabel(params: CreateLabelParams): Promise<Label> {
  return api.post<Label>("/labels", params as unknown as Record<string, unknown>);
}

export async function updateLabel(id: string, params: UpdateLabelParams): Promise<Label> {
  return api.post<Label>(`/labels/${id}`, params as unknown as Record<string, unknown>);
}

export async function deleteLabel(id: string): Promise<void> {
  await api.del(`/labels/${id}`);
}
