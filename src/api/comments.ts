import { createCrudModule } from "./crud.ts";
import type { Comment, CreateCommentParams, UpdateCommentParams } from "./types.ts";

const crud = createCrudModule<Comment, CreateCommentParams, UpdateCommentParams>("/comments");

export function getComments(taskId: string): Promise<Comment[]> {
  return crud.getAll({ task_id: taskId });
}

export const getComment = crud.getOne;
export const createComment = crud.create;
export const updateComment = crud.update;
export const deleteComment = crud.remove;
