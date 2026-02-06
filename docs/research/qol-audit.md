# QoL Audit

## Critical (must fix)

### C1. TaskRow does not truncate long task names — breaks layout
- **File**: `src/ui/components/TaskRow.tsx:56`
- **Issue**: `task.content` is rendered without any truncation or wrapping. A task with a very long name will overflow the terminal width, breaking the entire TUI layout and causing visual corruption.
- **Fix**: Truncate `task.content` based on available terminal width (use `useStdout` to get columns, subtract space for checkbox, priority, due date, labels, markers, indent). Apply ellipsis when truncated.
- **Effort**: medium

### C2. `open` command is macOS-only — fails silently on Linux/Windows
- **File**: `src/ui/views/TasksView.tsx:704`, `src/ui/views/TaskDetailView.tsx:117`
- **Issue**: `Bun.spawn(["open", url])` only works on macOS. On Linux this should be `xdg-open`, on Windows `start`. Currently fails silently with generic "Failed to open in browser".
- **Fix**: Create a cross-platform `openUrl(url)` utility that detects the OS and uses the appropriate command. Show a proper error if on an unsupported platform.
- **Effort**: easy

### C3. No API retry / network error messaging
- **File**: `src/api/client.ts:50-80`
- **Issue**: Network failures (offline, DNS, timeouts) throw generic `fetch` errors with no user-friendly message. No retry logic at all. A single dropped packet loses the operation.
- **Fix**: Wrap fetch calls with a try/catch that gives user-friendly errors for common network issues ("Network error: check your internet connection"). Consider a single retry with exponential backoff for transient errors.
- **Effort**: medium

### C4. Stale closure in `handleCompleteTask` / `handleDeleteConfirm` — race condition with undo
- **File**: `src/ui/views/TasksView.tsx:342-360`, `362-389`
- **Issue**: Both handlers reference `lastAction` from their closure. When a user completes task A, then quickly completes task B before A's API call returns, the `lastAction` reference is stale. If A's API call fails, the catch block tries to `clearTimeout(lastAction.timer)` which may now reference B's timer, corrupting the undo system.
- **Fix**: Use a ref (`useRef`) for `lastAction` to always have the latest value in async callbacks. Alternatively, capture `lastAction` at call time before the await.
- **Effort**: medium

### C5. `next` command sort order is inverted — returns lowest priority task
- **File**: `src/cli/index.ts:207-210`
- **Issue**: The sort is `a.priority - b.priority` which puts priority 1 (normal) first. In Todoist API, priority 4 is urgent. The `today` command correctly sorts `b.priority - a.priority` at line 129, but `next` does the opposite. The "highest priority" task shown is actually the lowest priority.
- **Fix**: Change sort to `b.priority - a.priority` (same as `today` command).
- **Effort**: easy

## High Priority

### H1. InputPrompt clears on submit — breaks continuous add workflow
- **File**: `src/ui/components/InputPrompt.tsx:30-33`
- **Issue**: After submitting, the input is cleared (good for continuous add), but there's no visual confirmation in the prompt itself. The `handleAddTask` sets a status message "Task created! Keep typing..." but the status bar is at the bottom and may be missed. Users may think their task wasn't created.
- **Fix**: Show a brief inline flash/confirmation "Created!" in the InputPrompt itself, or highlight the status bar more prominently when in continuous add mode.
- **Effort**: medium

### H2. TaskDetailView scrolling can go into negative territory conceptually — marginTop hack
- **File**: `src/ui/views/TaskDetailView.tsx:170`
- **Issue**: Scrolling is implemented as `marginTop={-scrollOffset}`, which is a CSS-level hack. There's no bound check against the total content height, so the user can keep pressing `j` and scroll way past the content into empty space. No scroll-end detection.
- **Fix**: Calculate the total content line count and cap `scrollOffset` at `max(0, totalLines - viewportHeight)` like CompletedView does.
- **Effort**: medium

### H3. ConfirmDialog accepts any key that isn't y/n as cancel
- **File**: `src/ui/components/ConfirmDialog.tsx:10-15`
- **Issue**: Only `y/Y` and `n/N/Esc` are handled. Any other key (e.g., accidentally pressing `j`, `Enter`) does nothing — the dialog just sits there unresponsive. Users expect Enter to confirm or at least for the dialog to respond to all keys.
- **Fix**: Add `Enter` as confirm (with the `y` option being the default focus), or at minimum provide feedback that only y/n are accepted.
- **Effort**: easy

