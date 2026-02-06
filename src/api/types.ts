export type Priority = 1 | 2 | 3 | 4;

export interface Deadline {
  date: string; // YYYY-MM-DD
}

export interface Task {
  id: string;
  content: string;
  description: string;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  order: number;
  priority: Priority;
  due: Due | null;
  deadline: Deadline | null;
  labels: string[];
  assignee_id: string | null;
  is_completed: boolean;
  created_at: string;
  creator_id: string;
  url: string;
}

export interface Due {
  date: string;
  string: string;
  lang: string;
  is_recurring: boolean;
  datetime: string | null;
  timezone: string | null;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  parent_id: string | null;
  order: number;
  comment_count: number;
  is_shared: boolean;
  is_favorite: boolean;
  is_inbox_project: boolean;
  view_style: "list" | "board";
  url: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  order: number;
  is_favorite: boolean;
}

export interface Comment {
  id: string;
  task_id: string;
  content: string;
  posted_at: string;
}

export interface Section {
  id: string;
  project_id: string;
  order: number;
  name: string;
}

export interface CreateTaskParams {
  content: string;
  description?: string;
  project_id?: string;
  priority?: Priority;
  due_string?: string;
  due_date?: string;
  deadline_date?: string | null;
  labels?: string[];
  parent_id?: string;
  section_id?: string;
}

export interface UpdateTaskParams {
  content?: string;
  description?: string;
  priority?: Priority;
  due_string?: string;
  due_date?: string;
  deadline_date?: string | null;
  labels?: string[];
  project_id?: string;
  section_id?: string;
}

export interface UpdateProjectParams {
  name?: string;
  color?: string;
  is_favorite?: boolean;
  view_style?: "list" | "board";
}

export interface UpdateLabelParams {
  name?: string;
  color?: string;
  order?: number;
  is_favorite?: boolean;
}

export interface UpdateSectionParams {
  name?: string;
}

export interface UpdateCommentParams {
  content?: string;
}

export interface CreateProjectParams {
  name: string;
  color?: string;
  parent_id?: string;
  view_style?: "list" | "board";
}

export interface CreateLabelParams {
  name: string;
  color?: string;
  order?: number;
}

export interface CreateCommentParams {
  task_id: string;
  content: string;
}

export interface TaskFilter {
  project_id?: string;
  label?: string;
  filter?: string;
}

export interface ApiError {
  error: string;
  http_code: number;
}

export interface TaskTemplate {
  name: string;
  content: string;
  description?: string;
  priority?: Priority;
  labels?: string[];
  due_string?: string;
  deadline_date?: string;
}

export interface CreateSectionParams {
  name: string;
  project_id: string;
  order?: number;
}

export interface CompletedTask {
  id: string;
  task_id: string;
  content: string;
  project_id: string;
  section_id: string | null;
  completed_at: string;
  user_id: string;
  note_count: number;
}

export interface ActivityEvent {
  id: string;
  object_type: string;
  object_id: string;
  event_type: string;
  event_date: string;
  extra_data: Record<string, unknown>;
}

export interface UserStats {
  completed_count: number;
  completed_today: number;
  karma: number;
  karma_trend: string;
  days_items: DayStats[];
  week_items: WeekStats[];
}

export interface DayStats {
  date: string;
  total_completed: number;
}

export interface WeekStats {
  from: string;
  to: string;
  total_completed: number;
}
