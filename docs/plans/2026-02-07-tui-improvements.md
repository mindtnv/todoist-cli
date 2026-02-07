# TUI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Comprehensively improve the TUI experience across navigation, visual display, and functionality.

**Architecture:** Three parallel improvement tracks: (1) Navigation & UX - breadcrumbs, sticky header, contextual footer, task grouping; (2) Visual polish - improved TaskRow with better colors/icons, adaptive sidebar width, progress indicators, overdue highlighting; (3) New features - inline rename, auto-refresh polling, enhanced detail view with editing, notification bar with undo timer.

**Tech Stack:** React/Ink, TypeScript, existing Todoist API layer

---

## Track A: Navigation & UX (Agent: nav-expert)

### Task A1: Add Breadcrumb Header Component

**Files:**
- Create: `src/ui/components/Breadcrumb.tsx`
- Modify: `src/ui/views/TasksView.tsx:1040-1051`

**Step 1: Create Breadcrumb component**

```tsx
// src/ui/components/Breadcrumb.tsx
import { Box, Text } from "ink";

interface BreadcrumbProps {
  segments: Array<{ label: string; color?: string }>;
  suffix?: string;
}

export function Breadcrumb({ segments, suffix }: BreadcrumbProps) {
  return (
    <Box>
      {segments.map((seg, i) => (
        <Text key={i}>
          {i > 0 && <Text color="gray"> / </Text>}
          <Text color={seg.color ?? "white"} bold={i === segments.length - 1}>{seg.label}</Text>
        </Text>
      ))}
      {suffix && <Text color="gray">{` ${suffix}`}</Text>}
    </Box>
  );
}
```

**Step 2: Integrate into TasksView header**

Replace the current header in TasksView (lines 1041-1051) with Breadcrumb. Build segments from current filter state:
- Inbox view: `Todoist / Inbox`
- Project view: `Todoist / Projects / ProjectName`
- Label view: `Todoist / @labelName`
- Today: `Todoist / Today`
- Search active: append ` | Search: "query" (N results)`
- Filter active: append ` | Filter: query`

```tsx
// In TasksView, replace the header box:
const breadcrumbSegments = useMemo(() => {
  const segments: Array<{ label: string; color?: string }> = [
    { label: "Todoist", color: "green" },
  ];
  if (filterProjectId) {
    segments.push({ label: "Projects", color: "gray" });
    segments.push({ label: projects.find((p) => p.id === filterProjectId)?.name ?? "Project", color: "cyan" });
  } else if (filterLabel) {
    segments.push({ label: `@${filterLabel}`, color: "magenta" });
  } else if (filterView.startsWith("Filter: ")) {
    segments.push({ label: filterView, color: "yellow" });
  } else {
    segments.push({ label: filterView || "Inbox", color: "white" });
  }
  return segments;
}, [filterProjectId, filterLabel, filterView, projects]);

// Replace the header <Box>:
<Box paddingX={1} justifyContent="space-between">
  <Box>
    <Breadcrumb segments={breadcrumbSegments} />
    <Text color="gray">{` | Sort: ${sortLabels[sortField]} ${sortDirection === "asc" ? "\u2191" : "\u2193"}`}</Text>
    {searchQuery && (
      <Text color="cyan">{` | Search: "${searchQuery}" (${filteredTasks.length})`}</Text>
    )}
  </Box>
  <Text color="gray">{`${filteredTasks.length} tasks`}</Text>
</Box>
```

**Step 3: Commit**
```bash
git add src/ui/components/Breadcrumb.tsx src/ui/views/TasksView.tsx
git commit -m "feat(tui): add breadcrumb navigation header"
```

---

### Task A2: Improve Footer Status Bar with Contextual Hints

**Files:**
- Modify: `src/ui/views/TasksView.tsx:1196-1250`

**Step 1: Enhance the footer**

Improve the footer status bar to show:
- Left side: contextual keyboard shortcuts (already done, but refine)
- Center: current task info (selected task priority + truncated name)
- Right side: status message / undo timer / sync indicator / task position

Replace the right side of footer (lines 1243-1249):