### H4. ProjectPicker and LabelPicker use Ctrl+j/k for navigation instead of plain j/k
- **File**: `src/ui/components/ProjectPicker.tsx:61-65`, `src/ui/components/LabelPicker.tsx:75-82`
- **Issue**: Navigation requires `Ctrl-j/k` because plain `j`/`k` are treated as text input for the filter. This is inconsistent with all other components (TaskList, SortMenu, CommandPalette) which use plain `j/k`. Users will be confused when `j` types "j" in the filter instead of moving down.
- **Fix**: Use arrow keys only for navigation (which already works), or add a mode toggle. Document the inconsistency at minimum. Consider using a separate mode or a prefix key.
- **Effort**: medium

### H5. CLI table widths are hardcoded — truncate on narrow terminals
- **File**: `src/cli/task.ts:21-26`, `src/cli/index.ts:24-26`
- **Issue**: `CONTENT_WIDTH = 40`, `DUE_WIDTH = 30` (or 14) are hardcoded. On a terminal narrower than ~90 columns, the table wraps and becomes unreadable. Two different `DUE_WIDTH` values between `task.ts` (30) and `index.ts` (14) make display inconsistent.
- **Fix**: Detect `process.stdout.columns` and proportionally allocate column widths. Unify the width constants between the two files.
- **Effort**: medium

### H6. No empty state for filter results
- **File**: `src/ui/views/TasksView.tsx:471-487`
- **Issue**: When a filter query returns 0 results, `apiFilteredTasks` is set to an empty array, but the only feedback is the task list showing "No tasks. Press 'a' to add one." which is misleading — adding a task won't help with an empty filter result. There's no indication that the filter is active or how to clear it.
- **Fix**: Show a specific empty state for filter results: "No tasks match filter: `<query>`. Press Esc to clear." Add a way to clear the filter (Esc from the task list should clear active API filter).
- **Effort**: easy

### H7. `handleOpenInBrowser` uses macOS `open` without checking platform
- **File**: `src/ui/views/TasksView.tsx:701-709`
- **Issue**: Same as C2 but in a different location. The `open` command is not portable.
- **Fix**: Same as C2 — use cross-platform utility.
- **Effort**: easy (same fix as C2)

### H8. Sidebar has no scrolling — truncated with many projects/labels
- **File**: `src/ui/components/Sidebar.tsx:192-226`
- **Issue**: The sidebar has a fixed width of 24 and renders all items. If a user has 20+ projects and 10+ labels, the sidebar will overflow the terminal height with no scrolling mechanism. Items below the fold are invisible and unreachable.
- **Fix**: Add viewport scrolling to the sidebar, similar to TaskList. Track a scroll offset and use `useStdout` to determine visible items count.
- **Effort**: medium

### H9. HelpOverlay has no scrolling — truncated on short terminals
- **File**: `src/ui/components/HelpOverlay.tsx:98-127`
- **Issue**: The help overlay renders all sections at once. It currently has ~40 entries. On a terminal shorter than ~45 rows, content at the bottom is invisible with no way to scroll.
- **Fix**: Add `j/k` scrolling to HelpOverlay, similar to CompletedView/ActivityView.
- **Effort**: easy

## Medium Priority

### M1. Duplicate color mapping tables
- **File**: `src/ui/components/ProjectPicker.tsx:11-32`, `src/ui/components/LabelPicker.tsx:12-33`, `src/ui/components/Sidebar.tsx:14-35`
- **Issue**: The `todoistColorMap` / `projectColors` / `labelColors` are identical tables duplicated in three files. Maintenance burden and risk of divergence.
- **Fix**: Extract to a shared `src/utils/colors.ts` utility.
- **Effort**: easy

### M2. Priority sort is by raw API value, confusing with mixed display
- **File**: `src/ui/views/TasksView.tsx:64-65`, `src/cli/task.ts:558-559`
- **Issue**: In the TUI, sort by priority does `b.priority - a.priority` (4 first = urgent first) which is correct. But in CLI `task list --sort priority`, it does `a.priority - b.priority` (1 first = normal first). The sorts are opposite for the same concept.
- **Fix**: CLI sort should match TUI behavior: highest priority (4=urgent) first.
- **Effort**: easy

