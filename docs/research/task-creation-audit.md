# Task Creation Flow Audit

## 1. CLI: `src/cli/task.ts` -- `add` subcommand (lines 241-299)

### What works well
- Quick-add syntax (e.g. `'Buy milk tomorrow #Shopping p1 @errands'`) is supported via `parseQuickAdd` and works as a single string input
- Explicit flags (`-p`, `-P`, `-l`, `-d`, `--deadline`, `--parent`, `--section`) override the quick-add parser -- clean separation
- `--quiet` mode prints only the task ID, good for scripting/piping
- Project and section names are resolved by name or ID transparently via `resolveProjectOpt`/`resolveSectionOpt`

### What's missing or awkward
- **No `--description` flag.** `CreateTaskParams` has `description` but the `add` command never sets it. Users cannot add a description from the CLI at all.
- **Priority default is inverted.** The CLI defaults `priority` to `4`, but in Todoist API semantics, `4` is "Urgent" (p1 visually). When the user provides no priority, the task is created as urgent -- this is almost certainly a bug:
  ```ts
  // line 258 -- defaulting to 4 means "Urgent"
  let priority: Priority = 4;
  ```
  The correct default for a normal-priority task is `1` (Todoist API: 1=normal, 4=urgent).
- **Quick-add vs flags logic is fragile.** If the user passes `--due` but types `#Shopping` in the text, the `#Shopping` is NOT parsed (because `hasExplicitFlags` is true). This is unexpected -- partial mixing should work.
- **No `--dry-run` or preview.** The user has no way to see what `parseQuickAdd` will extract before committing.
- **Section not resolved when using quick-add.** Quick-add can extract project (`#name`) but there's no section syntax (`/SectionName` or similar). Section can only be set via `--section` flag.
- **Labels flag is single-value accumulator.** You must repeat `-l errands -l shopping` instead of `-l errands,shopping`.
- **No confirmation or undo.** CLI `add` commits immediately with no way to undo.

### Pain points
- The `hasExplicitFlags` check (line 254) uses `opts.label.length > 0` but doesn't include `opts.deadline`, `opts.parent`, or `opts.section`, so those flags alone don't trigger the "explicit" path. This means if you pass only `--deadline 2026-03-01 "Buy milk tomorrow #Shopping"`, the quick-add parser still runs and extracts "tomorrow" as due date AND `#Shopping` as project -- but deadline is also set from the flag. Confusing interaction.

---

## 2. TUI: `src/ui/views/TasksView.tsx` -- `handleAddTask` (lines 243-265)

### What works well
- Uses `parseQuickAdd` consistently with the CLI
- Resolves `project_name` from the parsed result
- Proper status messages ("Creating task...", "Task created!", "Failed to create task")
- Refresh after creation keeps the list in sync

### What's missing or awkward
- **Add modal is a single-line `InputPrompt`** (line 848-853). The user types the entire task as one line of quick-add text. No field-by-field guidance, no autocomplete for projects/labels.
- **No way to set description** during task creation in TUI
- **No way to set section** during task creation in TUI
- **No way to set parent_id** during task creation from the add modal (there IS `addSubtask` via `A`, but only when a task is selected)
- **No way to set deadline** during task creation
- **The `add` modal (InputPrompt) and `editFull` modal (EditTaskModal) are completely different UX patterns.** Adding is single-line text; editing is a rich multi-field form. This inconsistency means:
  - New users learn quick-add syntax just to create
  - Then see a totally different interface when editing
  - There's no "advanced add" that uses the EditTaskModal form
- **No project context awareness.** When viewing a specific project, pressing `a` opens the add modal but does NOT default the project to the currently viewed project. The task may land in Inbox if no `#project` is typed.
- **Task creation always goes to Inbox by default.** The `handleAddTask` function does not pass the current `filterProjectId` to `createTask`. Compare with `handleAddSubtask` which does set `parent_id`.
- **No "create and continue" mode** -- each `a` opens modal, creates, closes. If adding many tasks, user has to press `a` each time.

### Specific code pattern
```tsx
// lines 248-256 -- note: no project_id passed from current view context
const handleAddTask = useCallback(
  async (input: string) => {
    setModal("none");
    const parsed = parseQuickAdd(input);
    const params: CreateTaskParams = { content: parsed.content };
    // ... parsed fields applied, but no filterProjectId fallback
    await createTask(params);
```

---

