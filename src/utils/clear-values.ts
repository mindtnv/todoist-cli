/**
 * Values that indicate a field should be cleared/removed.
 * Used for --due and --deadline options in task update/add commands.
 */
export const CLEAR_VALUES = ["none", "clear"] as const;

/**
 * Returns true if the given value is a "clear" sentinel (e.g. "none" or "clear").
 */
export function isClearValue(value: string): boolean {
  return (CLEAR_VALUES as readonly string[]).includes(value);
}
