# TUI Feature Expansion Plan

> Based on code audit of all TUI source files, competitor research (Taskwarrior, Dooit, sachaos/todoist, Terminalist), UX patterns analysis, and available Todoist API capabilities.
>
> Date: 2026-02-06

---

## 1. MUST HAVE (Critical for daily use)

### 1.1 Full Task Edit Modal (keybinding: `e`)

**What it does:** Opens a multi-field edit form for the selected task. Currently `e` triggers edit-content-only via a single-line InputPrompt. This should be expanded into a proper multi-field editor covering all mutable task fields.

**Fields to edit:**
- Content (text)
- Description (multi-line text)
- Priority (1-4 selector)
- Due date (natural language input, same as quick-add)
- Labels (add/remove from existing labels with autocomplete)
- Project (move task to a different project)

**Files to modify:**
- `src/ui/views/TasksView.tsx` -- change `handleEditTask` to pass full `UpdateTaskParams`, update modal rendering
- `src/ui/components/EditTaskModal.tsx` -- **NEW FILE** -- multi-field modal with Tab to switch between fields
- `src/ui/views/TaskDetailView.tsx` -- add `e` keybinding to open edit from detail view

**UI mockup:**
```
+---------------------------------------------------+
| Edit Task                                         |
|                                                   |
| Content:  [Buy groceries for dinner            ]  |
| Desc:     [Need milk, eggs, bread              ]  |
| Priority: [*P1] [P2] [P3] [P4]                   |
| Due:      [tomorrow at 6pm                     ]  |
| Labels:   [@shopping] [@errands] [+ add...]       |
| Project:  [Personal v]                            |
|                                                   |
| [Tab] next field  [Enter] save  [Esc] cancel      |
+---------------------------------------------------+
```

**Complexity:** L (multi-field form with different input types, focus management)

---

### 1.2 Add Comment from Detail View (keybinding: `n` in detail view)

**What it does:** Allows adding a new comment to a task from the TaskDetailView. Comments are currently displayed read-only. The `createComment` API function already exists and is unused in the TUI.

**Files to modify:**
- `src/ui/views/TaskDetailView.tsx` -- add `n` keybinding, render InputPrompt for comment, call `createComment`, refresh comments list

**UI mockup:**
```
+---------------------------------------------------+
| Task Detail                                       |
| ...                                               |
| Comments (2)                                      |
|   2026-02-05  Called vendor, waiting for callback  |
|   2026-02-06  Vendor confirmed delivery for Fri   |
|                                                   |
+---------------------------------------------------+
| New comment: [Shipment tracking #12345          ] |
+---------------------------------------------------+
| [n]ew comment [c]omplete [d]elete [Esc] back      |
+---------------------------------------------------+
```

**Complexity:** S (reuse InputPrompt, call existing API)

---

### 1.3 Move Task to Project (keybinding: `m`)

**What it does:** Opens a project picker to move the currently selected task (or bulk-selected tasks) to a different project. This is essential for GTD "Inbox processing" -- the core daily workflow of triaging tasks from Inbox into organized projects.

**Files to modify:**
- `src/ui/views/TasksView.tsx` -- add `m` keybinding, new modal state `"move"`
- `src/ui/components/ProjectPicker.tsx` -- **NEW FILE** -- scrollable project list with fuzzy filter, Enter to select
- `src/api/tasks.ts` -- `updateTask` already supports project changes but `UpdateTaskParams` needs `project_id` added

**UI mockup:**
```
+----------------------------------+
| Move to project                  |
| > [filter...                  ]  |
|                                  |
|   > Inbox                        |
|     Work                         |
|     Personal                     |
|     Shopping                     |
|     Side Project                 |
|                                  |
| [Enter] select  [Esc] cancel     |
+----------------------------------+
```

**Complexity:** M (new component, fuzzy filter, bulk support)

---

### 1.4 Set/Change Priority Inline (keybinding: `1`/`2`/`3`/`4`)

**What it does:** Pressing a number key 1-4 immediately sets the priority of the selected task (or all bulk-selected tasks). No modal needed -- instant action with status confirmation. This matches the Todoist web app's keyboard shortcuts and is the fastest way to triage tasks.

**Files to modify:**
- `src/ui/views/TasksView.tsx` -- add `1`/`2`/`3`/`4` input handlers, call `updateTask` with new priority, support bulk update

**Complexity:** S (simple handler, existing API)

---

