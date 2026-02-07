import { api, stripUndefined } from "./client.ts";
import type { Label, CreateLabelParams, UpdateLabelParams } from "./types.ts";

export async function getLabels(): Promise<Label[]> {
  return api.get<Label[]>("/labels");
}

export async function getLabel(id: string): Promise<Label> {
  return api.get<Label>(`/labels/${id}`);
}

export async function createLabel(params: CreateLabelParams): Promise<Label> {
  return api.post<Label>("/labels", stripUndefined(params as unknown as Record<string, unknown>));
}

export async function updateLabel(id: string, params: UpdateLabelParams): Promise<Label> {
  return api.patch<Label>(`/labels/${id}`, stripUndefined(params as Record<string, unknown>));
}

export async function deleteLabel(id: string): Promise<void> {
  await api.del(`/labels/${id}`);
}
