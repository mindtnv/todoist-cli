# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
bun install                          # Install dependencies
bun run dev                          # Run CLI (alias for: bun run src/cli/index.ts)
bun run dev -- task list             # Run specific CLI command
bun run dev -- ui                    # Launch TUI mode
bun run build                        # Bundle to dist/index.js (Node.js-compatible)
bun test                             # Run all tests
bun test src/utils/quick-add.test.ts # Run single test file
bunx tsc --noEmit                    # Type-check without emitting
```

Use **Bun** for development. The built output (`dist/index.js`) runs on both Node.js and Bun.

### npm Distribution

```bash
bun run build      # Bundle CLI to dist/
npm pack           # Create tarball for inspection
npm publish        # Publish to npm
```

After publishing, users install with: `npm install -g todoist-cli` or run with `npx todoist-cli`.

## Architecture

Three operating modes sharing one API layer:

```
src/cli/index.ts  ─── Commander.js commands ──┐
src/ui/App.tsx    ─── Ink/React TUI ──────────┤──▶ src/api/* ──▶ Todoist REST API v1
(programmatic)    ─── Direct API imports ─────┘
```

### API Layer (`src/api/`)
- **client.ts** — Singleton `TodoistClient` wrapping Fetch API. Base URL: `https://api.todoist.com/api/v1`. Auto-paginates when response has `results`/`next_cursor`.
- **types.ts** — All TypeScript interfaces (`Task`, `Project`, `Label`, `Section`, `Comment`, param types).
- **tasks.ts, projects.ts, labels.ts, sections.ts, comments.ts, activity.ts, completed.ts, stats.ts** — One module per resource.

### CLI (`src/cli/`)
- **index.ts** — Entry point (shebang `#!/usr/bin/env bun`). Registers all subcommands.
- Each resource has its own module exporting a `registerXCommand(program)` function.
- Output modes: pretty tables (default), `--json <fields>`, `-q/--quiet` (ID only).
- **Quick-add alias** `todoist a "task p3 #Project @label tomorrow"` — parses smart syntax via `src/utils/quick-add.ts`.

### TUI (`src/ui/`)
- **App.tsx** — Root component. Parallel-loads tasks, projects, labels, sections.
- **views/** — Full-page views: `TasksView` (main), `TaskDetailView`, `StatsView`, `CompletedView`, `ActivityView`.
- **components/** — `Sidebar`, `TaskList`, `TaskRow`, `InputPrompt`, `ConfirmDialog`, `EditTaskModal`, `CommandPalette`, `ProjectPicker`, `LabelPicker`, `HelpOverlay`, `SortMenu`.

### Config (`src/config/`)
- Token and settings stored at `~/.config/todoist-cli/config.toml`.
- Templates stored at `~/.config/todoist-cli/templates.json`.

### Utils (`src/utils/`)
- **quick-add.ts** — Parses smart syntax: `p1-p4` priority, `#Project`, `@label`, `//Section`, `{YYYY-MM-DD}` deadline, natural date keywords.
- **format.ts** — ANSI-aware padding, priority colors, truncation.
- **errors.ts** — `CliError` class, `wrapApiError()`, `didYouMean()` (Levenshtein).

## Key Conventions

### Priority System
API uses **inverted** priority: `1` = normal, `4` = urgent. Visual display maps `p1` → urgent, `p4` → normal. The `Priority` type is `1 | 2 | 3 | 4`.

### TUI Optimistic Updates
All task mutations in `TasksView.tsx` follow this pattern:
1. Save `prevTasks = [...tasks]`
2. Apply change locally via `onTasksChange(tasks.map/filter(...))`
3. Show success message
4. Fire API call (awaited)
5. Background refresh: `refreshTasks().catch(() => {})`
6. On catch: rollback to `prevTasks`, clear undo timer, show error

For create operations (no local ID): await `createTask()` first, then non-blocking refresh.

### Undo System
- `startUndoTimer` sets 10-second countdown for destructive actions (delete, complete).
- On rollback (API failure): must also `clearTimeout(lastAction.timer)` and `setLastAction(null)`.

### Due vs Deadline
- **Due** (`Due` type) — Has `string` (natural language), `date`, `datetime`, `is_recurring`. Needs server-side parsing.
- **Deadline** (`Deadline` type) — Just a `date: string` (YYYY-MM-DD). Can be set optimistically.

### Command Registration Pattern
Each CLI module exports `registerXCommand(program: Command)` which attaches subcommands to the Commander program instance.
