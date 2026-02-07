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
import type { HookRegistry, HookEvent, HookContextMap, PluginApi, PluginPermission, GranularPermission } from "./types.ts";
import { PERMISSION_ALIASES } from "./types.ts";
import * as tasksApi from "../api/tasks.ts";
import * as projectsApi from "../api/projects.ts";
import * as labelsApi from "../api/labels.ts";
import * as sectionsApi from "../api/sections.ts";
import * as commentsApi from "../api/comments.ts";
import type { TaskFilter, CreateTaskParams, UpdateTaskParams } from "../api/types.ts";

/**
 * Expand a list of plugin permissions (which may include coarse aliases)
 * into a Set of granular permissions for fast lookup.
 */
function expandPermissions(perms: PluginPermission[]): Set<GranularPermission | "*"> {
  const expanded = new Set<GranularPermission | "*">();
  for (const perm of perms) {
    if (perm in PERMISSION_ALIASES) {
      for (const granular of PERMISSION_ALIASES[perm as keyof typeof PERMISSION_ALIASES]) {
        expanded.add(granular);
      }
      if (perm === "*") expanded.add("*");
    } else {
      // Already a granular permission
      expanded.add(perm as GranularPermission);
    }
  }
  return expanded;
}

export function createApiProxy(hooks: HookRegistry, permissions?: PluginPermission[]): PluginApi {
  // If no permissions specified, allow everything (backwards compatible)
  const expandedPerms = permissions ? expandPermissions(permissions) : null;

  /**
   * Check if the plugin has a specific granular permission.
   * Accepts both granular (e.g. "tasks.read") and coarse (e.g. "read") checks.
   * When checking a granular permission, also accepts if the plugin has the
   * corresponding coarse alias or "*".
   */
  const hasPermission = (perm: string): boolean => {
    if (!expandedPerms) return true; // No permissions declared = allow all
    if (expandedPerms.has("*")) return true;
    return expandedPerms.has(perm as GranularPermission);
  };

  function denyAction(perm: string, method: string): never {
    throw new Error(`Plugin does not have permission "${perm}" for: ${method}. Add "${perm}" to permissions in plugin.json.`);
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
      if (!hasPermission("tasks.read")) denyAction("tasks.read", "getTasks");
      return tasksApi.getTasks(filter);
    },
    getTask(id: string) {
      if (!hasPermission("tasks.read")) denyAction("tasks.read", "getTask");
      return tasksApi.getTask(id);
    },

    async createTask(params: CreateTaskParams) {
      if (!hasPermission("tasks.write")) denyAction("tasks.write", "createTask");
      await safeEmit("task.creating", { params });
      const task = await tasksApi.createTask(params);
      await safeEmit("task.created", { task });
      return task;
    },

    async updateTask(id: string, changes: UpdateTaskParams) {
      if (!hasPermission("tasks.write")) denyAction("tasks.write", "updateTask");
      const task = await tasksApi.getTask(id);
      await safeEmit("task.updating", { task, changes });
      const updated = await tasksApi.updateTask(id, changes);
      await safeEmit("task.updated", { task: updated, changes });
      return updated;
    },

    async closeTask(id: string) {
      if (!hasPermission("tasks.complete")) denyAction("tasks.complete", "closeTask");
      const task = await tasksApi.getTask(id);
      await safeEmit("task.completing", { task });
      await tasksApi.closeTask(id);
      await safeEmit("task.completed", { task });
    },

    async reopenTask(id: string) {
      if (!hasPermission("tasks.complete")) denyAction("tasks.complete", "reopenTask");
      await tasksApi.reopenTask(id);
    },

    async deleteTask(id: string) {
      if (!hasPermission("tasks.delete")) denyAction("tasks.delete", "deleteTask");
      const task = await tasksApi.getTask(id);
      await safeEmit("task.deleting", { task });
      await tasksApi.deleteTask(id);
      await safeEmit("task.deleted", { task });
    },

    getProjects() {
      if (!hasPermission("projects.read")) denyAction("projects.read", "getProjects");
      return projectsApi.getProjects();
    },
    getProject(id: string) {
      if (!hasPermission("projects.read")) denyAction("projects.read", "getProject");
      return projectsApi.getProject(id);
    },
    getLabels() {
      if (!hasPermission("labels.read")) denyAction("labels.read", "getLabels");
      return labelsApi.getLabels();
    },
    getLabel(id: string) {
      if (!hasPermission("labels.read")) denyAction("labels.read", "getLabel");
      return labelsApi.getLabel(id);
    },
    getSections(projectId?: string) {
      if (!hasPermission("sections.read")) denyAction("sections.read", "getSections");
      return sectionsApi.getSections(projectId);
    },
    getComments(taskId: string) {
      if (!hasPermission("comments.read")) denyAction("comments.read", "getComments");
      return commentsApi.getComments(taskId);
    },
  };
}
