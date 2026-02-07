/**
 * API proxy that wraps task operations with hook emissions.
 *
 * - "before" hooks (task.creating, task.completing, task.updating, task.deleting)
 *   fire before the API call. These are observe-only and cannot modify params.
 * - "after" hooks (task.created, task.completed, task.updated, task.deleted)
 *   fire after the API call succeeds.
 * - Hook errors are caught by the HookRegistry and do not affect the API operation.
 * - Read operations (getTasks, getTask, getProjects, getLabels, getSections,
 *   getComments) pass through directly to the underlying API without hooks.
 */
import type { HookRegistry, HookEvent, HookContextMap, PluginApi } from "./types.ts";
import * as tasksApi from "../api/tasks.ts";
import * as projectsApi from "../api/projects.ts";
import * as labelsApi from "../api/labels.ts";
import * as sectionsApi from "../api/sections.ts";
import * as commentsApi from "../api/comments.ts";
import type { TaskFilter, CreateTaskParams, UpdateTaskParams } from "../api/types.ts";

export function createApiProxy(hooks: HookRegistry): PluginApi {
  let emitting = false;

  async function safeEmit<E extends HookEvent>(event: E, ctx: HookContextMap[E]): Promise<string[]> {
    if (emitting) return [];
    emitting = true;
    try {
      return await hooks.emit(event, ctx);
    } finally {
      emitting = false;
    }
  }

  return {
    getTasks: (filter?: TaskFilter) => tasksApi.getTasks(filter),
    getTask: (id: string) => tasksApi.getTask(id),

    async createTask(params: CreateTaskParams) {
      await safeEmit("task.creating", { params });
      const task = await tasksApi.createTask(params);
      await safeEmit("task.created", { task });
      return task;
    },

    async updateTask(id: string, changes: UpdateTaskParams) {
      const task = await tasksApi.getTask(id);
      await safeEmit("task.updating", { task, changes });
      const updated = await tasksApi.updateTask(id, changes);
      await safeEmit("task.updated", { task: updated, changes });
      return updated;
    },

    async closeTask(id: string) {
      const task = await tasksApi.getTask(id);
      await safeEmit("task.completing", { task });
      await tasksApi.closeTask(id);
      await safeEmit("task.completed", { task });
    },

    async reopenTask(id: string) {
      await tasksApi.reopenTask(id);
    },

    async deleteTask(id: string) {
      const task = await tasksApi.getTask(id);
      await safeEmit("task.deleting", { task });
      await tasksApi.deleteTask(id);
      await safeEmit("task.deleted", { task });
    },

    getProjects: () => projectsApi.getProjects(),
    getProject: (id: string) => projectsApi.getProject(id),
    getLabels: () => labelsApi.getLabels(),
    async getLabel(id: string) {
      const labels = await labelsApi.getLabels();
      const label = labels.find((l) => l.id === id);
      if (!label) throw new Error(`Label not found: ${id}`);
      return label;
    },
    getSections: (projectId?: string) => sectionsApi.getSections(projectId),
    getComments: (taskId: string) => commentsApi.getComments(taskId),
  };
}
