# CLI Audit Report

Date: 2026-02-06
Auditor: cli-auditor
Todoist CLI v0.2.0

---

## P0: Broken / Crashing Commands

### P0-1: `task complete` hangs indefinitely (process never exits)

**File:** `src/cli/task.ts:416-428`, `src/api/tasks.ts:24-26`, `src/api/client.ts:32-39`

**Reproduction:**
```bash
bun run src/cli/index.ts task complete <any-task-id>
# Process hangs — must be killed with Ctrl+C or timeout
```

**Root cause:** `closeTask()` calls `api.post<void>('/tasks/{id}/close')`. The Todoist API returns HTTP 204 (No Content). `handleResponse` correctly returns `undefined` for empty text, but bun's `fetch` keeps the process alive because the underlying connection is not properly closed/drained. The `commander` action completes, the success message prints, but `process.exit()` is never called and bun does not exit naturally.

**Impact:** The most common workflow — completing a task — is broken. Users must Ctrl+C every time.

**Fix:** Add `process.exit(0)` after successful close, or restructure the client to properly signal completion. Alternatively, use `api.del` pattern which has the same issue (see P0-2).

---

### P0-2: `task delete` hangs indefinitely (process never exits)

**File:** `src/cli/task.ts:430-447`, `src/api/tasks.ts:28-30`, `src/api/client.ts:41-47`

**Reproduction:**
```bash
bun run src/cli/index.ts task delete <any-task-id>
# Prints "Task <id> deleted." but process hangs
```

**Root cause:** Same as P0-1. `deleteTask()` calls `api.del('/tasks/{id}')`. The API returns 204. The `del` method checks `res.ok` but does not consume the response body (`res.text()` or `res.body?.cancel()`), which may cause bun to keep the connection alive. The success message prints but the process never exits.

**Impact:** Delete workflow is broken. Users must Ctrl+C.

**Fix:** In `client.ts:del()`, consume the response body before returning (e.g. `await res.text()`). Or add `process.exit(0)` in the CLI action after success.

---

## P1: Formatting Bugs

### P1-1: Column misalignment in ALL table outputs — ID column too narrow

**Files:** `src/cli/project.ts:42`, `src/cli/task.ts:39`, `src/cli/label.ts:42`, `src/cli/comment.ts:37`, `src/cli/section.ts:22`, `src/cli/index.ts:91`

**Problem:** All table headers use `padEnd(14)` for the ID column, but Todoist API v1 IDs are 16 characters long (e.g. `6J44PcG9RXf3Pvv4`). This causes data rows to extend 2 characters beyond the header column, misaligning all subsequent columns.

**Observed output:**
```
ID             Name                           Color        Favorite     <-- header (14 chars)
-----------------------------------------------------------------
6J44PcG9RXf3Pvv4 Inbox                          grey                    <-- data (16 chars, +2 shift)
```

**Impact:** Every table in the CLI has misaligned columns. The visual effect ranges from subtle to confusing.

**Fix:** Change all `padEnd(14)` for IDs to `padEnd(18)` (16 chars + 2 padding). Update the separator `-`.repeat() values accordingly. Affected files:
- `src/cli/project.ts:42,47` (header and data)
- `src/cli/task.ts:39,46,76,84,98` (header and data in printTaskTable, buildTree)
- `src/cli/label.ts:42,47`
- `src/cli/comment.ts:37,42`
- `src/cli/section.ts:22,27`
- `src/cli/index.ts:91,96` (printShortcutTable)

---

### P1-2: Priority colors are inverted (p1 shown as red/urgent, but API p1 = normal)

**Files:** `src/cli/task.ts:8-15`, `src/cli/index.ts:21-28`, `src/cli/review.ts:8-15`

**Problem:** The Todoist REST API uses:
- priority 1 = normal (lowest)
- priority 4 = urgent (highest)

But the color mapping is:
```ts
case 1: return chalk.red;    // RED = urgent visual, but API 1 = normal
case 2: return chalk.yellow;
case 3: return chalk.blue;
case 4: return chalk.white;  // WHITE = normal visual, but API 4 = urgent!
```

This means urgent tasks (p4) display as white (inconspicuous) and normal tasks (p1) display as red (alarming).

**Impact:** Users see inverted urgency signals. High-priority tasks look low-priority and vice versa.

**Fix:** Invert the mapping:
```ts
case 1: return chalk.white;   // normal
case 2: return chalk.blue;
case 3: return chalk.yellow;
case 4: return chalk.red;     // urgent
```

---

### P1-3: Eisenhower matrix quadrant labels are inverted

**File:** `src/cli/matrix.ts:82-88`