```tsx
<Box>
  {/* Position indicator */}
  <Text color="gray" dimColor>
    {filteredTasks.length > 0 ? `${taskIndex + 1}/${filteredTasks.length}` : "0/0"}
  </Text>
  {/* Separator */}
  {(undoCountdown > 0 || statusMessage || isLoading) && <Text color="gray"> | </Text>}
  {/* Status */}
  {undoCountdown > 0 && lastAction ? (
    <Text color="green" bold>[u]ndo ({undoCountdown}s)</Text>
  ) : statusMessage ? (
    <Text color="yellow">{statusMessage}</Text>
  ) : isLoading ? (
    <Text color="cyan" dimColor>Syncing...</Text>
  ) : null}
</Box>
```

**Step 2: Commit**
```bash
git add src/ui/views/TasksView.tsx
git commit -m "feat(tui): add task position indicator to footer"
```

---

### Task A3: Add Task Grouping by Section/Date Headers

**Files:**
- Modify: `src/ui/components/TaskList.tsx:20-62`
- Modify: `src/ui/components/TaskList.tsx:152-180`

**Step 1: Add section headers to TaskList**

When tasks are sorted by project and a project is selected, insert section dividers. When sorted by due date, insert date group headers (Today, Tomorrow, Upcoming, No date).

Modify `buildTree` to insert separator entries and update rendering:

```tsx
// New type for flat items
interface FlatItem {
  type: "task" | "header";
  task?: Task;
  depth: number;
  headerText?: string;
}

// In TaskList, after building flatTasks, optionally insert group headers
function insertDateGroups(items: FlatTask[]): FlatItem[] {
  const result: FlatItem[] = [];
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  let lastGroup = "";
  for (const item of items) {
    const dueDate = item.task.due?.date ?? "9999-99-99";
    let group: string;
    if (dueDate < todayStr) group = "Overdue";
    else if (dueDate === todayStr) group = "Today";
    else if (dueDate === tomorrowStr) group = "Tomorrow";
    else if (dueDate === "9999-99-99") group = "No date";
    else group = dueDate;

    if (group !== lastGroup && item.depth === 0) {
      result.push({ type: "header", depth: 0, headerText: group });
      lastGroup = group;
    }
    result.push({ type: "task", task: item.task, depth: item.depth });
  }
  return result;
}
```

Render headers between tasks:

```tsx
{visibleItems.map((item, i) => {
  if (item.type === "header") {
    return (
      <Box key={`hdr-${i}`}>
        <Text color="yellow" bold dimColor>{`-- ${item.headerText} --`}</Text>
      </Box>
    );
  }
  return (
    <TaskRow
      key={item.task!.id}
      task={item.task!}
      isSelected={scrollStart + i === selectedIndex}
      isMarked={selectedIds?.has(item.task!.id)}
      depth={item.depth}
    />
  );
})}
```

Only enable date grouping when sortField is "due". Pass sortField as a prop to TaskList.

**Step 2: Commit**
```bash
git add src/ui/components/TaskList.tsx
git commit -m "feat(tui): add date group headers in task list when sorting by due date"
```

---

### Task A4: Section Filtering from Sidebar

**Files:**
- Modify: `src/ui/views/TasksView.tsx` (handleSidebarSelect, filter state, baseTasks)

**Step 1: Add section filtering support**

Add `filterSectionId` state to TasksView. When a section is selected in sidebar, filter tasks by `section_id`.

```tsx
const [filterSectionId, setFilterSectionId] = useState<string | undefined>();

// In handleSidebarSelect, add section case:
} else if (item.type === "section") {
  const sectionId = item.id.replace("section-", "");
  setFilterLabel(undefined);
  setFilterView("");
  // Keep the project filter, add section filter
  setFilterSectionId(sectionId);
}

// In baseTasks useMemo, add section filter:
if (filterSectionId) return t.project_id === filterProjectId && t.section_id === filterSectionId;
if (filterProjectId) return t.project_id === filterProjectId;
```

Update breadcrumb to show section name when filtering by section.

**Step 2: Commit**
```bash
git add src/ui/views/TasksView.tsx
git commit -m "feat(tui): enable section filtering from sidebar"
```

---

## Track B: Visual Polish (Agent: visual-expert)

### Task B1: Improve TaskRow Display

**Files:**
- Modify: `src/ui/components/TaskRow.tsx`

**Step 1: Enhance TaskRow with better visual indicators**

Replace raw priority text with colored symbols, improve due date formatting with relative dates, add overdue indicator:

