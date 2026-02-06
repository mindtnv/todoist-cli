# Competitor Research: CLI/TUI Task Management Tools

> Research date: 2026-02-06
> Purpose: Identify features we're missing in todoist-cli-v2

---

## 1. Taskwarrior (2.8k+ GitHub stars)

**What it is:** The gold standard of CLI task management. 15+ years old, massive ecosystem.

### Killer Features We Don't Have

| Feature | Description | Priority for Us |
|---------|-------------|-----------------|
| **Urgency scoring** | Polynomial formula combining due date proximity, priority, age, tags, project, dependencies, and annotations into a single numeric urgency score. Tasks auto-sort by urgency. Users can customize weight coefficients. | HIGH |
| **Task dependencies** | `task 5 modify depends:3,4` -- task 5 blocks until 3 and 4 are done. Circular dependency detection. Visual dependency chains. Blocked tasks deprioritized in urgency. | HIGH |
| **Annotations** | Add timestamped notes to any task: `task 3 annotate "Talked to Bob, he said..."`. Multiple annotations per task (different from Todoist comments -- these are inline, lightweight). | MEDIUM |
| **Virtual tags** | Auto-computed tags: +OVERDUE, +TODAY, +WEEK, +MONTH, +BLOCKED, +UNBLOCKED, +ACTIVE, +PROJECT, +TAGGED, +PENDING, +COMPLETED. Filter by computed state without manual tagging. | HIGH |
| **Hook scripts** | Event-driven plugin system. `on-add`, `on-modify`, `on-launch`, `on-exit` hooks. Scripts in any language, receive/emit JSON. Users build custom automation (auto-tag, auto-assign, URL expansion, integration with other tools). | MEDIUM |
| **Burndown charts** | `task burndown.weekly` -- ASCII art charts showing pending/active/completed over time. Predicts project completion date based on velocity. Daily/weekly/monthly views. | MEDIUM |
| **Reports system** | Highly customizable reports. Users define columns, sorting, filtering, grouping. Built-in: `next`, `ready`, `blocked`, `waiting`, `recurring`, `summary`, `history`, `burndown`. | HIGH |
| **`task start` / Active tracking** | Mark a task as actively being worked on. Changes status, bumps urgency, appears in reports. Great for "what was I doing?" after a break. | MEDIUM |
| **Custom attributes (UDA)** | User-Defined Attributes. Add arbitrary typed fields to tasks (string, numeric, date, duration). E.g., add `estimate:2h` or `reviewed:yes`. | LOW |
| **Time tracking integration** | Via Timewarrior companion tool. `task start` / `task stop` automatically logs time. | LOW |
| **Waiting tasks** | `task 3 modify wait:monday` -- task disappears from default view until the wait date. Different from "scheduled" -- it's about hiding noise. | MEDIUM |
| **Context switching** | `task context work` -- globally filters all reports to only show work-related tasks. Switch contexts without retyping filters. | HIGH |

### What Users Consistently Praise
- Speed (everything is instant, local data)
- Filter expression language is incredibly powerful
- "Data as text" philosophy -- your tasks are yours
- Scriptability and Unix pipe integration
- The urgency algorithm -- "it tells me what to do next"

### Common Complaints
- Steep learning curve
- No native sync (requires Taskchampion server)
- No mobile client
- Report configuration is complex
- No native GUI/TUI (relies on third-party like Vit, taskwarrior-tui)

---

## 2. todo.txt (6k+ GitHub stars)

**What it is:** Plain text todo file with a simple CLI. The "keep it simple" champion.

### Killer Features We Don't Have

