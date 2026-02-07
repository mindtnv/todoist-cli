import { createCrudModule } from "./crud.ts";
import type { Label, CreateLabelParams, UpdateLabelParams } from "./types.ts";

const crud = createCrudModule<Label, CreateLabelParams, UpdateLabelParams>("/labels");

export const getLabels = crud.getAll;
export const getLabel = crud.getOne;
export const createLabel = crud.create;
export const updateLabel = crud.update;
export const deleteLabel = crud.remove;