### M3. `pendingG` state in TaskList has no timeout — can confuse input
- **File**: `src/ui/components/TaskList.tsx:78-97`
- **Issue**: After pressing `g` once, `pendingG` is true and stays until the next keypress. If a user presses `g` then waits a long time (e.g., went to get coffee), the next keypress they make will be consumed as "second part of gg" or silently discarded. No timeout or visual indicator.
- **Fix**: Add a 500ms timeout that resets `pendingG` to false. Optionally show "g..." in the status bar so the user knows they're in a pending state.
- **Effort**: easy

### M4. InputPrompt doesn't support Home/End keys
- **File**: `src/ui/components/InputPrompt.tsx:44-51`
- **Issue**: Only left/right arrow keys are handled for cursor movement. Home/End keys and Ctrl-A/Ctrl-E (readline-style) are not supported. Power users expect these.
- **Fix**: Add Home (cursor=0) and End (cursor=value.length) key handlers. Also support Ctrl-A and Ctrl-E for start/end of line, and Ctrl-K to kill to end of line.
- **Effort**: easy

### M5. EditTaskModal has no "unsaved changes" warning
- **File**: `src/ui/components/EditTaskModal.tsx:131-134`
- **Issue**: Pressing Escape immediately cancels without any confirmation, even if the user has made changes. This is dangerous for the full edit form with multiple fields.
- **Fix**: Track a `dirty` flag. If dirty and Escape is pressed, show a "Discard changes? [y/n]" prompt before closing.
- **Effort**: medium

### M6. No keyboard shortcut to cycle through sidebar filter views in task panel
- **File**: `src/ui/views/TasksView.tsx:818-946`
- **Issue**: To switch between Inbox/Today/Upcoming, the user must Tab to sidebar, navigate, press Enter, then Tab back. No quick keys like `1` for Inbox, `2` for Today, `3` for Upcoming in the tasks panel.
- **Fix**: These filter views are available via command palette, but dedicated hotkeys would be much faster. Consider `Ctrl-1/2/3` or similar.
- **Effort**: easy

### M7. Batch mode error handling is all-or-nothing
- **File**: `src/cli/task.ts:388-416`, `src/cli/index.ts:412-449`
- **Issue**: In batch mode, if one task fails to create, the entire operation throws and remaining tasks are skipped. The count of created tasks is only shown on success — no partial report.
- **Fix**: Track successes and failures. After all attempts, report: "Created 5/7 tasks. 2 failed." Continue processing remaining tasks after a failure.
- **Effort**: easy

### M8. Task detail view shows raw `created_at` timestamp
- **File**: `src/ui/views/TaskDetailView.tsx:223-224`
- **Issue**: `task.created_at` is displayed as a raw ISO string like "2025-01-15T10:30:00Z", which is not human-friendly. CompletedView and ActivityView format their timestamps nicely, but TaskDetailView doesn't.
- **Fix**: Format with a human-readable relative or absolute date function (e.g., "Jan 15, 2025 10:30 AM" or "2 weeks ago").
- **Effort**: easy

### M9. CLI `task show` displays section_id and parent_id as raw IDs
- **File**: `src/cli/task.ts:661-665`
- **Issue**: When a task has a section or parent, the raw ID is shown instead of the name. This is useless for the user.
- **Fix**: Resolve section_id to section name (like project_id is already resolved). Fetch parent task name via `getTask(parent_id)`.
- **Effort**: easy

### M10. No loading indicator in TUI when API calls are in flight
- **File**: `src/ui/views/TasksView.tsx:150-157`
- **Issue**: When `refreshTasks()` is called, there's a brief `setStatusMessage("Refreshing...")` but nothing prevents the user from performing actions on stale data during the refresh. The UI feels laggy/unresponsive without clear feedback that an operation is in progress.
- **Fix**: Consider a lightweight "loading" state that dims the task list or shows a spinner. At minimum, persist the "Refreshing..." status until the refresh completes.
- **Effort**: medium