```tsx
// Priority display: use colored dots instead of "pN"
const prioritySymbols: Record<number, { symbol: string; color: string }> = {
  4: { symbol: "\u25CF", color: "red" },      // ● red (urgent)
  3: { symbol: "\u25CF", color: "yellow" },    // ● yellow (high)
  2: { symbol: "\u25CF", color: "blue" },      // ● blue (medium)
  1: { symbol: "\u25CB", color: "gray" },      // ○ gray (normal)
};

// Relative due date formatting
function formatDueRelative(dateStr: string): { text: string; color: string } {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  if (dateStr < todayStr) return { text: "overdue", color: "red" };
  if (dateStr === todayStr) return { text: "today", color: "green" };
  if (dateStr === tomorrowStr) return { text: "tomorrow", color: "yellow" };
  // For other dates, show short format
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parts = dateStr.split("-").map(Number);
  return { text: `${months[(parts[1] ?? 1) - 1]} ${parts[2]}`, color: "cyan" };
}
```

Updated render:
```tsx
const prio = prioritySymbols[task.priority] ?? prioritySymbols[1]!;
const dueInfo = task.due ? formatDueRelative(task.due.date) : null;

return (
  <Box>
    <Text backgroundColor={...} color={...}>
      <Text color={isMarked ? "yellow" : "gray"}>{marker}</Text>
      {indent ? <Text color="gray" dimColor>{indent}</Text> : null}
      <Text color={prio.color}>{checkbox} {prio.symbol}</Text>
      {" "}
      <Text strikethrough={task.is_completed}>{content}</Text>
      {dueInfo ? <Text color={dueInfo.color}>{` ${dueInfo.text}`}</Text> : null}
      {recurringIndicator ? <Text color="cyan">{recurringIndicator}</Text> : null}
      {deadlineText ? <Text color={deadlineUrgent ? "red" : "magenta"} bold={deadlineUrgent}>{` \u2691 ${deadlineText}`}</Text> : null}
      {labelText ? <Text color="magenta">{` ${labelText}`}</Text> : null}
      {" "}
    </Text>
  </Box>
);
```

**Step 2: Commit**
```bash
git add src/ui/components/TaskRow.tsx
git commit -m "feat(tui): improve TaskRow with priority dots, relative dates, and strikethrough"
```

---

### Task B2: Adaptive Sidebar Width and Project Progress

**Files:**
- Modify: `src/ui/components/Sidebar.tsx:169-226`
- Modify: `src/ui/components/TaskRow.tsx` (remove hardcoded sidebarWidth)

**Step 1: Compute adaptive sidebar width**

Determine sidebar width based on longest project/label name, clamped between 20-36 chars:

```tsx
// In Sidebar component, compute width dynamically:
const maxLabelLength = useMemo(() => {
  const lengths = [
    ...projects.map((p) => p.name.length),
    ...labels.map((l) => l.name.length + 1), // +1 for @ prefix
    5, // "Inbox", "Today" etc
  ];
  return Math.min(36, Math.max(20, Math.max(...lengths) + 8)); // +8 for prefix, count, padding
}, [projects, labels]);

// Use maxLabelLength as width instead of hardcoded 24
<Box flexDirection="column" width={maxLabelLength} ...>
```

**Step 2: Add project progress bar to sidebar**

Show a small progress indicator (completed/total) next to each project. Use task counts:

```tsx
// For projects, compute completed ratio if we had completed count
// Since we only have active tasks, show active count as before but with a bar:
const countStr = item.taskCount != null ? ` ${item.taskCount}` : "";
// Render with a subtle indicator
```

Actually, since we only have active (incomplete) task counts from the API, just improve the count display formatting. Make counts right-aligned using available width.

**Step 3: Export sidebar width for TaskRow**

Instead of hardcoded 26 in TaskRow, pass it through React context or compute independently. Simplest approach: use same calculation in TaskRow:

```tsx
// In TaskRow.tsx, replace:
// const sidebarWidth = 26;
// With dynamic calculation:
const sidebarWidth = 26; // Will be updated when sidebar width prop is passed
```

Better approach: compute available width in TaskList and pass it down as a prop.

**Step 4: Commit**
```bash
git add src/ui/components/Sidebar.tsx src/ui/components/TaskRow.tsx src/ui/components/TaskList.tsx
git commit -m "feat(tui): adaptive sidebar width based on content"
```

---

### Task B3: Improve Detail View with Field Editing