| Feature | Description | Priority for Us |
|---------|-------------|-----------------|
| **Add-on / plugin system** | Extensible via shell script add-ons. Users write `todo.sh actions.d/myplugin` to add new commands. Active ecosystem of community plugins. | MEDIUM |
| **Archive system** | Completed tasks move to `done.txt`. Clean separation of active/completed. Can review done.txt anytime. No clutter in active list. | LOW |
| **Contexts (@context)** | `@phone`, `@computer`, `@office` -- GTD-style contexts. Filter by where/how you can do the task. Different from projects. | MEDIUM |
| **Plain text portability** | Zero lock-in. Edit with vim, sync with git/Dropbox, grep with standard tools. | N/A |
| **Shell completion** | Tab completion for projects, contexts, and commands in bash/zsh. | HIGH |

### What Users Love
- "I can edit it with any text editor"
- Simplicity -- learn in 5 minutes
- Portability and ownership of data
- Unix philosophy: pipe, grep, awk
- No accounts, no servers, no cloud

### Common Complaints
- No subtasks or hierarchy
- No due date reminders
- Limited filtering vs Taskwarrior
- No recurring tasks natively
- "Too simple" for complex workflows

---

## 3. sachaos/todoist (1.7k GitHub stars)

**What it is:** The most popular unofficial Todoist CLI, written in Go. Our most direct competitor.

### Killer Features We Don't Have

| Feature | Description | Priority for Us |
|---------|-------------|-----------------|
| **`quick` / `q` command** | Natural language quick-add matching Todoist's own Quick Add syntax: `todoist quick "Buy milk tomorrow #Shopping p1"`. Parses project, priority, date inline. | HIGH |
| **fzf/peco integration** | Pipe task lists into fuzzy finders for interactive selection: `todoist list \| fzf`. Select tasks via fuzzy search, pass IDs to modify/close/delete. | HIGH |
| **Completed tasks list** | `todoist completed-list` shows recently completed tasks with dates. (Premium feature from Todoist API.) | MEDIUM |
| **Karma display** | `todoist karma` shows productivity karma stats from Todoist. | LOW |
| **Namespace/hierarchy display** | Shows parent project path: `Work > Backend > API`. Full hierarchy visibility in list view. | MEDIUM |
| **CSV output** | `todoist --csv list` for pipe-friendly structured output. Easy integration with other tools, spreadsheets. | MEDIUM |
| **Sync command** | Explicit `todoist sync` to refresh local cache. Local-first with on-demand sync. | HIGH |
| **Custom keybindings (Ctrl+X)** | Bash readline keybindings for common operations. Ctrl+X then shortcut for fast add/list/etc. | LOW |
| **Color-coded output** | Priority-based coloring, project coloring, overdue highlighting in terminal. | MEDIUM |

### What Users Praise
- Fast (Go binary, local cache)
- fzf integration is a game-changer for power users
- Matches Todoist filter syntax
- Simple, does one thing well

### Common Complaints
- Abandoned for periods (API breakage)
- No TUI mode
- Limited editing capabilities
- No comment support
- No section support

---

## 4. Doist/todoist-cli (Official, 27 stars)

**What it is:** Doist's own official CLI tool. New (2025-2026), TypeScript/Node.

### Features to Note

| Feature | Description | Priority for Us |
|---------|-------------|-----------------|
| **Browser-based OAuth login** | `td auth login` opens browser for proper OAuth flow, not just API token paste. | MEDIUM |
| **Natural language add** | `td add "Buy milk tomorrow #Shopping"` -- same Quick Add syntax as Todoist web/mobile. | HIGH |
| **`td today` shortcut** | Dedicated command showing today's tasks + overdue. Most common view as a first-class command. | HIGH |
| **`td inbox` shortcut** | Quick access to inbox without filtering. | MEDIUM |

### Takeaways
- Official CLI validates the market demand
- It's very basic right now -- opportunity for us to be feature-complete
- OAuth login is a nicer UX than raw API tokens

---

## 5. Ultralist (955 GitHub stars)

**What it is:** Modern GTD-focused CLI task manager. Written in Go. Has a Pro tier with sync.

### Killer Features We Don't Have

