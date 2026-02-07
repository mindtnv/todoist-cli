import type { Priority } from "../api/types.ts";
import { getProjects } from "../api/projects.ts";

export interface QuickAddResult {
  content: string;
  description?: string;
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

// Description syntax: "// description text" (double slash + space separates description from content)
const DESCRIPTION_RE = /\s+\/\/\s+(.*)/;

// Recurrence syntax: !daily, !weekly, !monthly, !yearly, !weekdays, !every <text>
const RECURRENCE_SIMPLE_RE = /!(daily|weekly|monthly|yearly|weekdays)\b/;
const RECURRENCE_EVERY_RE = /!every\s+([^#@!{}\\/]+?)(?=\s+[#@!{p]|\s+\/\/|\s*$)/;

// Relative date patterns: +Nd for days, +Nw for weeks
const RELATIVE_DAYS_RE = /\+(\d+)d\b/;
const RELATIVE_WEEKS_RE = /\+(\d+)w\b/;

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

  // Extract description first: "// description text" (double slash + space)
  // Must happen before section extraction since //SectionName (no space) is different
  let description: string | undefined;
  const descMatch = DESCRIPTION_RE.exec(text);
  if (descMatch) {
    description = descMatch[1]!.trim();
    text = text.slice(0, descMatch.index).trim();
  }

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

  // Extract recurrence syntax: !daily, !weekly, !every <text>
  let dueString: string | undefined;
  const recurrenceSimpleMatch = RECURRENCE_SIMPLE_RE.exec(text);
  const recurrenceEveryMatch = RECURRENCE_EVERY_RE.exec(text);

  if (recurrenceEveryMatch) {
    // !every takes precedence when it comes before simple recurrence
    dueString = "every " + recurrenceEveryMatch[1]!.trim();
    text = text.replace(recurrenceEveryMatch[0], "").trim();
  } else if (recurrenceSimpleMatch) {
    const keyword = recurrenceSimpleMatch[1]!;
    // Map shorthand to Todoist-compatible due_string
    const recurrenceMap: Record<string, string> = {
      daily: "every day",
      weekly: "every week",
      monthly: "every month",
      yearly: "every year",
      weekdays: "every weekday",
    };
    dueString = recurrenceMap[keyword] ?? keyword;
    text = text.replace(recurrenceSimpleMatch[0], "").trim();
  }

  // Extract relative date patterns: +Nd, +Nw
  if (!dueString) {
    const relativeDaysMatch = RELATIVE_DAYS_RE.exec(text);
    if (relativeDaysMatch) {
      const n = parseInt(relativeDaysMatch[1]!, 10);
      dueString = n === 1 ? "in 1 day" : `in ${n} days`;
      text = text.replace(relativeDaysMatch[0], "").trim();
    } else {
      const relativeWeeksMatch = RELATIVE_WEEKS_RE.exec(text);
      if (relativeWeeksMatch) {
        const n = parseInt(relativeWeeksMatch[1]!, 10);
        dueString = n === 1 ? "in 1 week" : `in ${n} weeks`;
        text = text.replace(relativeWeeksMatch[0], "").trim();
      }
    }
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

  // Extract date keywords (only if no recurrence/relative date was already found)
  if (!dueString) {
    const dateResult = extractDatePhrase(text);
    if (dateResult) {
      dueString = dateResult.date;
      text = dateResult.remaining;
    }
  }

  // Clean up extra whitespace
  text = text.replace(/\s+/g, " ").trim();

  return {
    content: text,
    description,
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
