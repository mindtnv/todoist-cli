<p align="center">
  <h1 align="center">todoist-cli</h1>
  <p align="center">A fast, keyboard-driven Todoist client for the terminal</p>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/runtime-Bun-f9f1e1" alt="Bun">
  <img src="https://img.shields.io/badge/version-0.2.0-green" alt="Version">
</p>

---

Two ways to use it: a **full interactive TUI** with vim-style navigation, or **scriptable CLI commands** that pipe and compose with other tools.

## Features

- **Interactive TUI** with sidebar, multi-select, and command palette
- **Quick-add** with natural language — `todoist a "Buy milk tomorrow #Shopping p1 @errands"`
- **Vim-style navigation** — `j`/`k`, `gg`/`G`, `/` to search
- **Optimistic UI** — actions feel instant, synced in the background
- **10-second undo** for destructive actions (complete, delete, move)
- **Pipe-friendly output** — `--json`, `--csv`, `--tsv`, `--quiet` for scripting
- **Eisenhower matrix**, weekly review, productivity stats
- **Saved filters** registered as top-level commands

## Installation

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- A [Todoist](https://todoist.com) account

### From source

```bash
git clone https://github.com/your-username/todoist-cli.git
cd todoist-cli
bun install
bun link   # makes `todoist` available globally
```

### Authentication

```bash
todoist auth
# Paste your API token from https://todoist.com/app/settings/integrations/developer
```

Or set the environment variable:

```bash
export TODOIST_API_TOKEN="your-token-here"
```

## Quick Start

```bash
# See today's tasks
todoist today

# Add a task with natural language
todoist a "Review PR tomorrow #Work p3 @code-review"

# Launch interactive TUI
todoist ui
```

## CLI Commands

### Shortcuts

| Command | Description |
|---------|-------------|
| `todoist today` | Today's and overdue tasks, sorted by priority |
| `todoist inbox` | Inbox tasks |
| `todoist next` | Single highest-priority actionable task |
| `todoist upcoming` | Next 7 days, grouped by date |
| `todoist overdue` | Overdue tasks, oldest first |
| `todoist deadlines` | Tasks with upcoming deadlines (default 14 days) |
| `todoist search <query>` | Search tasks by text |
| `todoist a "<text>"` | Quick-add a task |
| `todoist ui` | Launch interactive TUI |

### Task Management

```bash
todoist task add "Buy groceries"           # Add a task
todoist task add                            # Interactive mode (guided prompts)
todoist task list                           # List all tasks
todoist task list --filter "p1 & today"     # Filter with Todoist syntax
todoist task list --tree                    # Hierarchical tree view
todoist task show <id>                      # Full task details with comments
todoist task complete <id>                  # Complete a task
todoist task update <id> --due tomorrow     # Update due date
todoist task move <id> --project Work       # Move to another project
todoist task delete <id>                    # Delete a task
```

### Projects, Labels, Sections

```bash
todoist project list                        # List projects
todoist project show "Work"                 # Project details with sections
todoist label list                          # List labels
todoist section list -P "Work"              # Sections in a project
```

### Other Commands

| Command | Description |
|---------|-------------|
| `todoist matrix` | Eisenhower priority matrix |
| `todoist review` | Interactive GTD weekly review |
| `todoist stats` | Productivity statistics and karma |
| `todoist completed` | Recently completed tasks |
| `todoist log` | Activity log |
| `todoist template save <id> <name>` | Save task as template |
| `todoist filter save <name> <query>` | Save a reusable filter |
| `todoist completion <shell>` | Shell completions (bash/zsh/fish) |

## Quick-Add Syntax

The `todoist a` command parses smart syntax inline:

```
todoist a "Buy milk tomorrow #Shopping p1 @errands //Groceries {2026-03-15}"
```

| Token | Meaning | Example |
|-------|---------|---------|
| `p1`–`p4` | Priority (1=normal, 4=urgent) | `p3` |
| `#Name` | Project | `#Work` |
| `@name` | Label (multiple allowed) | `@errands @personal` |
| `//Name` | Section | `//Groceries` |
| `{YYYY-MM-DD}` | Deadline | `{2026-03-15}` |
| Date words | Due date | `today`, `tomorrow`, `next week`, `monday` |

Preview without creating:

```bash
todoist a "Buy milk tomorrow #Shopping p1" --dry-run
```

## Output Formats

All list commands support multiple output modes for scripting:

```bash
todoist today --json "id,content,priority"   # JSON with selected fields
todoist today --csv                           # CSV format
todoist today --tsv                           # TSV format
todoist today -q                              # IDs only (one per line)
todoist task list --count                     # Just the count
todoist inbox --watch 10                      # Auto-refresh every 10s
```

### Piping Examples

```bash
# Complete all overdue p4 tasks
todoist task list --filter "overdue & p4" -q | todoist task complete -

# Export today's tasks
todoist today --csv > today.csv

# Batch create from file
todoist task add --batch < tasks.txt

# Pipe IDs between commands
todoist search "meeting" -q | xargs todoist task complete
```

## Interactive TUI

Launch with `todoist ui`. Press `?` for the full help overlay.

### Key Bindings

<details>
<summary><strong>Navigation</strong></summary>

| Key | Action |
|-----|--------|
| `j` / `k` | Move down / up |
| `gg` / `G` | First / last task |
| `Ctrl-d` / `Ctrl-u` | Page down / up |
| `Tab` | Switch sidebar / task panel |
| `Enter` | Open task detail |
| `Esc` | Go back / clear selection |

</details>

<details>
<summary><strong>Task Actions</strong></summary>

| Key | Action |
|-----|--------|
| `a` | Quick-add task (with live preview) |
| `N` | New task (full editor modal) |
| `A` | Add subtask |
| `e` | Edit task |
| `c` | Complete task |
| `d` | Delete task |
| `1`–`4` | Set priority |
| `t` | Set due date |
| `D` | Set deadline |
| `m` | Move to project |
| `l` | Edit labels |
| `u` | Undo last action (10s window) |
| `r` | Refresh from API |
| `o` | Open in browser |

</details>

<details>
<summary><strong>Selection & Search</strong></summary>

| Key | Action |
|-----|--------|
| `Space` | Toggle select |
| `v` | Range select |
| `Ctrl-a` | Select all |
| `Ctrl-n` | Clear selection |
| `/` | Fuzzy search |
| `f` | API filter query |
| `s` | Sort menu |
| `:` | Command palette |
| `?` | Help overlay |
| `q` | Quit |

</details>

All task actions work on multi-selected tasks too — select with `Space` or `v`, then `c`/`d`/`1`-`4`/`t`/`m` to operate in bulk.

## Configuration

Config file: `~/.config/todoist-cli/config.toml`

```toml
[auth]
api_token = "your-token"

[defaults]
project = "Work"        # Default project for new tasks
priority = 2            # Default priority (1-4)
labels = ["routine"]    # Default labels

[filters]
work = "p1 & #Work"    # Available as: todoist work
urgent = "p4 & today"  # Available as: todoist urgent
```

Saved filters become top-level commands — `todoist work` runs `p1 & #Work`.

## Shell Completions

```bash
# Bash
eval "$(todoist completion bash)"

# Zsh (add to .zshrc)
todoist completion zsh > ~/.zfunc/_todoist

# Fish
todoist completion fish | source
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

[MIT](./LICENSE)