**Problem:** The matrix maps:
- p1 -> "DO FIRST" (but API p1 = normal priority)
- p4 -> "ELIMINATE" (but API p4 = urgent priority)

This is backwards. Urgent tasks end up in "ELIMINATE" and normal tasks in "DO FIRST".

**Fix:** Swap the mapping:
```ts
const q1 = renderQuadrant("DO FIRST (p4)", buckets[4], chalk.red.bold);
const q2 = renderQuadrant("SCHEDULE (p3)", buckets[3], chalk.yellow.bold);
const q3 = renderQuadrant("DELEGATE (p2)", buckets[2], chalk.blue.bold);
const q4 = renderQuadrant("ELIMINATE (p1)", buckets[1], chalk.white.bold);
```

---

### P1-4: `today` command sorts by ascending priority (normal first, urgent last)

**File:** `src/cli/index.ts:134`

**Problem:**
```ts
tasks.sort((a, b) => a.priority - b.priority);
```
This puts p1 (normal) first and p4 (urgent) last. Users expect urgent tasks at the top.

**Fix:** `tasks.sort((a, b) => b.priority - a.priority);`

---

### P1-5: `--group-by` mode repeats table header for every group

**File:** `src/cli/task.ts:211-217` (printGrouped) calling `printTaskTable`

**Problem:** `printGrouped` calls `printTaskTable(group.tasks)` for each group. `printTaskTable` prints the header when `indent === 0`, which is always true here. Result: the full `ID / Pri / Content / Due / Labels` header + separator line appears under every group label.

**Observed:**
```
Inbox
ID             Pri    Content ...
---------------------------------
(tasks)

trip
ID             Pri    Content ...    <-- repeated header
---------------------------------
(tasks)
```

**Fix:** Add a flag to `printTaskTable` to suppress the header, or print the header once before iterating groups.

---

### P1-6: Eisenhower matrix right-side content is not aligned with borders

**File:** `src/cli/matrix.ts:39-48` (mergeColumns)

**Problem:** The right column content doesn't fill to the border width, so the right `|` border appears immediately after the text instead of at a fixed position. Observed:
```
│ DO FIRST (p1)                      │  SCHEDULE (p2)│
│  Аренда за офис                    │   (empty)│
```

The right `│` should be at the fixed column boundary, not flush against the text.

**Fix:** In `mergeColumns`, pad the right column to `colWidth` as well before appending the right border.

---

## P2: Missing Features / UX Improvements

### P2-1: Shell completion script missing new commands

**File:** `src/cli/completion.ts:11`

**Problem:** The bash completion's `commands` variable lists:
```
task project label comment template section auth today inbox ui completion
```
Missing: `completed`, `review`, `matrix`, `log`, `stats`

Similarly for zsh and fish completions.

**Fix:** Add the missing commands to all three completion scripts. Also add subcommands for `comment` (add, list, delete) and `template` (save, apply, list).

---

### P2-2: `inbox` command shows non-Inbox tasks

**Observed:**
```
Inbox

ID             Pri    Content                                  Due            Labels
------------------------------------------------------------------------------------------
6WmmFXp5mfG55vvW p1     Аренда за офис                           2026-03-04
6frqC8jg2Fr7H8W4 p1     Деплой админки п2п                       2026-01-31
```

"Деплой админки п2п" is in the "trip" project (verified via `--group-by project`), but it appears in the Inbox view. This may be a Todoist API filter behavior (`#Inbox` filter), not a CLI bug, but it's confusing for users.

**Investigation needed:** Verify whether `#Inbox` filter returns only Inbox project tasks or also unassigned tasks.

---

### P2-3: `completed --since` only supports 3 presets + raw ISO date

**File:** `src/cli/completed.ts:7-27`

**Problem:** `sinceToDate()` only recognizes: `today`, `7 days`, `30 days`, or treats everything else as a raw ISO date string. More natural inputs like `"yesterday"`, `"3 days"`, `"2 weeks"`, `"this week"` are not supported — they get passed as raw strings which likely fail.

**Fix:** Add more presets or use a date parsing library.

---

### P2-4: `task list` has no default sort order

**File:** `src/cli/task.ts:299-347`

**Problem:** Without `--sort`, tasks appear in API's default order which may not be intuitive. Consider defaulting to priority or due date sort.

---

### P2-5: No `task show <id>` command for viewing full task details

**Problem:** There's no way to see a task's full description, URL, creation date, section, or other metadata. `task list` truncates content to 38 chars.

---

### P2-6: `log` event type column is misaligned due to ANSI color codes

**File:** `src/cli/log.ts:48`

**Problem:** `padEnd(colorFn(e.event_type), 12)` pads a colored string. The custom `padEnd` function strips ANSI for calculation, which is correct. But the event type strings have varying lengths (`completed` = 9, `added` = 5, `deleted` = 7, `updated` = 7), and the content column (`extra`) doesn't use the same colored padEnd, creating a slightly ragged log output.

