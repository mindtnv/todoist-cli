# TUI Audit Report

Comprehensive code review of all TUI source files.

---

## P0: Bugs that would crash the TUI or cause incorrect behavior

### P0-1: Priority sort order is inverted
**File:** `src/ui/views/TasksView.tsx:41`
**Issue:** `sortTasks` sorts by `a.priority - b.priority`, which puts priority `1` first. However, in Todoist's API, **priority `4` is "Urgent" and priority `1` is "Normal"** (inverted numbering). Meanwhile, `TaskDetailView.tsx:17-22` and `TaskRow.tsx:12-17` both define priority `1` as "red/Urgent" and priority `4` as "white/Normal" -- these are **internally inconsistent with Todoist API but consistent with each other**. The sort will put "P1 (Urgent)" red tasks first, which is visually correct assuming the local mapping is the intended behavior. However, if the API truly sends `priority: 4` for urgent tasks, then the color mapping is wrong and the sort is also wrong.
**Verdict:** Needs verification against actual API responses. If the API uses `4 = Urgent`, then `priorityColors` and `priorityLabels` mappings are reversed, and the sort needs `b.priority - a.priority`.

### P0-2: `handleFilterInput` replaces ALL tasks globally, breaking other views
**File:** `src/ui/views/TasksView.tsx:210-226`
**Issue:** When user presses `f` and enters a filter query, `handleFilterInput` calls `getTasks({ filter: query })` and then `onTasksChange(filtered)` -- this **replaces the entire `tasks` state in `App.tsx`** with the filtered subset. After this, switching to Inbox/Today/Upcoming in the sidebar will show only the filtered subset, not all tasks. The user has no way to "unfilter" except pressing `r` to refresh.
**Impact:** Navigating away from a filter view silently shows incomplete data.

### P0-3: `buildTree` produces duplicate entries for root tasks
**File:** `src/ui/components/TaskList.tsx:44-61`
**Issue:** The `buildTree` function first collects roots (line 45), then iterates over them pushing each root AND calling `walk(root.id, 1)` (lines 48-50). But `walk` also starts from `byParent.get(parentId)` which includes children grouped by parent. The roots are pushed at depth 0 on line 49. However, `byParent.get(null)` also contains these same root tasks (line 22-28). The `walk(root.id, 1)` call is correct (it walks children of the root). BUT: the issue is that `byParent.get(null)` is never iterated by `walk` -- `walk` is only called on `root.id`. So roots are pushed once on line 49. This is actually correct.

Wait -- re-reading: `roots` on line 45 filters tasks whose `parent_id` is null or not in the set. Then lines 48-50 iterate roots, push each root at depth 0, then walk its children. This is correct and does NOT produce duplicates.
**Verdict:** No bug here on closer inspection. False alarm.

### P0-4: `handleTaskChanged` in App.tsx always navigates back to list
**File:** `src/ui/App.tsx:55-63`
**Issue:** `handleTaskChanged` calls `setView({ type: "list" })` regardless of what changed. This means if the user completes a task from `TaskDetailView`, they're yanked back to the list. This is intentional behavior (return after mutation), but the status message from `TaskDetailView` (e.g., "Task completed!") is lost because a new component mounts.
**Impact:** User never sees confirmation of complete/delete in detail view before being returned to list.

### P0-5: `throwError` in client.ts does not await response body
**File:** `src/api/client.ts:56-64`
**Issue:** `throwError` uses `res.statusText` but never reads `res.body` or `res.text()`. The actual error message from the Todoist API (JSON body with error details) is discarded. The error message only shows the HTTP status code and generic status text.
**Impact:** Users see "API error 400: Bad Request" instead of the actual error reason from Todoist.

---

## P1: Features declared but not working

### P1-1: Edit (`e` key) is declared in Modal type but never triggered
**File:** `src/ui/views/TasksView.tsx:18`
**Issue:** The `Modal` type includes `"edit"` but there is NO keybinding for `e` in `useInput` (lines 331-406), NO handler for edit, and NO modal rendering for `modal === "edit"`. The `updateTask` API function exists in `src/api/tasks.ts:20` but is never imported or used in any TUI file.
**Impact:** Edit functionality is completely missing despite being declared.

### P1-2: HelpOverlay lists `e` as "Edit task" -- but it doesn't
**File:** `src/ui/components/HelpOverlay.tsx`
**Issue:** Actually, the HelpOverlay does NOT list `e` for editing. However, editing is a fundamental expected feature for a task manager TUI. The help overlay accurately reflects what is implemented. No mismatch here.
**Verdict:** The help overlay is accurate. But the absence of edit is a significant missing feature (see P2).

### P1-3: HelpOverlay closes on ANY key press
**File:** `src/ui/components/HelpOverlay.tsx:67-69`
**Issue:** The `useInput` callback calls `onClose()` unconditionally on ANY input. This means the help overlay cannot be scrolled if it's larger than the terminal. If the user presses any key accidentally (e.g., trying to read), the help closes immediately.
**Impact:** Help overlay is unusable on small terminals where content doesn't fit.