**Files:**
- Modify: `src/ui/views/TaskDetailView.tsx`

**Step 1: Add field editing to detail view**

Add keyboard shortcuts to edit fields directly from detail view:
- `e` - open full edit modal
- `t` - set due date
- `D` - set deadline
- `m` - move to project
- `l` - edit labels
- `1-4` - set priority

Add modals and handlers similar to TasksView but for the single task:

```tsx
// Add new state
const [editModal, setEditModal] = useState<"none" | "due" | "deadline" | "move" | "label" | "editFull">("none");

// In useInput, add new shortcuts:
if (input === "e") {
  setEditModal("editFull");
  return;
}
if (input === "t") {
  setEditModal("due");
  return;
}
if (input === "D") {
  setEditModal("deadline");
  return;
}
if (input === "m") {
  setEditModal("move");
  return;
}
if (input === "l") {
  setEditModal("label");
  return;
}
if (input === "1" || input === "2" || input === "3" || input === "4") {
  handleSetPriority(Number(input) as 1 | 2 | 3 | 4);
  return;
}
```

Add handlers that call the API and then `onTaskChanged`:

```tsx
const handleSetPriority = useCallback(async (priority: 1 | 2 | 3 | 4) => {
  try {
    await updateTask(task.id, { priority });
    onTaskChanged(`Priority set to p${priority}`);
  } catch {
    setStatusMessage("Failed to set priority");
  }
}, [task.id, onTaskChanged]);

const handleSetDueDate = useCallback(async (dueString: string) => {
  setEditModal("none");
  try {
    const isRemove = dueString.toLowerCase() === "none" || dueString.toLowerCase() === "clear";
    await updateTask(task.id, { due_string: isRemove ? "no date" : dueString });
    onTaskChanged(isRemove ? "Due date removed" : `Due set to "${dueString}"`);
  } catch {
    setStatusMessage("Failed to set due date");
  }
}, [task.id, onTaskChanged]);
```

**Step 2: Add modals rendering and update footer hints**

```tsx
{editModal === "due" && (
  <InputPrompt prompt="Due date" onSubmit={handleSetDueDate} onCancel={() => setEditModal("none")} />
)}
{editModal === "deadline" && (
  <InputPrompt prompt="Deadline (YYYY-MM-DD)" onSubmit={handleSetDeadline} onCancel={() => setEditModal("none")} />
)}
{editModal === "move" && (
  <ProjectPicker projects={projects} onSelect={handleMoveToProject} onCancel={() => setEditModal("none")} />
)}
{editModal === "label" && (
  <LabelPicker labels={labels} currentLabels={task.labels} onSave={handleLabelsSave} onCancel={() => setEditModal("none")} />
)}
{editModal === "editFull" && (
  <EditTaskModal task={task} projects={projects} labels={labels} onSave={handleEditFull} onCancel={() => setEditModal("none")} />
)}
```

Update footer to show available actions:
```tsx
<Text color="blue">[e]</Text><Text>dit </Text>
<Text color="cyan">[1-4]</Text><Text>prio </Text>
<Text color="green">[t]</Text><Text>due </Text>
<Text color="magenta">[D]</Text><Text>eadline </Text>
<Text color="blue">[m]</Text><Text>ove </Text>
<Text color="magenta">[l]</Text><Text>abel </Text>
```

**Step 3: Import required components and API**

Add imports at top of TaskDetailView:
```tsx
import { updateTask } from "../../api/tasks.ts";
import { EditTaskModal } from "../components/EditTaskModal.tsx";
import { ProjectPicker } from "../components/ProjectPicker.tsx";
import { LabelPicker } from "../components/LabelPicker.tsx";
import type { UpdateTaskParams } from "../../api/types.ts";
```

**Step 4: Commit**
```bash
git add src/ui/views/TaskDetailView.tsx
git commit -m "feat(tui): add field editing shortcuts to detail view"
```

---

### Task B4: Improve Sidebar Visual Hierarchy

**Files:**
- Modify: `src/ui/components/Sidebar.tsx:169-226`

**Step 1: Improve separator styling and add icons**

Replace plain text separators with styled ones. Add emoji-like unicode icons to built-in views:

