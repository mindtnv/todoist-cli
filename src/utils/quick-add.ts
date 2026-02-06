import type { Priority } from "../api/types.ts";
import { getProjects } from "../api/projects.ts";

export interface QuickAddResult {
  content: string;
  priority?: Priority;
  labels: string[];
  due_string?: string;
  project_name?: string;
  project_id?: string;
  section_name?: string;
  deadline?: string; // YYYY-MM-DD
}

const PRIORITY_RE = /\bp([1-4])\b/;
const PROJECT_RE = /#"([^"]+)"|#'([^']+)'|#(\S+)/;
const LABEL_RE = /@(\S+)/g;
const SECTION_RE = /\/\/(\S+)/;
const DEADLINE_RE = /\{(\d{4}-\d{2}-\d{2})\}/;

const DATE_KEYWORDS = [
  "today",
  "tomorrow",
  "yesterday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "next week",
  "next month",
  "every day",
  "every week",
  "every month",
];

function extractDatePhrase(text: string): { date: string; remaining: string } | null {
  const lower = text.toLowerCase();
  for (const keyword of DATE_KEYWORDS) {
    const idx = lower.indexOf(keyword);
    if (idx !== -1) {
      const remaining = text.slice(0, idx) + text.slice(idx + keyword.length);
      return { date: keyword, remaining: remaining.replace(/\s+/g, " ").trim() };
    }
  }

  // Match patterns like "Jan 15", "2026-02-10", "Feb 3rd"
  const datePatternRe = /\b(\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?)\b/i;
  const match = datePatternRe.exec(text);
  if (match) {
    const remaining = text.slice(0, match.index) + text.slice(match.index + match[0].length);
    return { date: match[0], remaining: remaining.replace(/\s+/g, " ").trim() };
  }

  return null;
}

export function parseQuickAdd(input: string): QuickAddResult {
  let text = input;
  const labels: string[] = [];

  // Extract priority
  let priority: Priority | undefined;
  const priMatch = PRIORITY_RE.exec(text);
  if (priMatch) {
    priority = parseInt(priMatch[1]!, 10) as Priority;
    text = text.replace(priMatch[0], "").trim();
  }

  // Extract deadline {YYYY-MM-DD} before project/section to avoid conflicts
  let deadline: string | undefined;
  const deadlineMatch = DEADLINE_RE.exec(text);
  if (deadlineMatch) {
    deadline = deadlineMatch[1]!;
    text = text.replace(deadlineMatch[0], "").trim();
  }

  // Extract section (//SectionName) before project (#Name) to avoid conflicts
  let sectionName: string | undefined;
  const sectionMatch = SECTION_RE.exec(text);
  if (sectionMatch) {
    sectionName = sectionMatch[1]!;
    text = text.replace(sectionMatch[0], "").trim();
  }

  // Extract project (supports #Name, #"Multi Word", #'Multi Word')
  let projectName: string | undefined;
  const projectMatch = PROJECT_RE.exec(text);
  if (projectMatch) {
    projectName = projectMatch[1] ?? projectMatch[2] ?? projectMatch[3]!;
    text = text.replace(projectMatch[0], "").trim();
  }

  // Extract labels
  LABEL_RE.lastIndex = 0;
  let labelMatch: RegExpExecArray | null;
  while ((labelMatch = LABEL_RE.exec(text)) !== null) {
    labels.push(labelMatch[1]!);
  }
  text = text.replace(LABEL_RE, "").trim();

  // Extract date
  let dueString: string | undefined;
  const dateResult = extractDatePhrase(text);
  if (dateResult) {
    dueString = dateResult.date;
    text = dateResult.remaining;
  }

  // Clean up extra whitespace
  text = text.replace(/\s+/g, " ").trim();

  return {
    content: text,
    priority,
    labels,
    due_string: dueString,
    project_name: projectName,
    section_name: sectionName,
    deadline,
  };
}

export async function resolveProjectName(name: string): Promise<string | undefined> {
  const projects = await getProjects();
  const lower = name.toLowerCase();
  const found = projects.find((p) => p.name.toLowerCase() === lower);
  return found?.id;
}

export async function resolveSectionName(name: string, projectId?: string): Promise<string | undefined> {
  const { getSections } = await import("../api/sections.ts");
  const sections = await getSections(projectId);
  const lower = name.toLowerCase();
  const found = sections.find((s) => s.name.toLowerCase() === lower);
  return found?.id;
}