### 1.5 Set/Change Due Date (keybinding: `t`)

**What it does:** Opens a quick input for natural language due date entry ("today", "tomorrow", "next monday", "Jan 15"). Uses the same natural language processing that Todoist's API supports via `due_string`. Works for single or bulk-selected tasks.

**Files to modify:**
- `src/ui/views/TasksView.tsx` -- add `t` keybinding, new modal state `"due"`, call `updateTask` with `due_string`

**UI mockup:**
```
+---------------------------------------------------+
| Due date: [tomorrow at 3pm                      ] |
+---------------------------------------------------+
```

**Complexity:** S (reuse InputPrompt, pass `due_string` to API)

---

### 1.6 Undo Last Action (keybinding: `u` or `Ctrl-z`)

**What it does:** Reverses the last destructive action (complete, delete, move, priority change) within a 10-second window. After completing a task, pressing `u` reopens it. After deleting, pressing `u` recreates it. Shows countdown in status bar: "Task completed. Press u to undo (8s)".

The Todoist API supports `reopen` (POST `/tasks/{id}/reopen`) which is already defined in types but not used. For delete, we store a snapshot and recreate.

**Files to modify:**
- `src/ui/views/TasksView.tsx` -- add undo stack (last action + timer), `u` keybinding
- `src/api/tasks.ts` -- add `reopenTask` function

**UI mockup (status bar):**
```
| [a]dd [e]dit [c]omplete [d]elete      Task completed! [u]ndo (7s) |
```

**Complexity:** M (undo stack, timer, reopen API, recreate for delete)

---

### 1.7 Sections Display and Grouping

**What it does:** Shows sections within project views. Tasks are grouped under their section headers. The `Section` type and `getSections` API already exist but are completely unused. This is critical for users who organize tasks by section (e.g., "Backlog", "In Progress", "Done").

**Files to modify:**
- `src/ui/views/TasksView.tsx` -- fetch sections, group tasks by `section_id`, pass to TaskList
- `src/ui/components/TaskList.tsx` -- render section headers between task groups
- `src/ui/App.tsx` -- fetch sections alongside tasks/projects/labels

**UI mockup:**
```
+---------------------------------------------------+
| Work                        Sort: Priority         |
+---------------------------------------------------+
| Tasks (12)                                         |
|                                                    |
| --- Backlog ---                                    |
|   [ ] Design new landing page   p2  Mar 1  @design |
|   [ ] Write API docs            p3         @docs   |
|                                                    |
| --- In Progress ---                                |
|   [ ] Fix auth bug              p1  Today  @backend |
|   [ ] Update dependencies       p2  Feb 10          |
|                                                    |
| --- Done ---                                       |
|   (empty)                                          |
+---------------------------------------------------+
```

**Complexity:** M (fetch sections, group/sort logic, render headers)

---

### 1.8 Add Subtask (keybinding: `A` -- Shift-a)

**What it does:** Creates a new task as a child of the currently selected task. Uses the same quick-add syntax but sets `parent_id` to the current task's ID. This completes the subtask workflow -- currently subtasks are displayed in both TaskList (tree view) and TaskDetailView but there's no way to create them from the TUI.

**Files to modify:**
- `src/ui/views/TasksView.tsx` -- add `A` (Shift-a) keybinding, open add modal with `parent_id` pre-set
- `src/ui/views/TaskDetailView.tsx` -- add `a` keybinding to add subtask from detail view

**Complexity:** S (same as add task, but pass `parent_id`)

---

## 2. SHOULD HAVE (Important quality-of-life)

### 2.1 Task Detail View Scrolling (keybinding: `j`/`k` in detail view)

**What it does:** Makes the TaskDetailView scrollable so long descriptions, many subtasks, and many comments don't overflow the terminal. Uses the same j/k navigation pattern as the task list.

**Files to modify:**
- `src/ui/views/TaskDetailView.tsx` -- add scroll offset state, j/k handlers, viewport clipping

**Complexity:** M (scroll state, viewport calculation, content clipping)

---

### 2.2 Recurring Task Indicator

**What it does:** Shows a recurring icon (e.g., `↻` or `[R]`) next to tasks that have `due.is_recurring === true`. Also shows the recurrence pattern in the detail view (e.g., "every weekday at 9am").

**Files to modify:**
- `src/ui/components/TaskRow.tsx` -- check `task.due?.is_recurring`, render indicator
- `src/ui/views/TaskDetailView.tsx` -- show `due.string` as recurrence pattern