```tsx
// Update sidebar items with icons
const builtinIcons: Record<string, string> = {
  inbox: "\u2709",     // envelope
  today: "\u2600",     // sun
  upcoming: "\u2B50",  // star
};

const viewIcons: Record<string, string> = {
  "view-stats": "\u2591",     // chart block
  "view-completed": "\u2713", // checkmark
  "view-activity": "\u26A1",  // lightning
};
```

Improve separator rendering:
```tsx
if (item.type === "separator") {
  const sectionName = item.label.replace(/^---\s*/, "").replace(/\s*---$/, "");
  return (
    <Box key={item.id} marginTop={i > 0 ? 1 : 0}>
      <Text color="gray" dimColor bold>{sectionName.toUpperCase()}</Text>
    </Box>
  );
}
```

Add icons to builtin items:
```tsx
const icon = item.type === "builtin" ? builtinIcons[item.id] ?? "" :
             item.type === "view" ? viewIcons[item.id] ?? "" : "";
const displayPrefix = icon ? `${icon} ` : "";
// Use in render: {prefix}{displayPrefix}{displayLabel}
```

**Step 2: Commit**
```bash
git add src/ui/components/Sidebar.tsx
git commit -m "feat(tui): improve sidebar with icons and better separators"
```

---

## Track C: New Features (Agent: feature-expert)

### Task C1: Inline Rename with `r` Key

**Files:**
- Modify: `src/ui/views/TasksView.tsx` (add "rename" modal type and handler)

**Step 1: Add inline rename support**

Add a new modal type "rename" and handler. When user presses `r`, open an InputPrompt pre-filled with the current task content for quick renaming:

```tsx
// Add "rename" to Modal type union:
type Modal = "none" | ... | "rename";

// Add handler:
const handleRenameTask = useCallback(
  async (newContent: string) => {
    if (!selectedTask) return;
    setModal("none");
    const taskId = selectedTask.id;
    const prevTasks = [...tasks];
    onTasksChange(tasks.map((t) => (t.id === taskId ? { ...t, content: newContent } : t)));
    setStatusMessage("Renamed!");
    try {
      await updateTask(taskId, { content: newContent });
      refreshTasks().catch(() => {});
    } catch {
      onTasksChange(prevTasks);
      setStatusMessage("Failed to rename task");
    }
  },
  [selectedTask, tasks, onTasksChange, refreshTasks],
);

// In useInput handler, add:
} else if (input === "r") {
  if (selectedTask) {
    setModal("rename");
  }
}

// Add modal rendering:
{modal === "rename" && selectedTask && (
  <InputPrompt
    prompt="Rename"
    defaultValue={selectedTask.content}
    onSubmit={handleRenameTask}
    onCancel={() => setModal("none")}
  />
)}
```

**Step 2: Add `r` to help overlay**

In HelpOverlay, add to Task Actions section:
```tsx
{ key: "r", description: "Rename task (inline)" },
```

**Step 3: Add `r` to footer hints**

Add to the default footer shortcuts between edit and complete.

**Step 4: Commit**
```bash
git add src/ui/views/TasksView.tsx src/ui/components/HelpOverlay.tsx
git commit -m "feat(tui): add inline rename with 'r' key"
```

---

### Task C2: Auto-Refresh Polling

**Files:**
- Modify: `src/ui/views/TasksView.tsx` (add polling interval)

**Step 1: Add auto-refresh with 60-second interval**

```tsx
// Add auto-refresh effect at the end of TasksView (after all other effects):
useEffect(() => {
  const interval = setInterval(() => {
    // Only auto-refresh when no modal is open and no pending undo
    if (modal === "none" && !lastAction) {
      getTasks()
        .then((newTasks) => onTasksChange(newTasks))
        .catch(() => {}); // silently fail
    }
  }, 60000); // every 60 seconds
  return () => clearInterval(interval);
}, [modal, lastAction, onTasksChange]);
```

Show a subtle sync indicator when auto-refreshing. The existing `isLoading` state already handles this with "Syncing..." in the footer.

**Step 2: Commit**
```bash
git add src/ui/views/TasksView.tsx
git commit -m "feat(tui): add auto-refresh polling every 60 seconds"
```

---

### Task C3: Improve Command Palette with Categories

**Files:**
- Modify: `src/ui/components/CommandPalette.tsx`

**Step 1: Add category support to Command interface**

```tsx
export interface Command {
  name: string;
  description: string;
  action: () => void;
  category?: string; // "task" | "navigation" | "view" | "project" | "bulk"
}
```

