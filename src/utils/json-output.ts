/**
 * Pick specified fields from items and print as JSON.
 * Used by CLI commands with --json flag.
 */
export function printJsonFields<T extends Record<string, unknown>>(
  items: T[],
  fieldSpec: string,
): void {
  const fields = fieldSpec.split(",").map((f) => f.trim());
  const data = items.map((item) => {
    const obj: Record<string, unknown> = {};
    for (const f of fields) {
      if (f in item) obj[f] = (item as Record<string, unknown>)[f];
    }
    return obj;
  });
  console.log(JSON.stringify(data, null, 2));
}