**UI mockup (in task list):**
```
  ☐ Daily standup  ↻  [2026-02-07]  @work
  ☐ Buy groceries     [today]       @shopping
```

**Complexity:** S (conditional render)

---

### 2.3 Label Management (keybinding: `l`)

**What it does:** Opens a label picker to add/remove labels from the selected task. Shows all available labels with checkmarks for currently applied ones. Supports fuzzy filter to find labels quickly.

**Files to modify:**
- `src/ui/views/TasksView.tsx` -- add `l` keybinding, new modal state `"label"`
- `src/ui/components/LabelPicker.tsx` -- **NEW FILE** -- checkbox list of labels with fuzzy filter
- `src/ui/views/TaskDetailView.tsx` -- add `l` keybinding

**UI mockup:**
```
+----------------------------------+
| Labels                           |
| > [filter...                  ]  |
|                                  |
|   [x] @shopping                  |
|   [x] @errands                   |
|   [ ] @work                      |
|   [ ] @waiting                   |
|   [ ] @next                      |
|                                  |
| [Space] toggle [Enter] save [Esc] cancel |
+----------------------------------+
```

**Complexity:** M (new component, toggle state, fuzzy filter)

---

### 2.4 Productivity Stats Dashboard (keybinding: `:stats` via command palette)

**What it does:** Shows a dashboard with karma, completed today/this week/total, and a simple ASCII bar chart of daily completions. Uses the existing `getStats` and `getCompletedTasks` API functions which are currently unused in the TUI.

**Files to modify:**
- `src/ui/views/StatsView.tsx` -- **NEW FILE** -- stats dashboard view
- `src/ui/App.tsx` -- add `stats` view type, navigation from command palette

**UI mockup:**
```
+---------------------------------------------------+
| Productivity Stats                                 |
|                                                    |
| Karma: 12,450 (up)   Completed today: 7           |
| Total completed: 1,234                             |
|                                                    |
| Last 7 days:                                       |
|   Mon  ████████████  12                            |
|   Tue  ██████████    10                            |
|   Wed  ██████        6                             |
|   Thu  ████████████████  16                        |
|   Fri  ██████████    10                            |
|   Sat  ████          4                             |
|   Sun  ██            2                             |
|                                                    |
| [Esc] back                                         |
+---------------------------------------------------+
```

**Complexity:** M (new view, API integration, chart rendering)

---

### 2.5 Completed Tasks View (keybinding: `:completed` via command palette)

**What it does:** Shows recently completed tasks with completion timestamps. Uses the existing `getCompletedTasks` API. Allows users to see what they've accomplished -- essential for weekly reviews and productivity tracking.

**Files to modify:**
- `src/ui/views/CompletedView.tsx` -- **NEW FILE** -- completed tasks list, grouped by date
- `src/ui/App.tsx` -- add `completed` view type

**UI mockup:**
```
+---------------------------------------------------+
| Completed Tasks                                    |
|                                                    |
| --- Today ---                                      |
|   ✓ Fix login bug                    2:34 PM       |
|   ✓ Review PR #42                    11:15 AM      |
|   ✓ Send invoice                     9:00 AM       |
|                                                    |
| --- Yesterday ---                                  |
|   ✓ Update docs                      5:20 PM       |
|   ✓ Deploy v2.1                      3:45 PM       |
|                                                    |
| [Esc] back                                         |
+---------------------------------------------------+
```

**Complexity:** M (new view, date grouping, API integration)

---

### 2.6 Select All / Deselect All (keybindings: `Ctrl-a` / `Ctrl-n`)

**What it does:** `Ctrl-a` selects all visible tasks in the current filtered view. `Ctrl-n` clears all selections. Combined with existing `c` (complete) and `d` (delete), this enables powerful bulk operations like "complete all tasks in this section" or "delete all overdue tasks".

**Files to modify:**
- `src/ui/views/TasksView.tsx` -- add Ctrl-a and Ctrl-n handlers in useInput

**Complexity:** S (simple set operations on `selectedIds`)

---

### 2.7 Activity Log View (keybinding: `:activity` or `:log` via command palette)

**What it does:** Shows the recent activity log -- task completions, creations, updates, deletions. Uses the existing `getActivity` API function. Answers "what did I do today/this week?" -- critical for time tracking and accountability.

**Files to modify:**
- `src/ui/views/ActivityView.tsx` -- **NEW FILE** -- activity timeline view
- `src/ui/App.tsx` -- add `activity` view type

