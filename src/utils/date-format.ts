const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function getTodayString(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export function formatDeadlineShort(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return `${SHORT_MONTHS[m - 1]} ${d}`;
}

export function formatDeadlineLong(dateStr: string): string {
  const parts = dateStr.split("-").map(Number);
  const y = parts[0] ?? 2025;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return `${FULL_MONTHS[m - 1]} ${d}, ${y}`;
}

export function isDeadlineUrgent(dateStr: string): boolean {
  const todayStr = getTodayString();
  const deadline = new Date(dateStr + "T00:00:00");
  const now = new Date(todayStr + "T00:00:00");
  const diffDays = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 3;
}

export function isDeadlineOverdue(dateStr: string): boolean {
  return dateStr < getTodayString();
}

export function formatRelativeDue(dateStr: string): { text: string; color: string } {
  const todayStr = getTodayString();
  const todayDate = new Date(todayStr + "T00:00:00");
  const dueDate = new Date(dateStr.slice(0, 10) + "T00:00:00");
  const diffDays = Math.round((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: "overdue", color: "red" };
  if (diffDays === 0) return { text: "today", color: "green" };
  if (diffDays === 1) return { text: "tomorrow", color: "yellow" };

  const m = dueDate.getMonth();
  const d = dueDate.getDate();
  return { text: `${SHORT_MONTHS[m]} ${d}`, color: "cyan" };
}

export function formatCreatedAt(isoString: string): string {
  const d = new Date(isoString);
  return `${FULL_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}
