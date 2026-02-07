import { getTasks } from "../api/tasks.ts";
import { getProjects } from "../api/projects.ts";
import { getLabels } from "../api/labels.ts";
import { getSections } from "../api/sections.ts";
import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IndexItem {
  index: number;
  id: string;
  label: string;
}

interface LastList {
  type: string;
  items: IndexItem[];
}

// ---------------------------------------------------------------------------
// Short Index Cache
// ---------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), ".config", "todoist-cli");
const LAST_LIST_PATH = join(CONFIG_DIR, ".last-list.json");

/**
 * Save the most recent list command output as an index mapping.
 * Each item gets a 1-based index that can be used as a short reference.
 */
export function saveLastList(
  type: string,
  items: { id: string; label: string }[],
): void {
  const data: LastList = {
    type,
    items: items.map((item, i) => ({
      index: i + 1,
      id: item.id,
      label: item.label,
    })),
  };

  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  writeFileSync(LAST_LIST_PATH, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Load the last saved list index, or null if none exists.
 */
export function loadLastList(): LastList | null {
  if (!existsSync(LAST_LIST_PATH)) return null;

  try {
    const raw = readFileSync(LAST_LIST_PATH, "utf-8");
    return JSON.parse(raw) as LastList;
  } catch {
    return null;
  }
}

/**
 * Resolve a short index value (e.g. "1", "#3") to a Todoist ID using
 * the cached last-list. Returns null if not found or cache missing.
 */
export function resolveFromIndex(value: string): string | null {
  const num = parseShortIndex(value);
  if (num === null) return null;

  const list = loadLastList();
  if (!list) return null;

  const entry = list.items.find((item) => item.index === num);
  return entry?.id ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a value as a short index number (1-999).
 * Accepts plain numbers ("1", "42") or hash-prefixed ("#1", "#42").
 * Returns the numeric index or null if the value is not a short index.
 */
function parseShortIndex(value: string): number | null {
  let numStr = value;
  if (numStr.startsWith("#")) {
    numStr = numStr.slice(1);
  }

  if (!/^\d+$/.test(numStr)) return null;

  const num = parseInt(numStr, 10);
  if (num < 1 || num > 999) return null;

  return num;
}

/**
 * Returns true if the value looks like a raw Todoist ID (8+ digit string).
 */
function isRawId(value: string): boolean {
  return /^\d{8,}$/.test(value);
}

/**
 * Returns true if the value is a short index (1-999 or #1-#999).
 */
function isShortIndex(value: string): boolean {
  return parseShortIndex(value) !== null;
}

/**
 * Fuzzy/prefix name matching against a list of named items.
 * Tries in order: exact (case-insensitive) -> prefix -> substring.
 * Returns the ID of the best match, or null if no match found.
 */
function matchByName(
  value: string,
  items: { id: string; name: string }[],
): string | null {
  const lower = value.toLowerCase();

  // 1. Exact case-insensitive match
  const exact = items.find((item) => item.name.toLowerCase() === lower);
  if (exact) return exact.id;

  // 2. Prefix match (starts with, case-insensitive)
  const prefixMatches = items.filter((item) =>
    item.name.toLowerCase().startsWith(lower),
  );
  if (prefixMatches.length > 0) return prefixMatches[0]!.id;

  // 3. Substring match (contains, case-insensitive)
  const substringMatches = items.filter((item) =>
    item.name.toLowerCase().includes(lower),
  );
  if (substringMatches.length > 0) return substringMatches[0]!.id;

  return null;
}

// ---------------------------------------------------------------------------
// Generic Named Entity Resolver
// ---------------------------------------------------------------------------

/**
 * Generic resolver for named entities (projects, labels, sections).
 *
 * Resolution order:
 * 1. Short index (1-999 or #N) -- looked up in cached last-list
 * 2. Name match (exact -> prefix -> substring, case-insensitive)
 * 3. Raw ID -- returned as-is
 */
async function resolveNamedEntityArg(
  value: string,
  fetchItems: () => Promise<{ id: string; name: string }[]>,
): Promise<string> {
  if (isShortIndex(value)) {
    const id = resolveFromIndex(value);
    if (id) return id;
  }
  if (!isShortIndex(value) && !isRawId(value)) {
    const items = await fetchItems();
    const matched = matchByName(value, items);
    if (matched) return matched;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Universal Resolver Functions
// ---------------------------------------------------------------------------

/**
 * Resolve a task argument to a Todoist task ID.
 *
 * Resolution order:
 * 1. Short index (1-999 or #N) -- looked up in cached last-list
 * 2. Content substring search -- fetches tasks, matches by content
 * 3. Raw ID -- returned as-is if it looks like a Todoist ID or as fallback
 */
export async function resolveTaskArg(value: string): Promise<string> {
  // 1. Try short index
  if (isShortIndex(value)) {
    const id = resolveFromIndex(value);
    if (id) return id;
  }

  // 2. If not a number and not a raw ID, try content search
  if (!isShortIndex(value) && !isRawId(value)) {
    const tasks = await getTasks();
    const lower = value.toLowerCase();

    // Exact content match (case-insensitive)
    const exact = tasks.find((t) => t.content.toLowerCase() === lower);
    if (exact) return exact.id;

    // Substring content match
    const matches = tasks.filter((t) =>
      t.content.toLowerCase().includes(lower),
    );
    if (matches.length > 0) return matches[0]!.id;
  }

  // 3. Return as-is (raw ID or unresolvable)
  return value;
}

/**
 * Resolve a project argument to a Todoist project ID.
 */
export function resolveProjectArg(value: string): Promise<string> {
  return resolveNamedEntityArg(value, async () => {
    const projects = await getProjects();
    return projects.map((p) => ({ id: p.id, name: p.name }));
  });
}

/**
 * Resolve a label argument to a Todoist label ID.
 */
export function resolveLabelArg(value: string): Promise<string> {
  return resolveNamedEntityArg(value, async () => {
    const labels = await getLabels();
    return labels.map((l) => ({ id: l.id, name: l.name }));
  });
}

/**
 * Resolve a section argument to a Todoist section ID.
 * Optionally scoped to a specific project via projectId.
 */
export function resolveSectionArg(
  value: string,
  projectId?: string,
): Promise<string> {
  return resolveNamedEntityArg(value, async () => {
    const sections = await getSections(projectId);
    return sections.map((s) => ({ id: s.id, name: s.name }));
  });
}

/**
 * Resolve multiple task arguments to Todoist task IDs.
 * Each value is resolved independently.
 *
 * Supports mixed input: short indices, content searches, and raw IDs.
 * Example: resolveTaskArgs(["1", "2", "buy milk"]) might return
 *          ["8259465170", "8259465171", "8259465180"]
 *
 * If filterQuery is provided, it will be used to scope the task fetch
 * for content-based lookups.
 */
export async function resolveTaskArgs(
  values: string[],
  filterQuery?: string,
): Promise<string[]> {
  // stdin mode: read IDs from stdin
  if (values.length === 1 && values[0] === "-") {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const input = Buffer.concat(chunks).toString("utf-8");
    return input.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  }

  // filter-only mode: return all matching task IDs when no explicit values given
  if (filterQuery && values.length === 0) {
    const tasks = await getTasks({ filter: filterQuery });
    return tasks.map((t) => t.id);
  }

  // If any values require content search, batch-fetch tasks once
  const needsSearch = values.some((v) => !isShortIndex(v) && !isRawId(v));
  let tasksCache: Awaited<ReturnType<typeof getTasks>> | null = null;

  if (needsSearch) {
    tasksCache = await getTasks(
      filterQuery ? { filter: filterQuery } : undefined,
    );
  }

  const resolved: string[] = [];

  for (const value of values) {
    // 1. Try short index
    if (isShortIndex(value)) {
      const id = resolveFromIndex(value);
      if (id) {
        resolved.push(id);
        continue;
      }
    }

    // 2. If not a number and not a raw ID, try content search using cache
    if (!isShortIndex(value) && !isRawId(value) && tasksCache) {
      const lower = value.toLowerCase();

      // Exact content match (case-insensitive)
      const exact = tasksCache.find((t) => t.content.toLowerCase() === lower);
      if (exact) {
        resolved.push(exact.id);
        continue;
      }

      // Substring content match
      const matches = tasksCache.filter((t) =>
        t.content.toLowerCase().includes(lower),
      );
      if (matches.length > 0) {
        resolved.push(matches[0]!.id);
        continue;
      }
    }

    // 3. Return as-is (raw ID or unresolvable)
    resolved.push(value);
  }

  return resolved;
}