| Feature | Description | Priority for Us |
|---------|-------------|-----------------|
| **GTD contexts** | `+project` for projects, `@context` for contexts. `ultralist l group:context` groups tasks by context. | MEDIUM |
| **Task grouping in output** | `ultralist l group:project` or `group:context` -- visual grouping in CLI output. | HIGH |
| **Agenda view** | `ultralist l due:agenda` -- shows only today + overdue. The "90% use case" view. | HIGH |
| **Archiving workflow** | Complete -> Archive separation. `ultralist ar c` archives all completed. Keeps active list clean. | LOW |
| **Task status (not just done/pending)** | Tasks can be `pending`, `started`, or `completed`. Three-state model. Filter by `status:started`. | MEDIUM |
| **Task recurrence** | `recur:weekdays`, `recur:weekly`, `recur:monthly`, `until:dec5`. When completed, new instance auto-created. | HIGH (if not already supported via Todoist) |
| **Completion date filtering** | `ultralist l completed:tod` -- see what you finished today. `completed:thisweek` for weekly review. | MEDIUM |
| **Shell alias culture** | Documentation actively promotes aliases: `alias u="ultralist"`, `alias up="ultralist l due:agenda group:project"`. We should promote this too. | LOW |
| **JSON storage format** | `.todos.json` is well-documented, machine-readable. Users script against it. | LOW |
| **Ultralist Pro integrations** | Slack, Basecamp, GitHub integrations. Sync across machines. | LOW |

### What Users Praise
- GTD methodology built-in
- Beautiful CLI output
- Intuitive command syntax
- Speed (Go binary)
- Grouping and filtering are powerful yet simple

### Common Complaints
- Smaller community than Taskwarrior
- Pro tier costs money for sync
- No TUI
- Less powerful filtering than Taskwarrior

---

## 6. Dooit (2.8k GitHub stars)

**What it is:** Beautiful TUI todo manager written in Python (Textual). Not Todoist-specific (local only).

### Killer Features We Don't Have

| Feature | Description | Priority for Us |
|---------|-------------|-----------------|
| **Vim-style keybindings** | Full vim motions: j/k navigation, `/` search, `dd` delete, etc. | HIGH |
| **Plugin/extension system** | `dooit-extras` package. Python config file acts as plugin system. Users write custom widgets, formatters, integrations. | MEDIUM |
| **Custom status bar** | Configurable bottom bar showing stats, clock, active filters, etc. | MEDIUM |
| **Sort menu** | Interactive sort by: Name, Date, Urgency, Status. Toggle sort direction. | HIGH |
| **Nested/branching todos** | Infinite nesting. Visual tree of subtasks with indent. Collapse/expand. | HIGH |
| **Urgency-based sorting** | Tasks sorted by computed urgency (similar to Taskwarrior). | MEDIUM |
| **In-place editing** | Edit task text inline in the TUI. No modal dialog needed. | HIGH |
| **Custom theming via CSS** | Built on Textual -- full CSS-based theming. Users can completely reskin the UI. | LOW |
| **Python config file** | Config-as-code. Users write Python to configure behavior, create custom commands, add integrations. | LOW |
| **Search on the fly** | Real-time fuzzy search filtering as you type. | HIGH |

### What Users Praise
- "Beautiful and functional"
- Vim keybindings feel natural
- Very fast for a Python app
- Easy to extend
- Nested tasks are a must

### Common Complaints
- Local only (no cloud sync)
- No mobile companion
- Limited ecosystem (smaller community)
- Python dependency can be annoying

---

## 7. Terminalist (12 stars, Rust)

**What it is:** Todoist TUI client in Rust with Ratatui. Small project but relevant for direct comparison.

### Notable Features

| Feature | Description | Priority for Us |
|---------|-------------|-----------------|
| **Local SQLite cache** | In-memory SQLite for fast data access. Full offline capability. | MEDIUM |
| **Smart sync** | Auto-sync on launch + every 5 minutes + manual `r` key. Balances freshness with API limits. | MEDIUM |
| **Mouse support** | Click to select tasks, projects. Not just keyboard. | LOW |
| **TOML config** | `--generate-config` creates default config file. | LOW |

