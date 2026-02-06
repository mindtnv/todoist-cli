# Todoist CLI — Design Document

## Stack
- **Runtime:** Bun
- **Language:** TypeScript
- **CLI framework:** Commander.js
- **TUI:** Ink (React for terminal)
- **Testing:** bun test + ink-testing-library
- **API:** Todoist REST API v2, native fetch

## Project Structure

```
todoist-cli/
├── src/
│   ├── cli/              # Commander.js command definitions
│   │   ├── index.ts      # Entry point, command registration
│   │   ├── task.ts       # todoist task [add|list|complete|delete|update]
│   │   ├── project.ts    # todoist project [list|create|delete]
│   │   ├── label.ts      # todoist label [list|create|delete]
│   │   ├── comment.ts    # todoist comment [add|list|delete]
│   │   ├── template.ts   # todoist template [save|apply|list]
│   │   └── auth.ts       # todoist auth
│   ├── ui/               # TUI components (Ink + React)
│   │   ├── App.tsx       # Root TUI component
│   │   ├── views/        # Screens (Tasks, Projects, TaskDetail)
│   │   └── components/   # Reusable UI components
│   ├── api/              # Todoist REST API wrapper
│   │   ├── client.ts     # HTTP client (fetch)
│   │   ├── tasks.ts      # Task endpoints
│   │   ├── projects.ts   # Project endpoints
│   │   ├── labels.ts     # Label endpoints
│   │   ├── comments.ts   # Comment endpoints
│   │   └── types.ts      # API response types
│   ├── config/           # Configuration management
│   │   └── index.ts      # Read/write ~/.config/todoist-cli/config.toml
│   └── utils/            # Formatting, colors, helpers
├── package.json
├── tsconfig.json
└── bunfig.toml
```

## CLI Commands

```
todoist auth                          # Interactive token input, save to config
todoist task add "text" [-p priority] [-P project] [-l label] [-d due]
todoist task list [-p priority] [-P project] [-l label] [--today] [--overdue]
todoist task complete <id>
todoist task delete <id>
todoist task update <id> [--text] [--priority] [--due]
todoist project list
todoist project create "name" [--color] [--parent]
todoist project delete <id>
todoist label list | create | delete
todoist comment add <task-id> "text"
todoist comment list <task-id>
todoist template save <task-id> "name"
todoist template apply "name" [-P project]
todoist template list
todoist ui                            # Launch interactive TUI
```

## Configuration

- Config file: `~/.config/todoist-cli/config.toml`
- Templates: `~/.config/todoist-cli/templates.json`
- `todoist auth` command for interactive setup
- Environment variable `TODOIST_API_TOKEN` NOT supported (config-only)

## API Layer

- Native `fetch` (built into Bun)
- Todoist REST API v2 (`https://api.todoist.com/rest/v2/`)
- `Authorization: Bearer <token>` header
- Typed responses from API documentation
- Unified error handler: rate-limiting, invalid token, network errors

## TUI Design

```
┌─ Sidebar ──────┬─ Main ─────────────────────────────┐
│ ▸ Inbox        │ ☐ Buy milk               p1  tomorrow│
│   Today        │ ☑ Write tests            p2  today   │
│   Upcoming     │ ☐ Review PR #42          p3  --      │
│ ──────────     │ ☐ Team call              p4  fri     │
│ Projects:      │                                      │
│   Work         │                                      │
│   Personal     │──────────────────────────────────────│
│ Labels:        │ [a]dd [e]dit [c]omplete [d]elete    │
│   urgent       │ [/]filter [q]uit                     │
└────────────────┴──────────────────────────────────────┘
```

**Keybindings:**
- `j/k` or arrows — navigate task list
- `h/l` or Tab — switch sidebar / main
- `a` — add task (inline prompt)
- `e` — edit selected task
- `c` — complete task
- `d` — delete (with confirmation)
- `/` — filter/search
- `q` — quit

**Ink Components:**
- `<App>` — screen router, state management
- `<Sidebar>` — project/filter list
- `<TaskList>` — virtualized task list
- `<TaskRow>` — single task with priority, date, labels
- `<InputPrompt>` — inline input for add/edit
- `<ConfirmDialog>` — destructive action confirmation

## Testing

- `bun test` — built-in test runner
- Unit tests for API layer (fetch mocks)
- Unit tests for CLI command parsing
- Integration tests for TUI components (`ink-testing-library`)

## Agent Team

| Role | Responsibility |
|------|---------------|
| **architect** (lead) | Project init, structure, config, API types, coordination |
| **api-developer** | API client, all endpoints, error handling |
| **cli-developer** | All Commander.js commands, argument parsing, formatted output, templates |
| **tui-developer** | Ink app, all components, navigation, hotkeys, screens |

## Execution Order

1. **architect** — init project (package.json, tsconfig, structure), create API types and config module
2. **api-developer** — implement API layer (depends on types from architect)
3. **cli-developer** + **tui-developer** — work in parallel (both depend on API layer)
4. **architect** — final review and integration
