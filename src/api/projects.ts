import { createCrudModule } from "./crud.ts";
import type { Project, CreateProjectParams, UpdateProjectParams } from "./types.ts";

const crud = createCrudModule<Project, CreateProjectParams, UpdateProjectParams>("/projects");

export const getProjects = crud.getAll;
export const getProject = crud.getOne;
export const createProject = crud.create;
export const updateProject = crud.update;
export const deleteProject = crud.remove;