---

## Summary: Top Missing Features (Prioritized)

### Tier 1 -- Must Have (High Impact, Users Expect These)

1. **Natural language quick-add** -- `add "Buy milk tomorrow #Shopping p1"`. Matches Todoist's own Quick Add.
2. **Urgency scoring & smart sorting** -- Auto-sort tasks by computed urgency. No more manual priority guessing.
3. **Virtual tags / smart filters** -- Auto-computed filters: OVERDUE, TODAY, BLOCKED, UNBLOCKED, ACTIVE.
4. **Task grouping in output** -- `--group-by project`, `--group-by label`, `--group-by date` in CLI output.
5. **`today` / `inbox` shortcut commands** -- Most-used views as first-class commands.
6. **fzf/peco integration** -- Pipe-friendly output + fuzzy finder integration for interactive selection.
7. **Context switching** -- `config context work` to globally filter all views.
8. **Interactive sort in TUI** -- Sort menu: by name, date, priority, urgency.
9. **In-place inline editing in TUI** -- Edit task text directly, no modal needed.
10. **Real-time fuzzy search in TUI** -- Filter-as-you-type across all tasks.
11. **Vim keybindings in TUI** -- j/k, /, dd, gg, G etc.
12. **Shell completions** -- Bash, Zsh, Fish auto-completion for commands, projects, labels.

### Tier 2 -- Should Have (Differentiators)

13. **Task dependencies** -- `--depends-on <task-id>`. Show blocked/unblocked status.
14. **Burndown/progress charts** -- ASCII/unicode charts showing task velocity.
15. **Nested subtask tree view** -- Visual hierarchy with collapse/expand in TUI.
16. **CSV/JSON export** -- Machine-readable output for scripting and integration.
17. **Completed tasks history** -- View recently completed tasks with dates.
18. **Annotations / quick notes** -- Lightweight inline notes (simpler than full comments).
19. **Active task tracking** -- `task start` equivalent. "What am I working on right now?"
20. **Waiting/snoozed tasks** -- Hide tasks until a specific date.
21. **Color-coded priority output** -- Priority-based coloring in CLI mode.
22. **Local cache with sync** -- Offline-first with explicit sync command.

### Tier 3 -- Nice to Have (Power User / Long-term)

23. **Hook/plugin system** -- Event-driven scripts (on-add, on-complete, on-modify).
24. **Custom reports** -- User-defined views with custom columns, sorting, filtering.
25. **GTD contexts (@context)** -- Separate from projects, filter by context.
26. **OAuth browser login** -- Open browser for Todoist OAuth flow.
27. **Alias/shortcut documentation** -- Actively promote shell aliases in docs.
28. **Karma/productivity stats** -- Display Todoist karma and streaks.
29. **Time tracking integration** -- `start`/`stop` with duration tracking.
30. **Custom attributes / metadata** -- User-defined fields on tasks.

---

## Competitive Positioning

```
                    Simple                           Complex
                      |                                |
     todo.txt --------+--- Ultralist --- sachaos/todoist --- Taskwarrior
                      |                                |
                      |        todoist-cli-v2          |
                      |        (OUR TARGET)            |
                      |                                |
     CLI only --------+--------------------------------+-- TUI available
                      |                                |
                Doist CLI         Dooit            Terminalist
```

**Our sweet spot:** We should aim to be MORE powerful than sachaos/todoist and the official CLI, with a Dooit-level TUI, while staying simpler than Taskwarrior. The key differentiator is native Todoist integration + best-in-class TUI + power-user CLI features.

**Our biggest gaps vs. sachaos/todoist:** No quick-add, no fzf integration, no shell completions.
**Our biggest gaps vs. Taskwarrior:** No urgency scoring, no dependencies, no context switching, no reports.
**Our biggest gaps vs. Dooit:** Vim keybindings depth, sort menu, inline editing, fuzzy search.
