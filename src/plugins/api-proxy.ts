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
import type { HookRegistry, HookEvent, HookContextMap, PluginApi, EmitResult } from "./types.ts";
import { getLogger } from "../utils/logger.ts";
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

const log = getLogger("api-proxy");

export function createApiProxy(hooks: HookRegistry): PluginApi {
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

  function checkCancellation(result: EmitResult, operationName: string): void {
    if (result.cancelled) {
      const reason = result.reason ? `: ${result.reason}` : "";
      log.info(`Operation cancelled by plugin${reason} (${operationName})`);
      throw new Error(`Operation cancelled by plugin${reason} (${operationName})`);
    }
  }

  return {
    // ── Task read operations (no hooks) ──

    getTasks(filter?: TaskFilter) {
      return tasksApi.getTasks(filter);
    },
    getTask(id: string) {
      return tasksApi.getTask(id);
    },

    // ── Task write operations ──

    async createTask(params: CreateTaskParams) {
      const result = await safeEmit("task.creating", { params });
      checkCancellation(result, "createTask");
      const finalParams = (result.params ?? params) as CreateTaskParams;
      const task = await tasksApi.createTask(finalParams);
      await safeEmit("task.created", { task });
      return task;
    },

    async updateTask(id: string, changes: UpdateTaskParams) {
      const task = await tasksApi.getTask(id);
      const result = await safeEmit("task.updating", { task, changes });
      checkCancellation(result, "updateTask");
      const updated = await tasksApi.updateTask(id, changes);
      await safeEmit("task.updated", { task: updated, changes });
      return updated;
    },

    async closeTask(id: string) {
      const task = await tasksApi.getTask(id);
      const result = await safeEmit("task.completing", { task });
      checkCancellation(result, "closeTask");
      await tasksApi.closeTask(id);
      await safeEmit("task.completed", { task });
    },

    async reopenTask(id: string) {
      await tasksApi.reopenTask(id);
    },

    async deleteTask(id: string) {
      const task = await tasksApi.getTask(id);
      const result = await safeEmit("task.deleting", { task });
      checkCancellation(result, "deleteTask");
      await tasksApi.deleteTask(id);
      await safeEmit("task.deleted", { task });
    },

    // ── Project read operations (no hooks) ──

    getProjects() {
      return projectsApi.getProjects();
    },
    getProject(id: string) {
      return projectsApi.getProject(id);
    },

    // ── Project write operations ──

    async createProject(params: CreateProjectParams) {
      const result = await safeEmit("project.creating", { params });
      checkCancellation(result, "createProject");
      const finalParams = (result.params ?? params) as CreateProjectParams;
      const project = await projectsApi.createProject(finalParams);
      await safeEmit("project.created", { project });
      return project;
    },

    async updateProject(id: string, params: UpdateProjectParams) {
      const project = await projectsApi.getProject(id);
      const result = await safeEmit("project.updating", { project, changes: params });
      checkCancellation(result, "updateProject");
      const updated = await projectsApi.updateProject(id, params);
      await safeEmit("project.updated", { project: updated, changes: params });
      return updated;
    },

    async deleteProject(id: string) {
      const project = await projectsApi.getProject(id);
      const result = await safeEmit("project.deleting", { project });
      checkCancellation(result, "deleteProject");
      await projectsApi.deleteProject(id);
      await safeEmit("project.deleted", { project });
    },

    // ── Label read operations (no hooks) ──

    getLabels() {
      return labelsApi.getLabels();
    },
    getLabel(id: string) {
      return labelsApi.getLabel(id);
    },

    // ── Label write operations ──

    async createLabel(params: CreateLabelParams) {
      const result = await safeEmit("label.creating", { params });
      checkCancellation(result, "createLabel");
      const finalParams = (result.params ?? params) as CreateLabelParams;
      const label = await labelsApi.createLabel(finalParams);
      await safeEmit("label.created", { label });
      return label;
    },

    async updateLabel(id: string, params: UpdateLabelParams) {
      const label = await labelsApi.getLabel(id);
      const result = await safeEmit("label.updating", { label, changes: params });
      checkCancellation(result, "updateLabel");
      const updated = await labelsApi.updateLabel(id, params);
      await safeEmit("label.updated", { label: updated, changes: params });
      return updated;
    },

    async deleteLabel(id: string) {
      const label = await labelsApi.getLabel(id);
      const result = await safeEmit("label.deleting", { label });
      checkCancellation(result, "deleteLabel");
      await labelsApi.deleteLabel(id);
      await safeEmit("label.deleted", { label });
    },

    // ── Section read operations (no hooks) ──

    getSections(projectId?: string) {
      return sectionsApi.getSections(projectId);
    },
    getSection(id: string) {
      return sectionsApi.getSection(id);
    },

    // ── Section write operations ──

    async createSection(params: CreateSectionParams) {
      const result = await safeEmit("section.creating", { params });
      checkCancellation(result, "createSection");
      const finalParams = (result.params ?? params) as CreateSectionParams;
      const section = await sectionsApi.createSection(finalParams);
      await safeEmit("section.created", { section });
      return section;
    },

    async updateSection(id: string, params: UpdateSectionParams) {
      const section = await sectionsApi.getSection(id);
      const result = await safeEmit("section.updating", { section, changes: params });
      checkCancellation(result, "updateSection");
      const updated = await sectionsApi.updateSection(id, params);
      await safeEmit("section.updated", { section: updated, changes: params });
      return updated;
    },

    async deleteSection(id: string) {
      const section = await sectionsApi.getSection(id);
      const result = await safeEmit("section.deleting", { section });
      checkCancellation(result, "deleteSection");
      await sectionsApi.deleteSection(id);
      await safeEmit("section.deleted", { section });
    },

    // ── Comment read operations (no hooks) ──

    getComments(taskId: string) {
      return commentsApi.getComments(taskId);
    },
    getComment(id: string) {
      return commentsApi.getComment(id);
    },

    // ── Comment write operations ──

    async createComment(params: CreateCommentParams) {
      const result = await safeEmit("comment.creating", { params });
      checkCancellation(result, "createComment");
      const finalParams = (result.params ?? params) as CreateCommentParams;
      const comment = await commentsApi.createComment(finalParams);
      await safeEmit("comment.created", { comment });
      return comment;
    },

    async updateComment(id: string, params: UpdateCommentParams) {
      const comment = await commentsApi.getComment(id);
      const result = await safeEmit("comment.updating", { comment, changes: params });
      checkCancellation(result, "updateComment");
      const updated = await commentsApi.updateComment(id, params);
      await safeEmit("comment.updated", { comment: updated, changes: params });
      return updated;
    },

    async deleteComment(id: string) {
      const comment = await commentsApi.getComment(id);
      const result = await safeEmit("comment.deleting", { comment });
      checkCancellation(result, "deleteComment");
      await commentsApi.deleteComment(id);
      await safeEmit("comment.deleted", { comment });
    },
  };
}