### P1-4: Search modal in `useInput` guard is incomplete
**File:** `src/ui/views/TasksView.tsx:332-336`
**Issue:** The `useInput` handler returns early when `modal === "search" || modal === "command"` to avoid intercepting keystrokes. However, when `modal === "add"` or `modal === "filter"`, there is NO early return for these. Instead, `modal !== "none"` on line 336 blocks all input. This means keybindings like `q` (quit) will NOT work during add/filter/delete modals, which is correct behavior. But for `modal === "search"` and `modal === "command"`, the explicit check on line 332 is redundant because line 336 would also catch them. The distinction exists because `search` and `command` modals handle their own input via `useInput` in their own components, while `add`/`filter` use `InputPrompt` which also has its own `useInput`.
**Verdict:** The logic works but is confusing. No actual bug, but `InputPrompt` and `ConfirmDialog` also call `useInput`, meaning MULTIPLE `useInput` hooks fire simultaneously. In Ink, all `useInput` handlers fire for every keypress. This means when `ConfirmDialog` is open and user presses `y`, both the `ConfirmDialog` handler AND the `TasksView` handler fire. The `TasksView` handler returns early on line 336 (`modal !== "none"`), so it's safe. But this is fragile.

### P1-5: `InputPrompt` does not allow submitting empty string for search clear
**File:** `src/ui/components/InputPrompt.tsx:21-23`
**Issue:** When user presses Enter in `InputPrompt`, it only calls `onSubmit` if `value.trim()` is truthy. This means the user CANNOT submit an empty search to clear it. They must press Escape to cancel. For the search modal this is fine (Escape clears search via `handleSearchCancel`). For the filter modal, pressing Enter with empty input does nothing -- the user must press Escape. This is acceptable but slightly unexpected.

### P1-6: `StatusMessage` never clears automatically
**File:** `src/ui/views/TasksView.tsx:64`
**Issue:** `statusMessage` is set by various handlers ("Task created!", "Refreshing...", "Failed to...") but is never cleared on a timer or after the next action. The message persists indefinitely until another action overwrites it.
**Impact:** Stale status messages remain visible, causing confusion (e.g., "Task completed!" stays even after navigating to different tasks).

---

## P2: Missing features that should exist

### P2-1: No edit task functionality
**Impact:** Users cannot edit task content, description, priority, due date, or labels from the TUI. This is the most critical missing feature for a task manager.
**What's needed:** `e` keybinding to open an edit modal, import `updateTask` from API, prompt for fields.

### P2-2: No way to add task with project/priority/due date/labels
**File:** `src/ui/views/TasksView.tsx:133-146`
**Issue:** `handleAddTask` only passes `{ content }` to `createTask`. The `CreateTaskParams` type supports `project_id`, `priority`, `due_string`, `labels`, etc. but none of these are exposed in the TUI add flow.
**Impact:** All tasks are created in the default project with no priority, no due date, no labels.

### P2-3: Sections not displayed in task list or sidebar
**Issue:** The `Section` type and `getSections` API exist but are never used in the TUI. Tasks have `section_id` but it's never displayed or used for grouping.

### P2-4: Completed tasks view not available
**Issue:** `getCompletedTasks` API exists but is not used in the TUI. There is no way to view completed tasks.

### P2-5: Activity log not available in TUI
**Issue:** `getActivity` API exists but is not used in the TUI.

### P2-6: Stats/karma not displayed
**Issue:** `getStats` API exists but is not used in the TUI. No karma or productivity stats shown.

### P2-7: Project colors not used in sidebar or task list
**File:** `src/ui/components/Sidebar.tsx:100`
**Issue:** Projects have a `color` field but the sidebar renders all projects in "cyan". The color is never used.

### P2-8: Label colors not used
**Issue:** Labels have a `color` field but labels in `TaskRow` are always rendered in "magenta".

### P2-9: No ability to add comments from TUI
**Issue:** `createComment` API exists. Comments are displayed in `TaskDetailView` but there is no way to add a new comment.

### P2-10: No recurring task indicator
**File:** `src/ui/components/TaskRow.tsx`
**Issue:** `Due.is_recurring` is available in the type but never displayed. Users cannot see which tasks are recurring.

### P2-11: Sidebar does not show task counts
**Issue:** The sidebar shows project and label names but not how many tasks are in each.

### P2-12: No keyboard shortcut for quick project/label assignment
**Issue:** No way to move a task to a different project or add/remove labels via keyboard.

### P2-13: TaskDetailView is not scrollable
**File:** `src/ui/views/TaskDetailView.tsx`
**Issue:** If a task has many comments or subtasks, the view will overflow the terminal. There is no scroll mechanism.

### P2-14: No `G`/`gg` vim-style navigation (go to top/bottom)
**Issue:** Only `j`/`k` (single step) navigation exists. No way to jump to first/last task.

---

## P3: Polish / nice-to-have improvements

