# CLI Feature Expansion Plan

Date: 2026-02-06
Based on: todoist-cli v0.2.0 audit

---

## 1. MUST HAVE (Critical Missing Functionality)

### 1.1 `task reopen` -- Reopen a completed task

**Command:** `todoist task reopen <id>`

**What it does:** Calls `POST /tasks/{id}/reopen` to re-open a previously completed task. This is the counterpart to `task complete` and is a fundamental CRUD operation that is currently missing. Without it, users who accidentally complete a task have no CLI way to undo it.

**Files to modify/create:**
- `src/api/tasks.ts` -- add `reopenTask(id)` function calling `POST /tasks/{id}/reopen`
- `src/cli/task.ts` -- add `reopen` subcommand with `--quiet` option
- `src/cli/completion.ts` -- add `reopen` to task subcommands in all three shell scripts

**Complexity:** S

---

### 1.2 `task move` -- Move task to another project/section

**Command:** `todoist task move <id> --project <name-or-id> [--section <name-or-id>]`

**What it does:** Updates a task's `project_id` and/or `section_id`. Currently `task update` only supports `--text`, `--priority`, and `--due`. Moving tasks between projects is one of the most common reorganization actions. Should support project names (not just IDs) via the same resolution logic used in quick-add.

**Files to modify/create:**
- `src/cli/task.ts` -- add `move` subcommand, or extend `update` with `--project` and `--section` options
- `src/api/tasks.ts` -- `updateTask` already accepts arbitrary params, just needs the CLI to pass `project_id`/`section_id`
- `src/utils/quick-add.ts` -- reuse `resolveProjectName` for name->ID resolution

**Complexity:** S

---

### 1.3 Batch operations -- Complete/delete/update multiple tasks

**Command:**
```
todoist task complete <id1> <id2> <id3>
todoist task list --filter "today & p4" -q | xargs -I{} todoist task complete {}
```

**What it does:** Allow `task complete`, `task delete`, and `task reopen` to accept multiple task IDs as variadic arguments. Currently each command only accepts a single `<id>`. For power users, operating on one task at a time is painfully slow. The `--quiet` mode already outputs IDs suitable for piping, but processing them one at a time requires `xargs` with separate process spawns per task.

**Files to modify/create:**
- `src/cli/task.ts` -- change `argument("<id>")` to `argument("<ids...>")` for complete/delete/reopen, iterate and call API for each

**Complexity:** S

---

### 1.4 `project show` -- Show project details with sections and task counts

**Command:** `todoist project show <name-or-id>`

**What it does:** Displays full project details: name, color, view style, comment count, URL, sections list, and active task count. Currently there is no way to inspect a project's structure. Supports resolving by name (not just ID).

**Files to modify/create:**
- `src/cli/project.ts` -- add `show` subcommand
- `src/api/projects.ts` -- add `getProject(id)` if not present
- `src/api/sections.ts` -- reuse `getSections(projectId)`
- `src/cli/completion.ts` -- add `show` to project subcommands

**Complexity:** S

---

### 1.5 `task update` -- Extend with missing fields (labels, description, project, section)

**Command:**
```
todoist task update <id> --label add:@work --label remove:@personal
todoist task update <id> --description "Full description here"
todoist task update <id> --project "Work" --section "In Progress"
```

**What it does:** The current `task update` only supports `--text`, `--priority`, `--due`. But the API supports updating `labels`, `description`, `project_id`, `section_id`, and `assignee_id`. Missing label management is especially painful -- there is no way to add or remove labels from existing tasks via CLI.

**Files to modify/create:**
- `src/cli/task.ts` -- extend `update` subcommand options
- `src/api/types.ts` -- `UpdateTaskParams` already includes `labels` and `description`, just need CLI wiring

**Complexity:** M

---

### 1.6 `project update` -- Rename/recolor projects

**Command:** `todoist project update <id> --name "New Name" --color "blue" --favorite`

**What it does:** Currently projects can only be created and deleted. There is no way to rename, change color, or toggle favorite status. The API supports `POST /projects/{id}` for updates.

**Files to modify/create:**
- `src/api/projects.ts` -- add `updateProject(id, params)` function
- `src/api/types.ts` -- add `UpdateProjectParams` interface
- `src/cli/project.ts` -- add `update` subcommand
- `src/cli/completion.ts` -- add `update` to project subcommands

**Complexity:** S

---

### 1.7 Name-based resolution for all entity references