**UI mockup:**
```
+---------------------------------------------------+
| Activity Log                                       |
|                                                    |
| 2:34 PM  completed  Fix login bug                  |
| 2:30 PM  updated    Fix login bug (priority: p1)   |
| 1:15 PM  created    Write unit tests               |
| 11:20 AM completed  Review PR #42                   |
| 10:00 AM added      Fix login bug                   |
|                                                    |
| [Esc] back                                          |
+---------------------------------------------------+
```

**Complexity:** M (new view, event type formatting, timestamp display)

---

### 2.8 Dynamic Terminal Height Detection

**What it does:** Replaces the hardcoded `viewHeight = 20` in TaskList with actual terminal dimensions measured via `process.stdout.rows`. Recalculates on terminal resize. Fixes scroll calculation on small/large terminals.

**Files to modify:**
- `src/ui/components/TaskList.tsx` -- use `useStdout()` from Ink to get terminal dimensions, pass as prop or detect internally
- `src/ui/views/TasksView.tsx` -- pass terminal height down if needed

**Complexity:** S (Ink provides `useStdout` hook)

---

## 3. NICE TO HAVE (Polish)

### 3.1 Open in Browser (keybinding: `o`)

**What it does:** Opens the selected task's Todoist URL in the default browser. Every `Task` object has a `url` field that links to the Todoist web app. Useful for quick access to attachments, rich formatting, or sharing.

**Files to modify:**
- `src/ui/views/TasksView.tsx` -- add `o` keybinding, use `Bun.spawn(["open", task.url])` (macOS) or platform-appropriate open command
- `src/ui/views/TaskDetailView.tsx` -- add `o` keybinding

**Complexity:** S (one-liner shell command)

---

### 3.2 Collapsible Subtask Tree (keybinding: `h`/`l` or `Left`/`Right`)

**What it does:** Allows collapsing/expanding parent tasks in the tree view. `h` or `Left` collapses (hides children), `l` or `Right` expands. A collapsed parent shows a `+` indicator and child count. Reduces visual noise for projects with deep nesting.

**Files to modify:**
- `src/ui/components/TaskList.tsx` -- add collapsed state set, filter out children of collapsed parents, add `+`/`-` indicators
- `src/ui/views/TasksView.tsx` -- pass collapse toggle handler

**UI mockup:**
```
  ☐ Write blog post (3 subtasks)        [+]
  ☐ Another task
  ☐ Parent task                          [-]
    └ ☐ Subtask 1
    └ ☐ Subtask 2
```

**Complexity:** M (collapsed state tracking, tree filtering, indicators)

---

### 3.3 Notification/Toast System

**What it does:** Replaces the current simple `statusMessage` string with a proper toast notification system. Toasts auto-dismiss after 3 seconds, stack if multiple appear, and have color-coded severity (green=success, yellow=warning, red=error). The existing auto-clear timer in TasksView is already a basic version of this; this formalizes it.

**Files to modify:**
- `src/ui/components/Toast.tsx` -- **NEW FILE** -- toast component with auto-dismiss animation
- `src/ui/views/TasksView.tsx` -- replace `statusMessage` with toast queue

**Complexity:** S (component wrapper around existing pattern)

---

### 3.4 Sync Indicator and Auto-Refresh

**What it does:** Shows a small indicator in the header showing when data was last fetched from the API (e.g., "synced 2m ago"). Optionally auto-refreshes every 5 minutes in the background. Gives users confidence their data is current.

**Files to modify:**
- `src/ui/views/TasksView.tsx` -- add `lastSyncTime` state, display in header, optional setInterval for auto-refresh
- `src/ui/App.tsx` -- track sync timestamps

**UI mockup (header):**
```
| Inbox | Sort: Priority               synced 2m ago |
```

**Complexity:** S (timestamp tracking, interval timer)

---

### 3.5 Responsive Sidebar (collapse on narrow terminals)

**What it does:** When terminal width is below 80 columns, the sidebar auto-hides. Users can toggle it with `Tab`. When hidden, current view name shows as a breadcrumb in the header. Prevents the TUI from being unusable on small terminal windows.

**Files to modify:**
- `src/ui/views/TasksView.tsx` -- detect terminal width via `useStdout`, conditionally render Sidebar
- `src/ui/components/Sidebar.tsx` -- no changes needed (just not rendered)

