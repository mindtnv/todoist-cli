// Barrel export for the API layer.
// Re-exports all public functions, classes, and types.

// Client
export { api, stripUndefined, ApiError, RetryExhaustedError } from "./client.ts";

// CRUD utilities
export { createCrudModule } from "./crud.ts";
export type { CrudModule } from "./crud.ts";

// Tasks
export {
  getTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  closeTask,
  reopenTask,
} from "./tasks.ts";

// Projects
export {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from "./projects.ts";

// Labels
export {
  getLabels,
  getLabel,
  createLabel,
  updateLabel,
  deleteLabel,
} from "./labels.ts";

// Sections
export {
  getSections,
  getSection,
  createSection,
  updateSection,
  deleteSection,
} from "./sections.ts";

// Comments
export {
  getComments,
  getComment,
  createComment,
  updateComment,
  deleteComment,
} from "./comments.ts";

// Completed tasks
export { getCompletedTasks } from "./completed.ts";

// Activity
export { getActivity } from "./activity.ts";

// Stats
export { getStats } from "./stats.ts";

// Types
export type {
  Priority,
  Deadline,
  Task,
  Due,
  Project,
  Label,
  Comment,
  Section,
  CreateTaskParams,
  UpdateTaskParams,
  UpdateProjectParams,
  UpdateLabelParams,
  UpdateSectionParams,
  UpdateCommentParams,
  CreateProjectParams,
  CreateLabelParams,
  CreateCommentParams,
  CreateSectionParams,
  TaskFilter,
  ApiErrorResponse,
  TaskTemplate,
  CompletedTask,
  ActivityEvent,
  UserStats,
  DayStats,
  WeekStats,
} from "./types.ts";