**Command:** `todoist task list --project "Work"` (instead of `--project 6J44PcG9RXf3Pvv4`)

**What it does:** Currently `--project`, `--section`, `--label` all require raw IDs (16-char strings). Users should be able to reference projects and sections by name. The `resolveProjectName` utility already exists for quick-add but is not used anywhere else.

Applies to:
- `task list --project <name>`
- `task add --project <name> --section <name>`
- `section list --project <name>`
- `task move --project <name>`

**Files to modify/create:**
- `src/cli/task.ts` -- add name resolution for `--project` in `list`, `add`
- `src/cli/section.ts` -- add name resolution for `--project` in `list`, `create`
- `src/utils/quick-add.ts` -- add `resolveSectionName(name, projectId)` helper

**Complexity:** M

---

### 1.8 `next` shortcut -- Show highest-priority actionable task

**Command:** `todoist next [--project <name>]`

**What it does:** Shows the single next task to work on: the highest-priority task due today or overdue, falling back to highest-priority with nearest due date. This is the most common CLI use case -- "what should I work on right now?" -- and currently requires `todoist today` then visually scanning the list.

**Files to modify/create:**
- `src/cli/index.ts` -- add `next` command
- Reuse existing `getTasks({ filter: "today | overdue" })`

**Complexity:** S

---

## 2. SHOULD HAVE (Quality-of-Life Improvements)

### 2.1 `label update` -- Rename/recolor labels

**Command:** `todoist label update <id> --name "new-name" --color "red"`

**What it does:** Labels can be created and deleted but not updated. The API supports `POST /labels/{id}` for updates.

**Files to modify/create:**
- `src/api/labels.ts` -- add `updateLabel(id, params)`
- `src/api/types.ts` -- add `UpdateLabelParams`
- `src/cli/label.ts` -- add `update` subcommand

**Complexity:** S

---

### 2.2 `section update` -- Rename sections

**Command:** `todoist section update <id> --name "New Name"`

**What it does:** Sections can only be created and deleted. Renaming requires delete+create which loses task assignments.

**Files to modify/create:**
- `src/api/sections.ts` -- add `updateSection(id, params)`
- `src/cli/section.ts` -- add `update` subcommand

**Complexity:** S

---

### 2.3 `upcoming` / `week` shortcut -- Show tasks for the next 7 days

**Command:** `todoist upcoming` or `todoist week`

**What it does:** Shows tasks for the next 7 days grouped by date. Complements `today` which only shows today+overdue. Uses the Todoist filter `7 days`.

**Files to modify/create:**
- `src/cli/index.ts` -- add `upcoming` command
- Reuse `getTasks({ filter: "7 days" })` + `groupByDate()` from task.ts

**Complexity:** S

---

### 2.4 Interactive `task add` -- Prompt-based task creation

**Command:** `todoist task add` (with no arguments)

**What it does:** When `task add` is called without a text argument, launch an interactive prompt asking for content, priority, project (with autocomplete from project list), labels (with autocomplete), due date, and section. Currently omitting the text argument produces a Commander error.

**Files to modify/create:**
- `src/cli/task.ts` -- make text argument optional, add interactive flow
- May use `readline` (already used in `review.ts`) or a library like `@inquirer/prompts`

**Complexity:** M

---

### 2.5 `task list --count` -- Show task count without listing

**Command:** `todoist task list --filter "today" --count`

**What it does:** Outputs just the number of matching tasks. Useful for scripts, status bars (e.g., tmux, polybar), and shell prompts.

**Files to modify/create:**
- `src/cli/task.ts` -- add `--count` option to `list` subcommand

**Complexity:** S

---

### 2.6 `search` -- Full-text search across tasks

**Command:** `todoist search "deploy"` or `todoist task list --search "deploy"`

**What it does:** The Todoist API filter supports `search:` queries (e.g., `search: deploy`). Currently users must manually type `--filter "search: deploy"`. A dedicated search shortcut is more discoverable and can be combined with other filters.

**Files to modify/create:**
- `src/cli/index.ts` -- add `search` command (or alias)
- Or add `--search` option to `task list` that generates the filter

**Complexity:** S

---

### 2.7 `export` -- Export tasks as CSV/JSON

**Command:** `todoist export [--format csv|json] [--filter "..."] [--output file.csv]`

**What it does:** Exports tasks in machine-readable formats. While `--json` exists on `task list`, it requires specifying fields manually and doesn't support CSV. A dedicated export command provides a clean data extraction workflow for backups, spreadsheets, and integrations.