**Complexity:** S (conditional rendering based on terminal width)

---

## Summary Table

| # | Feature | Tier | Key | Complexity | New Files |
|---|---------|------|-----|------------|-----------|
| 1.1 | Full task edit modal | MUST | `e` | L | `EditTaskModal.tsx` |
| 1.2 | Add comment from detail | MUST | `n` | S | -- |
| 1.3 | Move task to project | MUST | `m` | M | `ProjectPicker.tsx` |
| 1.4 | Set priority inline | MUST | `1-4` | S | -- |
| 1.5 | Set due date | MUST | `t` | S | -- |
| 1.6 | Undo last action | MUST | `u` | M | -- |
| 1.7 | Sections display | MUST | -- | M | -- |
| 1.8 | Add subtask | MUST | `A` | S | -- |
| 2.1 | Detail view scrolling | SHOULD | `j/k` | M | -- |
| 2.2 | Recurring task indicator | SHOULD | -- | S | -- |
| 2.3 | Label management | SHOULD | `l` | M | `LabelPicker.tsx` |
| 2.4 | Stats dashboard | SHOULD | `:stats` | M | `StatsView.tsx` |
| 2.5 | Completed tasks view | SHOULD | `:completed` | M | `CompletedView.tsx` |
| 2.6 | Select all / deselect all | SHOULD | `Ctrl-a/n` | S | -- |
| 2.7 | Activity log view | SHOULD | `:log` | M | `ActivityView.tsx` |
| 2.8 | Dynamic terminal height | SHOULD | -- | S | -- |
| 3.1 | Open in browser | NICE | `o` | S | -- |
| 3.2 | Collapsible subtree | NICE | `h/l` | M | -- |
| 3.3 | Toast notifications | NICE | -- | S | `Toast.tsx` |
| 3.4 | Sync indicator | NICE | -- | S | -- |
| 3.5 | Responsive sidebar | NICE | -- | S | -- |

## Implementation Order Recommendation

Start with the highest-impact, lowest-complexity items to maximize velocity:

**Sprint 1 (quick wins):**
1. 1.4 Set priority inline (`1-4` keys) -- S
2. 1.5 Set due date (`t` key) -- S
3. 1.8 Add subtask (`A` key) -- S
4. 1.2 Add comment (`n` key) -- S
5. 2.2 Recurring indicator -- S
6. 2.6 Select all / deselect -- S
7. 2.8 Dynamic terminal height -- S

**Sprint 2 (core features):**
8. 1.3 Move to project (`m` key) -- M
9. 1.7 Sections display -- M
10. 1.6 Undo last action (`u` key) -- M
11. 2.1 Detail view scrolling -- M

**Sprint 3 (rich editing + views):**
12. 1.1 Full task edit modal (`e` key) -- L
13. 2.3 Label management (`l` key) -- M
14. 2.4 Stats dashboard -- M
15. 2.5 Completed tasks view -- M

**Sprint 4 (polish):**
16. 2.7 Activity log view -- M
17. 3.1 Open in browser -- S
18. 3.2 Collapsible subtree -- M
19. 3.3-3.5 Toast, sync indicator, responsive sidebar -- S each

## Keybinding Map (Proposed Final State)

```
Navigation:
  j / Down       Move down
  k / Up         Move up
  h / Left       Collapse subtree (in task list)
  l / Right      Expand subtree (in task list)
  gg             Go to first task
  G              Go to last task
  Ctrl-d         Page down
  Ctrl-u         Page up
  Tab            Switch panel (sidebar/tasks)
  Enter          Open task detail

Task Actions:
  a              Add new task (quick-add syntax)
  A (Shift-a)    Add subtask under selected task
  e              Edit task (full multi-field modal)
  c              Complete task (or bulk complete)
  d              Delete task (with confirmation)
  u              Undo last action
  1/2/3/4        Set priority (instant)
  t              Set due date
  m              Move to project
  l              Add/remove labels
  o              Open in browser
  n              Add comment (in detail view)

Selection:
  Space          Toggle select current task
  v              Range select (press twice)
  Ctrl-a         Select all visible
  Ctrl-n         Clear all selection

Views & Filters:
  /              Fuzzy search tasks
  f              API filter query
  s              Sort menu
  :              Command palette
  :stats         Productivity stats
  :completed     Completed tasks
  :log           Activity log
  ?              Help overlay
  r              Refresh
  q              Quit
  Esc            Cancel / go back / clear
```
