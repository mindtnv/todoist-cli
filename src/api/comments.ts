import { api } from "./client.ts";
import type { Comment, CreateCommentParams, UpdateCommentParams } from "./types.ts";

export async function getComments(taskId: string): Promise<Comment[]> {
  return api.get<Comment[]>("/comments", { task_id: taskId });
}

export async function createComment(params: CreateCommentParams): Promise<Comment> {
  return api.post<Comment>("/comments", params as unknown as Record<string, unknown>);
}

export async function updateComment(id: string, params: UpdateCommentParams): Promise<Comment> {
  return api.post<Comment>(`/comments/${id}`, params as unknown as Record<string, unknown>);
}

export async function deleteComment(id: string): Promise<void> {
  await api.del(`/comments/${id}`);
}