### M11. CommandPalette selected index can go out of bounds when filtering
- **File**: `src/ui/components/CommandPalette.tsx:68-69`
- **Issue**: `selectedIndex` is reset to 0 when typing, but if the user types a character then uses the down arrow quickly, the index could exceed `filtered.length - 1` because `filtered` is recalculated on the next render.
- **Fix**: Clamp `selectedIndex` to `filtered.length - 1` in the render or in a useEffect.
- **Effort**: easy

### M12. CLI `task list` and shortcut commands have duplicated JSON/field-picking logic
- **File**: `src/cli/task.ts:108-118`, `src/cli/index.ts:142-150`
- **Issue**: The `pickFields` function exists in `task.ts` but the `today`, `inbox` commands reimplement the same logic inline.
- **Fix**: Import and reuse `pickFields` from task.ts in index.ts.
- **Effort**: easy

### M13. EditTaskModal Shift-Tab navigation reported but Ink doesn't support shift detection properly
- **File**: `src/ui/components/EditTaskModal.tsx:137-138`
- **Issue**: `key.shift` combined with `key.tab` is unreliable in many terminal emulators. Some terminals send the same sequence for Tab and Shift-Tab, making backward field navigation broken.
- **Fix**: Add an alternative backward navigation key like `Ctrl-P` or Shift-Tab workaround via raw mode escape sequence detection.
- **Effort**: medium

### M14. `q` key quits from any state, including mid-type
- **File**: `src/ui/views/TasksView.tsx:829-831`
- **Issue**: The `q` key handler fires when `modal === "none"` and `activePanel === "tasks"`. However, since modal check is only for some specific modals (`search`, `command`), pressing `q` when no modal is open will always quit. This is correct but may surprise users who press `q` thinking they're in a text field.
- **Fix**: This is actually fine due to the modal check on line 823, but could add a confirmation dialog for quit (`:q` via command palette already has no confirmation).
- **Effort**: easy (nice-to-have)

## Low Priority (nice to have)

### L1. No visual diff between "Today" tasks and "Overdue" tasks in TUI Today view
- **File**: `src/ui/views/TasksView.tsx:126-129`
- **Issue**: The Today filter shows tasks where `due.date === localDate`, but doesn't distinguish overdue tasks visually. An overdue task looks the same as a task due today. The CLI `today` command uses filter `"today | overdue"` which gets both, but TUI filters locally with exact date match only — overdue tasks are silently excluded.
- **Fix**: Change Today filter to include overdue (`due.date <= localDate`) and color overdue dates in red in TaskRow.
- **Effort**: medium

### L2. Sort direction not toggleable — always ascending/descending
- **File**: `src/ui/components/SortMenu.tsx`, `src/ui/views/TasksView.tsx:60-78`
- **Issue**: Sort is always in one direction (priority: highest first, due: earliest first, name: A-Z). No way to reverse the sort order.
- **Fix**: Add sort direction toggle (press the same sort option again to reverse).
- **Effort**: easy

### L3. Sidebar width is hardcoded at 24 characters
- **File**: `src/ui/components/Sidebar.tsx:194`
- **Issue**: Long project names are truncated at 24 characters without any visual indicator (no ellipsis). Users may have projects with 30+ character names.
- **Fix**: Either auto-size sidebar based on longest project name (capped at ~30), or add ellipsis truncation, or make sidebar collapsible.
- **Effort**: medium

### L4. No confirmation before quit with unsaved selections
- **File**: `src/ui/views/TasksView.tsx:829-831`
- **Issue**: If a user has selected multiple tasks (multi-select mode), pressing `q` immediately exits without warning. The selection state is lost.
- **Fix**: If `selectedIds.size > 0`, show a confirmation dialog before quitting.
- **Effort**: easy

### L5. Quick-add parser doesn't handle multi-word project names
- **File**: `src/utils/quick-add.ts:16`
- **Issue**: `PROJECT_RE = /#(\S+)/` only captures non-whitespace after `#`. A project named "Side Projects" would only capture "Side". Users must quote or use hyphens.
- **Fix**: Support quoted project names: `#"Side Projects"`. Or use the last `#token` and try fuzzy matching against known project names.
- **Effort**: medium