**Step 2: Group and render commands by category**

Show category headers in the command palette:

```tsx
// In filtered results rendering, group by category:
const grouped = useMemo(() => {
  const groups = new Map<string, typeof filtered>();
  for (const cmd of filtered) {
    const cat = cmd.category ?? "general";
    const existing = groups.get(cat) ?? [];
    existing.push(cmd);
    groups.set(cat, existing);
  }
  return groups;
}, [filtered]);
```

If no query is entered, show grouped. If query is entered, show flat filtered list as before.

**Step 3: Update command definitions in TasksView**

Add category to each command:
```tsx
{ name: "add", description: "Add a new task", action: ..., category: "task" },
{ name: "search", description: "Search tasks", action: ..., category: "navigation" },
// etc.
```

**Step 4: Commit**
```bash
git add src/ui/components/CommandPalette.tsx src/ui/views/TasksView.tsx
git commit -m "feat(tui): add categories to command palette"
```

---

### Task C4: Enhanced Empty States and Loading

**Files:**
- Modify: `src/ui/App.tsx:100-115`
- Modify: `src/ui/components/TaskList.tsx:128-141`

**Step 1: Improve loading screen with spinner animation**

```tsx
// In App.tsx, replace loading screen:
if (loading) {
  return (
    <Box flexDirection="column" justifyContent="center" alignItems="center" width="100%" height="100%">
      <Text bold color="cyan">Todoist CLI</Text>
      <Box marginTop={1}>
        <Text color="gray">Loading your tasks...</Text>
      </Box>
    </Box>
  );
}
```

**Step 2: Improve empty task list**

```tsx
// In TaskList.tsx, improve empty state:
if (flatTasks.length === 0) {
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor={isFocused ? "blue" : "gray"}
      paddingX={1}
      justifyContent="center"
      alignItems="center"
    >
      <Text color="gray">No tasks here</Text>
      <Box marginTop={1}>
        <Text color="gray" dimColor>Press </Text>
        <Text color="green">a</Text>
        <Text color="gray" dimColor> to add a task or </Text>
        <Text color="cyan">/</Text>
        <Text color="gray" dimColor> to search</Text>
      </Box>
    </Box>
  );
}
```

**Step 3: Commit**
```bash
git add src/ui/App.tsx src/ui/components/TaskList.tsx
git commit -m "feat(tui): improve loading and empty state displays"
```

---

### Task C5: Improve HelpOverlay Layout

**Files:**
- Modify: `src/ui/components/HelpOverlay.tsx`

**Step 1: Update help sections with new keybindings**

Add all new keybindings (r for rename, etc.) and improve the layout to use two-column display when terminal is wide enough:

```tsx
// Add new bindings to existing sections:
// In "Task Actions" section:
{ key: "r", description: "Rename task (inline)" },

// In "Detail View" section:
{ key: "e", description: "Edit full task" },
{ key: "1-4", description: "Set priority" },
{ key: "t", description: "Set due date" },
{ key: "D", description: "Set deadline" },
{ key: "m", description: "Move to project" },
{ key: "l", description: "Edit labels" },
```

Make help overlay width dynamic based on terminal width:
```tsx
const helpWidth = Math.min(60, Math.max(40, (stdout?.columns ?? 80) - 10));
// Use helpWidth instead of hardcoded 50
```

**Step 2: Commit**
```bash
git add src/ui/components/HelpOverlay.tsx
git commit -m "feat(tui): update help overlay with new keybindings and dynamic width"
```

---

## Implementation Order

The tracks are designed to be worked on in parallel by 3 agents:

**Agent nav-expert (Track A):** A1 -> A2 -> A3 -> A4
**Agent visual-expert (Track B):** B1 -> B2 -> B3 -> B4
**Agent feature-expert (Track C):** C1 -> C2 -> C3 -> C4 -> C5

**Dependencies:**
- Tasks within each track must be sequential
- Tracks A, B, C are independent and can run in parallel
- A1 (Breadcrumb) should be done before A4 (Section filtering updates breadcrumb)
- B3 (Detail view editing) needs imports but no cross-track deps
- C5 (Help overlay) should be last since it documents all new bindings

**Final integration:**
After all tracks complete, run `bunx tsc --noEmit` to verify no type errors, then `bun run build` to verify the bundle.
