/**
 * API proxy that wraps resource operations with hook emissions.
 *
 * - "before" hooks (*.creating, *.completing, *.updating, *.deleting)
 *   fire before the API call. They support waterfall parameter modification
 *   and cancellation via `{ cancel: true, reason? }`.
 * - "after" hooks (*.created, *.completed, *.updated, *.deleted)
 *   fire after the API call succeeds.
 * - Hook errors are caught by the HookRegistry and do not affect the API operation.
 * - Read operations pass through directly to the underlying API without hooks.
 */
import type { HookRegistry, HookEvent, HookContextMap, PluginApi, PluginPermission, GranularPermission, EmitResult } from "./types.ts";
import { PERMISSION_ALIASES } from "./types.ts";
import * as tasksApi from "../api/tasks.ts";
import * as projectsApi from "../api/projects.ts";
import * as labelsApi from "../api/labels.ts";
import * as sectionsApi from "../api/sections.ts";
import * as commentsApi from "../api/comments.ts";
import type {
  TaskFilter,
  CreateTaskParams, UpdateTaskParams,
  CreateProjectParams, UpdateProjectParams,
  CreateLabelParams, UpdateLabelParams,
  CreateSectionParams, UpdateSectionParams,
  CreateCommentParams, UpdateCommentParams,
} from "../api/types.ts";

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

  async function safeEmit<E extends HookEvent>(event: E, ctx: HookContextMap[E]): Promise<EmitResult> {
    if (emitting) return { messages: [] };
    emitting = true;
    try {
      return await hooks.emit(event, ctx);
    } finally {
      emitting = false;
    }
  }

  /**
   * Check an EmitResult from a "before" hook and throw if the operation was cancelled.
   */
  function checkCancellation(result: EmitResult, operationName: string): void {
    if (result.cancelled) {
      const reason = result.reason ? `: ${result.reason}` : "";
      throw new Error(`Operation cancelled by plugin${reason} (${operationName})`);
    }
  }

  return {
    // ── Task read operations (no hooks) ──

    getTasks(filter?: TaskFilter) {
      if (!hasPermission("tasks.read")) denyAction("tasks.read", "getTasks");
      return tasksApi.getTasks(filter);
    },
    getTask(id: string) {
      if (!hasPermission("tasks.read")) denyAction("tasks.read", "getTask");
      return tasksApi.getTask(id);
    },

    // ── Task write operations ──

    async createTask(params: CreateTaskParams) {
      if (!hasPermission("tasks.write")) denyAction("tasks.write", "createTask");
      const result = await safeEmit("task.creating", { params });
      checkCancellation(result, "createTask");
      // Use potentially-modified params from the waterfall
      const finalParams = (result.params ?? params) as CreateTaskParams;
      const task = await tasksApi.createTask(finalParams);
      await safeEmit("task.created", { task });
      return task;
    },

    async updateTask(id: string, changes: UpdateTaskParams) {
      if (!hasPermission("tasks.write")) denyAction("tasks.write", "updateTask");
      const task = await tasksApi.getTask(id);
      const result = await safeEmit("task.updating", { task, changes });
      checkCancellation(result, "updateTask");
      const updated = await tasksApi.updateTask(id, changes);
      await safeEmit("task.updated", { task: updated, changes });
      return updated;
    },

    async closeTask(id: string) {
      if (!hasPermission("tasks.complete")) denyAction("tasks.complete", "closeTask");
      const task = await tasksApi.getTask(id);
      const result = await safeEmit("task.completing", { task });
      checkCancellation(result, "closeTask");
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
      const result = await safeEmit("task.deleting", { task });
      checkCancellation(result, "deleteTask");
      await tasksApi.deleteTask(id);
      await safeEmit("task.deleted", { task });
    },

    // ── Project read operations (no hooks) ──

    getProjects() {
      if (!hasPermission("projects.read")) denyAction("projects.read", "getProjects");
      return projectsApi.getProjects();
    },
    getProject(id: string) {
      if (!hasPermission("projects.read")) denyAction("projects.read", "getProject");
      return projectsApi.getProject(id);
    },

    // ── Project write operations ──

    async createProject(params: CreateProjectParams) {
      if (!hasPermission("projects.write")) denyAction("projects.write", "createProject");
      const result = await safeEmit("project.creating", { params });
      checkCancellation(result, "createProject");
      const finalParams = (result.params ?? params) as CreateProjectParams;
      const project = await projectsApi.createProject(finalParams);
      await safeEmit("project.created", { project });
      return project;
    },

    async updateProject(id: string, params: UpdateProjectParams) {
      if (!hasPermission("projects.write")) denyAction("projects.write", "updateProject");
      const project = await projectsApi.getProject(id);
      const result = await safeEmit("project.updating", { project, changes: params });
      checkCancellation(result, "updateProject");
      const updated = await projectsApi.updateProject(id, params);
      await safeEmit("project.updated", { project: updated, changes: params });
      return updated;
    },

    async deleteProject(id: string) {
      if (!hasPermission("projects.write")) denyAction("projects.write", "deleteProject");
      const project = await projectsApi.getProject(id);
      const result = await safeEmit("project.deleting", { project });
      checkCancellation(result, "deleteProject");
      await projectsApi.deleteProject(id);
      await safeEmit("project.deleted", { project });
    },

    // ── Label read operations (no hooks) ──

    getLabels() {
      if (!hasPermission("labels.read")) denyAction("labels.read", "getLabels");
      return labelsApi.getLabels();
    },
    getLabel(id: string) {
      if (!hasPermission("labels.read")) denyAction("labels.read", "getLabel");
      return labelsApi.getLabel(id);
    },

    // ── Label write operations ──

    async createLabel(params: CreateLabelParams) {
      if (!hasPermission("labels.write")) denyAction("labels.write", "createLabel");
      const result = await safeEmit("label.creating", { params });
      checkCancellation(result, "createLabel");
      const finalParams = (result.params ?? params) as CreateLabelParams;
      const label = await labelsApi.createLabel(finalParams);
      await safeEmit("label.created", { label });
      return label;
    },

    async updateLabel(id: string, params: UpdateLabelParams) {
      if (!hasPermission("labels.write")) denyAction("labels.write", "updateLabel");
      const label = await labelsApi.getLabel(id);
      const result = await safeEmit("label.updating", { label, changes: params });
      checkCancellation(result, "updateLabel");
      const updated = await labelsApi.updateLabel(id, params);
      await safeEmit("label.updated", { label: updated, changes: params });
      return updated;
    },

    async deleteLabel(id: string) {
      if (!hasPermission("labels.write")) denyAction("labels.write", "deleteLabel");
      const label = await labelsApi.getLabel(id);
      const result = await safeEmit("label.deleting", { label });
      checkCancellation(result, "deleteLabel");
      await labelsApi.deleteLabel(id);
      await safeEmit("label.deleted", { label });
    },

    // ── Section read operations (no hooks) ──

    getSections(projectId?: string) {
      if (!hasPermission("sections.read")) denyAction("sections.read", "getSections");
      return sectionsApi.getSections(projectId);
    },
    getSection(id: string) {
      if (!hasPermission("sections.read")) denyAction("sections.read", "getSection");
      return sectionsApi.getSection(id);
    },

    // ── Section write operations ──

    async createSection(params: CreateSectionParams) {
      if (!hasPermission("sections.write")) denyAction("sections.write", "createSection");
      const result = await safeEmit("section.creating", { params });
      checkCancellation(result, "createSection");
      const finalParams = (result.params ?? params) as CreateSectionParams;
      const section = await sectionsApi.createSection(finalParams);
      await safeEmit("section.created", { section });
      return section;
    },

    async updateSection(id: string, params: UpdateSectionParams) {
      if (!hasPermission("sections.write")) denyAction("sections.write", "updateSection");
      const section = await sectionsApi.getSection(id);
      const result = await safeEmit("section.updating", { section, changes: params });
      checkCancellation(result, "updateSection");
      const updated = await sectionsApi.updateSection(id, params);
      await safeEmit("section.updated", { section: updated, changes: params });
      return updated;
    },

    async deleteSection(id: string) {
      if (!hasPermission("sections.write")) denyAction("sections.write", "deleteSection");
      const section = await sectionsApi.getSection(id);
      const result = await safeEmit("section.deleting", { section });
      checkCancellation(result, "deleteSection");
      await sectionsApi.deleteSection(id);
      await safeEmit("section.deleted", { section });
    },

    // ── Comment read operations (no hooks) ──

    getComments(taskId: string) {
      if (!hasPermission("comments.read")) denyAction("comments.read", "getComments");
      return commentsApi.getComments(taskId);
    },
    getComment(id: string) {
      if (!hasPermission("comments.read")) denyAction("comments.read", "getComment");
      return commentsApi.getComment(id);
    },

    // ── Comment write operations ──

    async createComment(params: CreateCommentParams) {
      if (!hasPermission("comments.write")) denyAction("comments.write", "createComment");
      const result = await safeEmit("comment.creating", { params });
      checkCancellation(result, "createComment");
      const finalParams = (result.params ?? params) as CreateCommentParams;
      const comment = await commentsApi.createComment(finalParams);
      await safeEmit("comment.created", { comment });
      return comment;
    },

    async updateComment(id: string, params: UpdateCommentParams) {
      if (!hasPermission("comments.write")) denyAction("comments.write", "updateComment");
      const comment = await commentsApi.getComment(id);
      const result = await safeEmit("comment.updating", { comment, changes: params });
      checkCancellation(result, "updateComment");
      const updated = await commentsApi.updateComment(id, params);
      await safeEmit("comment.updated", { comment: updated, changes: params });
      return updated;
    },

    async deleteComment(id: string) {
      if (!hasPermission("comments.write")) denyAction("comments.write", "deleteComment");
      const comment = await commentsApi.getComment(id);
      const result = await safeEmit("comment.deleting", { comment });
      checkCancellation(result, "deleteComment");
      await commentsApi.deleteComment(id);
      await safeEmit("comment.deleted", { comment });
    },
  };
}
