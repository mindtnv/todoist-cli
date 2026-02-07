import type { Task } from "../api/types.ts";

export type SortField = "priority" | "due" | "name" | "project" | "date" | "content";

export function sortTasks(tasks: Task[], field: SortField, direction: "asc" | "desc" = "asc"): Task[] {
  const dir = direction === "desc" ? -1 : 1;
  const sorted = [...tasks];
  sorted.sort((a, b) => {
    switch (field) {
      case "priority":
        // Higher API priority number = more urgent, so ascending = urgent first
        return (b.priority - a.priority) * dir;
      case "due":
      case "date": {
        const aDate = a.due?.date ?? "9999-12-31";
        const bDate = b.due?.date ?? "9999-12-31";
        return aDate.localeCompare(bDate) * dir;
      }
      case "name":
      case "content":
        return a.content.localeCompare(b.content) * dir;
      case "project":
        return a.project_id.localeCompare(b.project_id) * dir;
    }
  });
  return sorted;
}