### L6. No page up/down in CompletedView and ActivityView
- **File**: `src/ui/views/CompletedView.tsx:100-113`, `src/ui/views/ActivityView.tsx:79-92`
- **Issue**: Only `j/k` (single line scroll) is supported. With 50+ events, scrolling is tedious. TaskList supports Ctrl-d/u for half-page, gg/G for top/bottom, but these views don't.
- **Fix**: Add Ctrl-d/u for half-page scroll and G/gg for top/bottom.
- **Effort**: easy

### L7. Deadline input has no format validation
- **File**: `src/ui/views/TasksView.tsx:567-594`
- **Issue**: The deadline input prompt says "YYYY-MM-DD" but accepts any string. If user types "next friday", it's sent to the API which rejects it. The optimistic update will show the invalid string then revert.
- **Fix**: Validate the format matches `YYYY-MM-DD` regex before sending. Show inline error if format is wrong.
- **Effort**: easy

### L8. CLI `task update --label` syntax is non-obvious
- **File**: `src/cli/task.ts:758`
- **Issue**: `--label "add:@name"` or `--label "remove:@name"` is not intuitive. The `@` is optional, and the `add:` prefix feels like internal API syntax rather than user-facing CLI.
- **Fix**: Consider simpler flags: `--add-label name` and `--remove-label name`. Or at minimum improve help text with clearer examples.
- **Effort**: medium

### L9. StatsView doesn't handle terminal resize
- **File**: `src/ui/views/StatsView.tsx:111`
- **Issue**: `barMaxWidth = 30` is hardcoded. On a wide terminal, bars are tiny. On a narrow terminal, they might overflow.
- **Fix**: Calculate `barMaxWidth` from `stdout.columns` for responsive bars.
- **Effort**: easy

### L10. No keyboard shortcut reference in CLI help
- **File**: `src/cli/index.ts:379-385`
- **Issue**: The `ui` command has no hint about available keyboard shortcuts. Users must discover them by pressing `?` inside the TUI. A brief mention in the CLI help would improve discoverability.
- **Fix**: Add help text: `todoist ui    # Press ? for keyboard shortcuts inside the TUI`.
- **Effort**: easy

### L11. Search is client-side only — doesn't search descriptions or comments
- **File**: `src/ui/views/TasksView.tsx:141-143`
- **Issue**: TUI search (`/`) filters `task.content.toLowerCase().includes(q)` only. Task descriptions, labels, and comments are not searched. The CLI `search` command uses API-side `search:` filter which searches content only.
- **Fix**: Extend search to include `task.description` and `task.labels.join(" ")` for local filtering.
- **Effort**: easy

### L12. Activity view event_type display could be friendlier
- **File**: `src/ui/views/ActivityView.tsx:38-47`
- **Issue**: Event types like "completed", "added" etc. are shown as-is from the API. Some events may have less common types that aren't color-mapped and just show in white.
- **Fix**: Add more event type mappings and use human-friendly labels (e.g., "item:completed" -> "Completed task").
- **Effort**: easy

### L13. `N` (create full) and `a` (quick add) don't inherit current due date in Today view
- **File**: `src/ui/views/TasksView.tsx:260-282`
- **Issue**: When viewing Today and creating a new task, the user probably wants it due today. Neither the quick-add nor the full editor pre-populate the due date based on the current view.
- **Fix**: When `filterView === "Today"`, set default `due_string: "today"` in the create task params.
- **Effort**: easy

### L14. Multiple `process.exit()` calls in CLI handlers break testability
- **File**: `src/cli/task.ts:329,386,417,437,467,501,700,725,747` and `src/cli/index.ts` various
- **Issue**: Many CLI handlers call `process.exit(0)` or `process.exit(1)` directly. This makes it impossible to properly test these handlers and prevents proper cleanup.
- **Fix**: Throw a special error that's caught at the top level, or use commander's built-in exit handling.
- **Effort**: medium

### L15. TUI Today view uses local filtering, misses overdue tasks
- **File**: `src/ui/views/TasksView.tsx:126-129`
- **Issue**: The TUI Today view filters `t.due.date === localDate` which only shows tasks due exactly today. Tasks that are overdue (due yesterday or earlier) are silently hidden. The CLI `today` command correctly includes overdue tasks via `"today | overdue"` filter. This is a significant functional discrepancy.
- **Fix**: Change TUI Today filter to `t.due.date <= localDate` or use the API filter like CLI does.
- **Effort**: easy (note: related to L1 but specifically about missing overdue tasks)