## 3. `src/ui/components/InputPrompt.tsx` (input component used for add)

### What works well
- Clean, minimal text input with cursor support (left/right arrows, backspace)
- Visual cursor rendering with highlight
- Escape to cancel, Enter to submit
- Supports defaultValue for edit use-case

### What's missing or awkward
- **No hint/placeholder text.** When the user opens "New task" modal, the input is blank with no guidance on quick-add syntax. A placeholder like `"Buy milk tomorrow #Shopping p1 @errands"` would help discoverability.
- **No multi-line support.** Can't enter description or multi-line content.
- **No autocomplete/suggestions.** Typing `#` doesn't show project names; typing `@` doesn't show labels. This is a significant UX gap -- the user must memorize exact project and label names.
- **No live preview of parsed result.** As the user types `Buy milk tomorrow p2 #Shopping`, there's no visual feedback showing "Content: Buy milk | Due: tomorrow | Priority: P2 | Project: Shopping".
- **Submit is blocked if value is empty** (line 21-23), which is correct, but there's no visual indication that the input is too short.
- **No Home/End key support.** Only left/right arrow navigation.
- **No Ctrl-A (select all), Ctrl-U (clear line), Ctrl-W (delete word)** -- common terminal editing shortcuts.

---

## 4. `src/ui/components/EditTaskModal.tsx` (full edit modal)

### What works well
- Rich multi-field form with Tab navigation between fields
- Supports: content, description, priority, due, deadline, labels, project
- Labels field has a checkbox-style picker with up/down navigation
- Project field has a list picker
- Ctrl-S to save from any field
- Visual focus indicator per field

