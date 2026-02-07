export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDurationShort(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  return `${minutes}m`;
}

export function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse duration string like "30m", "1h30m", "2h", "1.5h", or plain number (minutes) */
export function parseDurationInput(input: string): number {
  const trimmed = input.trim().toLowerCase();

  // "1h30m", "2h15m"
  const hm = trimmed.match(/^(\d+)h\s*(\d+)m?$/);
  if (hm) {
    return (parseInt(hm[1]!, 10) * 60 + parseInt(hm[2]!, 10)) * 60 * 1000;
  }

  // "2h", "1.5h"
  const h = trimmed.match(/^([\d.]+)h$/);
  if (h) {
    return Math.round(parseFloat(h[1]!) * 60 * 60 * 1000);
  }

  // "30m", "90m"
  const m = trimmed.match(/^(\d+)m$/);
  if (m) {
    return parseInt(m[1]!, 10) * 60 * 1000;
  }

  // Plain number = minutes
  const n = parseFloat(trimmed);
  if (!isNaN(n) && n > 0) {
    return Math.round(n * 60 * 1000);
  }

  return -1;
}