### P3-1: Unnecessary `React` imports in all files
**Issue:** `tsconfig.json` has `"jsx": "react-jsx"` which automatically imports the JSX runtime. All 11 TUI files have `import React from "react"` or `import React, { ... } from "react"` which is unnecessary. The named imports (`useState`, `useEffect`, etc.) are still needed, but `React` default import is not.
**Files affected:** All 11 TUI files.

### P3-2: `viewHeight` in TaskList is hardcoded default of 20
**File:** `src/ui/components/TaskList.tsx:71`
**Issue:** `viewHeight` defaults to 20 and is never overridden by any parent component. The actual terminal height is not measured, so on small terminals the scroll range is wrong, and on large terminals space is wasted.

### P3-3: Sidebar has fixed width of 24 columns
**File:** `src/ui/components/Sidebar.tsx:79`
**Issue:** Long project names will be truncated. No dynamic sizing.

### P3-4: Sort by priority doesn't indicate ascending/descending or allow toggle
**Issue:** Sort is always ascending. No way to reverse the sort direction.

### P3-5: `handleSearchSubmit` is a no-op
**File:** `src/ui/views/TasksView.tsx:228-233`
**Issue:** `handleSearchSubmit` only calls `setModal("none")`. The actual search query is set in the inline callback on line 486 (`setSearchQuery(val)`). The named handler is misleading.

### P3-6: CommandPalette `delete` command calls `setModal` twice in sequence
**File:** `src/ui/views/TasksView.tsx:301`
**Issue:** `action: () => { setModal("none"); setModal("delete"); }` -- the `setModal("none")` is immediately overwritten by `setModal("delete")`. React batches these, so only `"delete"` takes effect. The `setModal("none")` is dead code. Same issue on line 308 for `"bulkDelete"`.

### P3-7: No debounce on `refreshTasks`
**Issue:** Pressing `r` rapidly triggers multiple concurrent API calls. No rate limiting or debouncing.

### P3-8: `useInput` handler in `TasksView` does not handle `e` key
**File:** `src/ui/views/TasksView.tsx:331-406`
**Issue:** There's no `else if (input === "e")` branch. This means pressing `e` while focused on tasks does nothing. It's not a bug per se, but the `Modal` type includes `"edit"`, suggesting it was planned.

### P3-9: Silent error swallowing in `handleTaskChanged`
**File:** `src/ui/App.tsx:59`
**Issue:** The catch block is empty (`catch { // silently fail }`). If refresh fails after a mutation, the task list becomes stale with no indication to the user.

### P3-10: Due date "Today" filter uses local timezone
**File:** `src/ui/views/TasksView.tsx:76`
**Issue:** `new Date().toISOString().slice(0, 10)` gives the date in UTC, not the user's local timezone. A task due "today" in the user's timezone might not match if they're in UTC+/- offsets.

### P3-11: `task.is_completed` is always false for active tasks
**File:** `src/ui/components/TaskRow.tsx:20`
**Issue:** `getTasks()` only returns active (non-completed) tasks from the API. The checkbox `task.is_completed ? checkbox_checked : checkbox_unchecked` will always show unchecked. The completed checkbox logic is dead code in the main task list (but useful in `TaskDetailView` subtasks).

### P3-12: No loading spinner during async operations
**Issue:** When completing, deleting, or refreshing tasks, the only indicator is the status message text. There's no spinner or visual loading state on the task list itself.

### P3-13: Escape key behavior on TaskDetailView is too aggressive
**File:** `src/ui/views/TaskDetailView.tsx:99`
**Issue:** `key.backspace` and `key.delete` both trigger `onBack()`. This means if the user were in an input field (e.g., future comment add), pressing backspace would navigate away instead of deleting text.

### P3-14: No empty state guidance
**Issue:** When there are no tasks, the empty state just says "No tasks". It doesn't suggest pressing `a` to add one or any other guidance.

### P3-15: `Upcoming` filter shows all tasks with any due date
**File:** `src/ui/views/TasksView.tsx:79-80`
**Issue:** "Upcoming" filter returns `t.due !== null` -- this includes tasks due today and overdue tasks, not just future tasks. A proper "Upcoming" view should show tasks due today and in the future, sorted by date. Currently it shows all tasks that have any due date, which includes overdue ones.

### P3-16: Tab key behavior when modal is open
**File:** `src/ui/views/TasksView.tsx:332-336`
**Issue:** When `modal === "add"` (or other InputPrompt modals), the `useInput` handler returns early on line 336. But `Tab` is checked on line 338 which is AFTER the early return. This means Tab does not switch panels when a modal is open, which is correct behavior. However, the `InputPrompt` component does not handle Tab either, so pressing Tab inserts nothing and does nothing -- it's silently swallowed by Ink. This is fine.

---

## Summary

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 3 | Filter replaces global tasks; priority mapping may be inverted; status lost on view transition |
| P1 | 3 | Edit declared but unimplemented; help closes on any key; status never auto-clears |
| P2 | 14 | No edit, no rich add, no sections/completed/activity/stats, no colors, no comments, no scroll |
| P3 | 16 | Unnecessary imports, hardcoded heights, dead code, timezone issues, missing UX polish |
