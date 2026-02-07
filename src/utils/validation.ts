/**
 * Input validation utilities for CLI commands.
 * Each validator returns an error message string, or null if the input is valid.
 */

/** Validate task content: non-empty, max 500 chars */
export function validateContent(content: string): string | null {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return "Task content cannot be empty.";
  }
  if (trimmed.length > 500) {
    return `Task content is too long (${trimmed.length} chars). Maximum is 500 characters.`;
  }
  return null;
}

/** Validate priority: must be 1-4 */
export function validatePriority(value: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > 4) {
    return `Invalid priority: ${value}. Must be 1 (normal), 2, 3, or 4 (urgent).`;
  }
  return null;
}

/** Validate date string: YYYY-MM-DD format */
export function validateDateString(value: string): string | null {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(value)) {
    return `Invalid date format: "${value}". Expected YYYY-MM-DD (e.g. 2025-01-15).`;
  }
  // Verify it parses to a real date
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return `Invalid date: "${value}" is not a real calendar date.`;
  }
  return null;
}

/** Validate non-empty string for names (project, label, section) */
export function validateName(value: string, entityType: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return `${entityType} name cannot be empty.`;
  }
  if (trimmed.length > 120) {
    return `${entityType} name is too long (${trimmed.length} chars). Maximum is 120 characters.`;
  }
  return null;
}

/** Validate duration string like "30m", "1h30m" etc -- returns error or null */
export function validateDuration(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) {
    return "Duration cannot be empty.";
  }

  // Accept patterns like: "30m", "1h", "1h30m", "90m", "2h"
  const pattern = /^(?:(\d+)h)?(?:(\d+)m)?$/;
  const match = trimmed.match(pattern);

  if (!match || (!match[1] && !match[2])) {
    return `Invalid duration format: "${value}". Use formats like "30m", "1h", or "1h30m".`;
  }

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;

  if (hours === 0 && minutes === 0) {
    return "Duration must be greater than zero.";
  }

  if (minutes > 59) {
    return `Invalid minutes: ${minutes}. Use hours for values over 59 (e.g. "1h30m" instead of "90m").`;
  }

  if (hours > 24) {
    return `Duration too long: ${hours} hours. Maximum is 24 hours.`;
  }

  return null;
}