### Could it be reused for Add?
**Yes, with modifications.** This is the strongest candidate for a unified "create/edit" modal. Key changes needed:
1. Accept an optional `task` prop (if null, it's in "create" mode)
2. Default empty state for all fields in create mode
3. In create mode, the save handler calls `createTask()` instead of `updateTask()`
4. Add a `section` field (currently missing from the modal too)
5. Consider adding a `parent_id` field or at least showing which parent task it will be under

### What's missing or awkward
- **No section field.** Can't change/set section from the edit modal.
- **Labels list is capped at 8** (`labels.slice(0, 8)` on line 326). If user has more than 8 labels, the rest are inaccessible.
- **Project list is capped at 8** (`projects.slice(0, 8)` on line 353). Same problem.
- **No scrolling for labels/projects.** The lists are static slices, not scrollable windows.
- **No search/filter in label/project lists.** With many items, finding the right one is tedious.
- **Priority labels are semantically inverted in the display.** Code shows `1: "P1 (Normal)"` and `4: "P4 (Urgent)"` (lines 17-21). In Todoist's API, `priority=1` is indeed "normal" (p4 visually), but the label says "P1 (Normal)". This is confusing because Todoist web shows "P1" as the highest priority (which is API value `4`). The display names should be `1: "p4 (Normal)"`, `4: "p1 (Urgent)"` to match Todoist's UI convention.
- **`deadline_date` uses `as any` cast** (line 57) -- the type system isn't covering this field on UpdateTaskParams properly. However, looking at `types.ts`, `deadline_date` IS on `UpdateTaskParams` (line 90), so the `as any` is unnecessary.
- **Cursor position not visible when switching between text fields.** If user edits "content", tabs to "due", tabs back -- cursor state is preserved (good), but there's no transition animation or clear indication of where the cursor is.

---

## 5. `src/utils/quick-add.ts` -- the quick-add parser

### What works well
- Extracts priority (`p1`-`p4`), project (`#name`), labels (`@name`), and date phrases
- Date extraction handles keywords ("today", "tomorrow", "next week") and formats ("2026-02-10", "Jan 15")
- Cleanly strips extracted tokens from the content string
- Returns a well-typed `QuickAddResult` interface

### What's missing or awkward
- **Priority regex `\bp([1-4])\b` is too greedy.** It will match "pickup" (matches "p1" in "p1ckup" -- actually no, `\b` before `p` protects this). But it WILL match standalone "p1" anywhere in text. If user writes "I need to pick up p1ckup" it won't match (good), but "Meet at Room p2" would strip "p2" and set priority.
- **Only first project is extracted.** `PROJECT_RE.exec(text)` finds the first `#name` only (line 70-74). If user types `#Work #Personal`, only `#Work` is captured. Since tasks can only be in one project, this is technically correct, but `#Personal` will remain in the content text as a leftover.
- **Date keyword extraction is position-unaware.** The keyword search scans from the start of the lowered string. "I met today's deadline" would extract "today" as a due date, which is wrong.
- **No support for section extraction.** There's no `/section` or `//section` syntax.
- **No support for description.** No way to add a description via quick-add (e.g. `"Task title | description text"` or `"Task title\nDescription"`).
- **No support for deadline (separate from due date).** Quick-add can set `due_string` but not `deadline_date`.
- **`PROJECT_RE.lastIndex = 0` reset on line 77** suggests awareness of the global regex issue, but the pattern is still fragile with stateful global regexes.
- **No error reporting.** If parsing produces unexpected results (empty content after stripping), there's no warning. The caller receives an empty content string silently.

### Specific code concern
```ts
// line 13 -- PRIORITY_RE and PROJECT_RE are module-level with /g flag
const PROJECT_RE = /#(\S+)/g;
const LABEL_RE = /@(\S+)/g;
```
These global regexes are stateful. `PROJECT_RE` is used once with `.exec()` (picks first match), but `LABEL_RE` is used in a `while` loop (correct). However, `PROJECT_RE.lastIndex` is never reset before `.exec()` -- it's only reset on line 77 (after the project extraction). If `parseQuickAdd` is called twice in the same tick, `PROJECT_RE.lastIndex` could be non-zero from a previous call. This is a latent bug.

---

## 6. `src/api/tasks.ts` -- `createTask` function (lines 16-18)

### What works well
- Simple, clean API wrapper
- Type-safe with `CreateTaskParams` input and `Task` return
- Uses centralized `api.post` client

### What's missing or awkward
- **`as unknown as Record<string, unknown>` cast** (line 17). This bypasses TypeScript's type checking entirely. If `CreateTaskParams` gains a field that doesn't match the API, this won't catch it.
- **No validation of params before sending.** Empty content, invalid priority values, malformed dates -- all pass through unchecked.
- **No response error handling.** If the API returns an error (400, 403), the function just throws whatever `api.post` throws. No domain-specific error messages.
- **No optimistic return.** The function awaits the full API response, which means the UI blocks on network latency. An optimistic pattern (immediately return a provisional task, then reconcile) would feel snappier.

---

## 7. `src/api/types.ts` -- `CreateTaskParams` (lines 71-82)

### What works well
- Comprehensive set of fields matching Todoist REST API
- `deadline_date` properly typed as `string | null`
- All fields except `content` are optional

### What's missing or awkward
- **No `assignee_id` field.** The API supports assigning tasks during creation (for shared projects), but `CreateTaskParams` doesn't expose it.
- **No `duration` field.** Todoist API supports task duration, but it's not in the type.
- **`due_string` and `due_date` are both present** but there's no guidance on which to use. Todoist API says `due_string` takes natural language; `due_date` takes a specific date. If both are set, API behavior is undefined.
- **No `due_datetime` field.** Can't set a specific time via the type (only `due_string` with "tomorrow at 3pm" would work).

---

## Summary of Key Improvement Opportunities

### High Priority
1. **Fix priority default bug in CLI** -- change `let priority: Priority = 4` to `1` (or omit to use API default)
2. **Reuse EditTaskModal for task creation** -- create a unified modal that works for both add and edit, solving the UX inconsistency
3. **Pass current project context to add** -- when in a project view, new tasks should default to that project
4. **Add `--description` flag to CLI `add` command**

### Medium Priority
5. **Add autocomplete/suggestions to InputPrompt** -- show project/label names when `#`/`@` is typed
6. **Add live parse preview** -- show what quick-add will produce as the user types
7. **Fix global regex statefulness** in `quick-add.ts` -- use non-global regexes or create fresh regex instances per call
8. **Fix `hasExplicitFlags` check** to include `deadline`, `parent`, and `section`
9. **Remove label/project 8-item cap** in EditTaskModal -- add scrolling or search
10. **Fix priority display labels** in EditTaskModal to match Todoist web conventions

### Lower Priority
11. Add section support to quick-add parser and TUI add modal
12. Add "create and continue" mode for batch task creation
13. Add `--dry-run` to CLI for previewing quick-add parsing
14. Support comma-separated labels (`-l errands,shopping`)
15. Add Home/End and Ctrl-U/Ctrl-W shortcuts to InputPrompt
16. Add `assignee_id` and `duration` to `CreateTaskParams`