---

### P2-7: `completed` command does not show task IDs

**File:** `src/cli/completed.ts:75-83`

**Problem:** Completed tasks are shown as `checkmark + content + date` but no task ID or project name in default view. This makes it hard to reference specific completed tasks.

---

### P2-8: Error handling inconsistency — `wrapApiError` from errors.ts is never used

**Files:** `src/utils/errors.ts`, all CLI command files

**Problem:** The `errors.ts` module provides `wrapApiError`, `formatCliError`, and `handleError` with structured error handling (exit codes, suggestions, help URLs). But no CLI command uses them — every command has its own `catch (err) { console.error(chalk.red(...)); process.exit(1) }` pattern. The structured error system is dead code.

---

## P3: Nice-to-Have Polish

### P3-1: `stats` daily breakdown shows only 1 day instead of 7

**Observed:**
```
Daily (last 7 days):
  02-06  ████████████████████    4
```

Only 1 day shown. This is likely because the API only returned 1 day of data, but the label "last 7 days" is misleading when fewer days are shown.

---

### P3-2: `today --timeline` doesn't show task IDs

**File:** `src/cli/index.ts:44-83`

**Problem:** Timeline view shows `time + priority + content` but no task ID, making it impossible to act on tasks (complete, delete) from this view.

---

### P3-3: Task content truncation is inconsistent across commands

**Problem:** Different limits used:
- `printTaskTable`: 38 chars (`src/cli/task.ts:49`)
- `printShortcutTable` (today/inbox): 38 chars (`src/cli/index.ts:98`)
- Timeline: 40 chars (`src/cli/index.ts:65`)
- Review: 50 chars (`src/cli/review.ts:34`)
- Matrix: 31 chars (COL_WIDTH - 4 = 31, `src/cli/matrix.ts:19`)
- Completed: 45 chars via padEnd (`src/cli/completed.ts:72`)

Should be consistent or at least responsive to terminal width.

---

### P3-4: `padEnd` utility is duplicated in 5 files

**Files:** `src/cli/task.ts:26-30`, `src/cli/index.ts:30-34`, `src/cli/completed.ts:34-38`, `src/cli/matrix.ts:12-16`, `src/cli/log.ts:22-26`

**Problem:** Same ANSI-aware `padEnd` function copy-pasted in 5 files. Should be extracted to a shared utility.

---

### P3-5: `priorityColor` function duplicated in 3 files

**Files:** `src/cli/task.ts:8-15`, `src/cli/index.ts:21-28`, `src/cli/review.ts:8-15`

**Problem:** Same function in 3 places. Should be a shared utility.

---

### P3-6: No `--no-color` flag for piping output

**Problem:** When piping output (e.g. `todoist task list | grep ...`), ANSI color codes make text hard to process. There's no `--no-color` or `NO_COLOR` env var support.

Note: chalk may auto-detect non-TTY, but this should be verified.

---

### P3-7: Separator line widths don't match actual table widths

**Problem:** Various commands use hardcoded `.repeat(N)` values for separators:
- `project.ts`: `"-".repeat(65)`
- `task.ts`: `"-".repeat(90)`
- `label.ts`: `"-".repeat(58)`
- `comment.ts`: `"-".repeat(70)`
- `section.ts`: `"-".repeat(50)`

These don't dynamically adjust when ID widths change. Should be computed from actual column widths.

---

### P3-8: `task add` with `-p` flag uses raw number but display shows `p3`

**File:** `src/cli/task.ts:228`

**Minor inconsistency:** The flag is `-p 3` (number) but the display shows `p3`. Not a bug per se but slightly inconsistent with Todoist's own notation where p1=urgent, p4=normal.

---

## Summary

| Priority | Count | Description |
|----------|-------|-------------|
| P0       | 2     | `task complete` and `task delete` hang (process never exits) |
| P1       | 6     | Column misalignment, inverted priorities, matrix labels, group-by headers, matrix borders |
| P2       | 8     | Missing completions, inbox filter, limited date parsing, no task show, error handling |
| P3       | 8     | Stats display, truncation inconsistency, code duplication, no --no-color |

### Top 5 Fixes by Impact:
1. **P0-1/P0-2:** Fix process hanging on `task complete` / `task delete`
2. **P1-2/P1-3/P1-4:** Fix inverted priority colors, matrix labels, and sort order
3. **P1-1:** Fix ID column width from 14 to 18 in all table headers
4. **P1-5:** Fix repeated headers in `--group-by` mode
5. **P2-1:** Update shell completion scripts with missing commands
