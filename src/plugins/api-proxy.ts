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

export function createApiProxy(hooks: HookRegistry, permissions?: string[]): PluginApi {
  // If no permissions specified, allow everything (backwards compatible)
  const hasPermission = (perm: string) => !permissions || permissions.includes(perm) || permissions.includes("*");

  function denyAction(method: string): never {
    throw new Error(`Plugin does not have permission for: ${method}. Add "${method.split('.')[0]}" to permissions in plugin.json.`);
  }

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
    getTasks(filter?: TaskFilter) {
      if (!hasPermission("read")) denyAction("read.getTasks");
      return tasksApi.getTasks(filter);
    },
    getTask(id: string) {
      if (!hasPermission("read")) denyAction("read.getTask");
      return tasksApi.getTask(id);
    },

    async createTask(params: CreateTaskParams) {
      if (!hasPermission("write")) denyAction("write.createTask");
      await safeEmit("task.creating", { params });
      const task = await tasksApi.createTask(params);
      await safeEmit("task.created", { task });
      return task;
    },

    async updateTask(id: string, changes: UpdateTaskParams) {
      if (!hasPermission("write")) denyAction("write.updateTask");
      const task = await tasksApi.getTask(id);
      await safeEmit("task.updating", { task, changes });
      const updated = await tasksApi.updateTask(id, changes);
      await safeEmit("task.updated", { task: updated, changes });
      return updated;
    },

    async closeTask(id: string) {
      if (!hasPermission("complete")) denyAction("complete.closeTask");
      const task = await tasksApi.getTask(id);
      await safeEmit("task.completing", { task });
      await tasksApi.closeTask(id);
      await safeEmit("task.completed", { task });
    },

    async reopenTask(id: string) {
      if (!hasPermission("complete")) denyAction("complete.reopenTask");
      await tasksApi.reopenTask(id);
    },

    async deleteTask(id: string) {
      if (!hasPermission("delete")) denyAction("delete.deleteTask");
      const task = await tasksApi.getTask(id);
      await safeEmit("task.deleting", { task });
      await tasksApi.deleteTask(id);
      await safeEmit("task.deleted", { task });
    },

    getProjects() {
      if (!hasPermission("read")) denyAction("read.getProjects");
      return projectsApi.getProjects();
    },
    getProject(id: string) {
      if (!hasPermission("read")) denyAction("read.getProject");
      return projectsApi.getProject(id);
    },
    getLabels() {
      if (!hasPermission("read")) denyAction("read.getLabels");
      return labelsApi.getLabels();
    },
    getLabel(id: string) {
      if (!hasPermission("read")) denyAction("read.getLabel");
      return labelsApi.getLabel(id);
    },
    getSections(projectId?: string) {
      if (!hasPermission("read")) denyAction("read.getSections");
      return sectionsApi.getSections(projectId);
    },
    getComments(taskId: string) {
      if (!hasPermission("read")) denyAction("read.getComments");
      return commentsApi.getComments(taskId);
    },
  };
}