**Files to modify/create:**
- `src/cli/export.ts` -- new file
- `src/cli/index.ts` -- register export command

**Complexity:** M

---

### 2.8 Due date shortcuts in `task update`

**Command:**
```
todoist task update <id> --due tomorrow
todoist task update <id> --due "next monday"
todoist task update <id> --due none    # remove due date
```

**What it does:** Currently `--due` passes a raw string. Add support for the special value `none` or `clear` to remove a due date entirely (set `due_date: null` in API). This is the only way to "unschedule" a task.

**Files to modify/create:**
- `src/cli/task.ts` -- handle `--due none` / `--due clear` specially in update action

**Complexity:** S

---

## 3. NICE TO HAVE (Polish Items)

### 3.1 `config` command -- View/edit CLI settings

**Command:**
```
todoist config list
todoist config set default_project "Work"
todoist config set default_priority 3
todoist config set date_format "YYYY-MM-DD"
```

**What it does:** Persistent user preferences: default project for `task add`, default priority, date display format, default sort order for `task list`, default `--since` for `completed`. Currently all defaults are hardcoded.

**Files to modify/create:**
- `src/cli/config.ts` -- new file
- `src/config/index.ts` -- extend config storage with user preferences
- `src/cli/index.ts` -- register config command

**Complexity:** M

---

### 3.2 `overdue` shortcut

**Command:** `todoist overdue`

**What it does:** Shows only overdue tasks, sorted by how overdue they are (oldest first). While `todoist task list --overdue` exists, a top-level shortcut makes it more discoverable and consistent with `today` and `inbox`.

**Files to modify/create:**
- `src/cli/index.ts` -- add `overdue` command (same pattern as `today`/`inbox`)

**Complexity:** S

---

### 3.3 `comment update` -- Edit an existing comment

**Command:** `todoist comment update <id> --text "Updated comment text"`

**What it does:** Comments can be added and deleted but not edited. The API supports `POST /comments/{id}`.

**Files to modify/create:**
- `src/api/comments.ts` -- add `updateComment(id, params)`
- `src/cli/comment.ts` -- add `update` subcommand

**Complexity:** S

---

### 3.4 `project list --tree` -- Hierarchical project view

**Command:** `todoist project list --tree`

**What it does:** Shows projects in a tree hierarchy (using `parent_id`), similar to how `task list --tree` works. Currently all projects are shown in a flat list even when they have parent-child relationships.

**Files to modify/create:**
- `src/cli/project.ts` -- add `--tree` option to `list`, implement tree builder (similar logic to task tree in `task.ts`)

**Complexity:** S

---

### 3.5 Pager support for long outputs

**Command:** Automatic -- when output exceeds terminal height, pipe through `$PAGER` or `less`.

**What it does:** Commands like `task list` (no filter), `log`, `completed --since "30 days"` can produce hundreds of lines. Currently they flood the terminal with no way to scroll. Detect terminal height and pipe through pager when output exceeds it.

**Files to modify/create:**
- `src/utils/pager.ts` -- new utility
- All CLI commands that produce long output -- wrap console.log in a buffered writer

**Complexity:** M

---

## Summary

| Priority     | # | Features |
|-------------|---|----------|
| MUST HAVE   | 8 | task reopen, task move, batch ops, project show, task update extensions, project update, name resolution, next shortcut |
| SHOULD HAVE | 8 | label update, section update, upcoming, interactive add, --count, search, export, due date clear |
| NICE TO HAVE| 5 | config command, overdue shortcut, comment update, project tree, pager support |

### Implementation Order Recommendation

**Phase 1 (highest ROI, all S complexity):**
1. `task reopen` -- completes the task lifecycle
2. Name-based resolution -- makes every command friendlier
3. `next` shortcut -- most common use case
4. Batch operations -- power user essential
5. `project update` -- completes project CRUD

**Phase 2 (fill CRUD gaps):**
6. `task update` extensions (labels, description, project)
7. `task move`
8. `label update`, `section update`, `comment update`
9. `project show`

**Phase 3 (shortcuts and UX):**
10. `upcoming` / `week`
11. `overdue` shortcut
12. `search` shortcut
13. `task list --count`
14. Due date `none`/`clear`

**Phase 4 (polish):**
15. Interactive `task add`
16. `export`
17. `config` command
18. `project list --tree`
19. Pager support
