import { createCrudModule } from "./crud.ts";
import type { Section, CreateSectionParams, UpdateSectionParams } from "./types.ts";

const crud = createCrudModule<Section, CreateSectionParams, UpdateSectionParams>("/sections");

export function getSections(projectId?: string): Promise<Section[]> {
  const params: Record<string, string> = {};
  if (projectId) params.project_id = projectId;
  return crud.getAll(params);
}

export const getSection = crud.getOne;
export const createSection = crud.create;
export const updateSection = crud.update;
export const deleteSection = crud.remove;
