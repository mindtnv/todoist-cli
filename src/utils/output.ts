import type { Task } from "../api/types.ts";

function escapeCsvField(val: string, delimiter: string): string {
  if (val.includes(delimiter) || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function formatTasksDelimited(tasks: Task[], delimiter: string): string {
  const headers = ["id", "content", "priority", "due_date", "deadline", "project_id", "labels", "description"];
  const lines: string[] = [headers.join(delimiter)];

  for (const t of tasks) {
    const row = [
      t.id,
      escapeCsvField(t.content, delimiter),
      String(t.priority),
      t.due?.date ?? "",
      t.deadline?.date ?? "",
      t.project_id,
      t.labels.join(";"),
      escapeCsvField(t.description || "", delimiter),
    ];
    lines.push(row.join(delimiter));
  }

  return lines.join("\n");
}
