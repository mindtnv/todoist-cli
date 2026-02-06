# CLI/TUI UX Patterns Research

> Research report for todoist-cli v2. Based on analysis of gh CLI, lazygit, k9s, btop, fzf, atuin, and modern CLI design guidelines.

---

## Table of Contents

1. [Output Formatting](#1-output-formatting)
2. [Interactive Patterns](#2-interactive-patterns)
3. [Keyboard Shortcut Conventions](#3-keyboard-shortcut-conventions)
4. [Help & Onboarding](#4-help--onboarding)
5. [Error Handling UX](#5-error-handling-ux)
6. [Piping & Composability](#6-piping--composability)
7. [Terminal Compatibility & Accessibility](#7-terminal-compatibility--accessibility)
8. [TUI Layout Patterns](#8-tui-layout-patterns)
9. [Recommendations for todoist-cli](#9-recommendations-for-todoist-cli)

---

## 1. Output Formatting

### Lessons from gh CLI (Gold Standard)

gh CLI implements a **three-tier output system**:

| Mode | Flag | Use Case |
|------|------|----------|
| Human-readable | (default) | Terminal display, colored tables |
| JSON | `--json <fields>` | Machine consumption, piping |
| Templated | `--template` / `--jq` | Custom formatting without external tools |

Key design decisions:
- **Auto-detect TTY**: When connected to a terminal, output is pretty-printed with colors. When piped, colors are stripped and output is plain text.
- **Field selection**: `--json` accepts a comma-separated list of fields. Omitting the field list shows available fields -- this is self-documenting.
- **Built-in jq**: gh embeds a jq interpreter so users don't need jq installed. `gh pr list --json number,title --jq '.[].title'`
- **Go templates**: For advanced formatting: `gh pr list --json number,title --template '{{range .}}{{.number}}: {{.title}}{{"\n"}}{{end}}'`
- **`tablerow` helper**: Simplifies tabular output in templates.

### When to Use Each Format

| Format | When |
|--------|------|
| **Table** | Listing multiple items with 3-7 columns (tasks, projects). Default for `list` commands. |
| **Detailed view** | Single item display (`view` commands). Key-value pairs with labels. |
| **JSON** | Machine consumption, scripting, piping to jq/fzf. |
| **Plain text** | Single values (IDs, URLs) for shell variable assignment. |
| **Tree view** | Hierarchical data (project > section > task). |
| **No output** | Successful mutations (add/complete/delete) -- only print on error or with `--verbose`. |

### Recommendations for todoist-cli

```
# Human-readable (default in TTY)
todoist task list
  #1234  Buy groceries     p1  Today     @shopping

# JSON output
todoist task list --json id,content,priority,due
[{"id": "1234", "content": "Buy groceries", ...}]

# Built-in jq filtering
todoist task list --json id,content --jq '.[].content'

# Plain text for scripting
todoist task add "Buy groceries" --quiet
1234

# Pipe-friendly: no colors, no decorations when not TTY
todoist task list | grep "groceries"
```

---

## 2. Interactive Patterns

### Fuzzy Search (from fzf, atuin)

fzf established the standard for fuzzy finding in terminals:
- **CTRL-T**: Paste selected files onto command line
- **CTRL-R**: Fuzzy search command history
- **ALT-C**: cd into selected directory
- **`**` trigger**: Tab completion with fuzzy matching (`kill -9 **<TAB>`)

atuin extends this for shell history:
- Context-aware search (filter by directory, exit code, time range)
- `--format` flag for custom output fields
- Inline display with configurable height

**Recommendations:**
- Add `todoist task list --interactive` or `todoist task find` with built-in fuzzy search
- Support fzf integration: `todoist task list --json id,content --jq '.[].content' | fzf`
- In TUI mode: `/` to activate fuzzy filter on current view (k9s pattern)
- Support `**` completion: `todoist task complete **<TAB>` opens fuzzy selector

### Autocomplete & Suggestions (from gh CLI)

- Shell completions for bash, zsh, fish: `todoist completion zsh`
- Dynamic completions: project names, label names auto-complete from API cache
- Command suggestions on typo: `todoist taks` -> "Did you mean 'task'?"

### Multi-Select & Bulk Operations (from lazygit, k9s)

lazygit uses **visual mode** for multi-select:
- `v` to enter visual/range select mode
- `Space` to toggle individual items
- Batch operations on selection (stage, unstage, discard)

k9s approach:
- `Space` to mark/unmark items
- `Ctrl-Space` to mark all visible
- Marked items shown with a highlight indicator
- Actions apply to all marked items

**Recommendations for TUI:**
```
Space     Toggle select current item
v         Enter visual (range) select mode
Ctrl-a    Select all visible
Ctrl-n    Clear selection
d         Delete selected tasks
c         Complete selected tasks
m         Move selected tasks to project
```

---

## 3. Keyboard Shortcut Conventions

### Navigation (consensus across lazygit, k9s, btop, vim-style tools)

| Action | Primary | Alternative |
|--------|---------|-------------|
| Move down | `j` | `Down` |
| Move up | `k` | `Up` |
| Move left (panel) | `h` | `Left` |
| Move right (panel) | `l` | `Right` |
| Page down | `Ctrl-d` | `PgDn` |
| Page up | `Ctrl-u` | `PgUp` |
| Go to top | `g` | `Home` |
| Go to bottom | `G` | `End` |
| Next panel/tab | `Tab` | `]` |
| Previous panel/tab | `Shift-Tab` | `[` |

### Actions (common across TUI tools)

| Action | Key | Source |
|--------|-----|--------|
| Filter/search | `/` | k9s, lazygit, vim |
| Command mode | `:` | k9s, vim |
| Quit | `q` | universal |
| Help | `?` | lazygit, k9s, btop |
| Refresh | `r` or `Ctrl-r` | k9s |
| Enter/open | `Enter` | universal |
| Back/cancel | `Esc` | universal |
| Delete | `d` | lazygit, k9s |
| Edit | `e` | lazygit |
| New/create | `n` or `a` | common |
| Sort | `s` | k9s |
| Yank/copy | `y` | lazygit, vim |

### Discoverability

lazygit solves shortcut discoverability brilliantly:
- **Context-sensitive footer**: Shows available shortcuts for current panel/state
- **`?` key**: Opens full keybindings reference overlay
- **Menu system**: `x` opens action menu for current context (like a right-click)

k9s approach:
- **Hotkey hints in header**: `<d>elete <l>ogs <s>hell <y>aml`
- **`:` command mode** with autocompletion
- **Crumbs/breadcrumbs**: Show current navigation path

btop approach:
- **Static key legend at bottom** of screen
- **Mouse support** as alternative to keyboard

**Recommendations for todoist-cli TUI:**
```
+----------------------------------------------------------+
| todoist > My Project > Today           [?] Help  [q] Quit|
|                                                          |
| [Sidebar]    | [Task List]                               |
| ...          | ...                                       |
|                                                          |
| <a>dd <e>dit <d>elete <c>omplete  /filter  :command     |
+----------------------------------------------------------+
```

- Bottom bar shows context-sensitive shortcuts
- `?` opens full help overlay with all keybindings
- `x` opens action menu for current item (discover less common actions)
- `:` opens command palette (k9s style) for power users

---

## 4. Help & Onboarding

### Progressive Disclosure (from gh CLI, Evil Martians guide)

The best CLIs use **progressive disclosure** -- show simple info first, detailed info on demand:

**Level 1: Root help** -- Show most common commands only
```
$ todoist
Todoist CLI - manage tasks from your terminal

Usage: todoist <command>

Common commands:
  task      Manage tasks (add, list, complete)
  project   Manage projects

Get started:
  todoist auth        Authenticate with Todoist
  todoist task add    Add a new task

Run 'todoist <command> --help' for more information
```

**Level 2: Command help** -- Show subcommands and common flags
```
$ todoist task --help
Manage tasks

Usage: todoist task <subcommand> [flags]

Subcommands:
  list       List tasks
  add        Add a new task
  complete   Complete a task
  edit       Edit a task
  delete     Delete a task
  view       View task details

Flags:
  --project, -p    Filter by project
  --json           Output as JSON
```

**Level 3: Subcommand help** -- Full documentation
```
$ todoist task add --help
Add a new task

Usage: todoist task add <content> [flags]

Flags:
  --project, -p     Assign to project
  --priority, -P    Set priority (1-4, where 1 is highest)
  --due, -d         Set due date (natural language: "tomorrow", "next monday")
  --label, -l       Add label(s)
  --section, -s     Add to section
  --description     Add description
  --parent          Set parent task ID

Examples:
  todoist task add "Buy groceries" --due tomorrow --priority 1
  todoist task add "Review PR" --project Work --label @code-review
  todoist task add "Call dentist" -d "next tuesday 10am" -p Personal
```

### Key Onboarding Patterns

1. **First-run experience**: If not authenticated, guide the user
   ```
   $ todoist task list
   You're not logged in. Run 'todoist auth' to get started.
   ```

2. **Examples in help**: Every command should have at least 2 practical examples (gh CLI pattern)

3. **`--help` and `-h`**: Both must work. `-h` is the instinctive shorthand.

4. **`todoist` with no args**: Show help, not an error. Highlight getting-started commands.

5. **Shell completions**: Provide `todoist completion <shell>` command with install instructions

6. **Man page generation**: Optional but professional: `todoist --help-man`

---

## 5. Error Handling UX

### Principles (from cli-guidelines, gh CLI, git)

**1. Show what went wrong, why, and how to fix it**

Bad:
```
Error: 403
```

Good:
```
Error: permission denied

Your API token doesn't have write access.
Run 'todoist auth' to re-authenticate with the correct permissions.
```

**2. "Did you mean?" suggestions**

```
$ todoist taks list
Error: unknown command "taks"

Did you mean:
  todoist task list

Run 'todoist --help' for a list of commands.
```

**3. Validate early, fail fast**

- Check auth token before making API calls
- Validate flag values at parse time, not after network requests
- Show all validation errors at once, not one at a time

**4. Non-zero exit codes with meaning**

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Usage error (bad flags, missing args) |
| 3 | Authentication error |
| 4 | Network / API error |
| 5 | Not found (task, project) |

**5. Offline-friendly errors**

```
Error: unable to connect to Todoist API

Check your internet connection and try again.
If the issue persists, check https://status.todoist.com
```

**6. Actionable error messages**

Every error message should include at least one of:
- A command to run to fix the issue
- A URL for more information
- A clear description of what the user should do differently

**7. Respect stderr vs stdout**

- Errors, warnings, progress indicators -> stderr
- Data output -> stdout
- This allows `todoist task list 2>/dev/null` to suppress errors while keeping data

---

## 6. Piping & Composability

### Unix Philosophy Integration (from fzf, gh CLI)

**Core principle**: CLI tools should work well alone AND as part of a pipeline.

### Output Composability

```bash
# List task IDs only (for scripting)
todoist task list --json id --jq '.[].id'

# Pipe to fzf for interactive selection
todoist task list --json id,content --jq '.[] | "\(.id)\t\(.content)"' | \
  fzf --with-nth=2 | cut -f1 | \
  xargs todoist task complete

# Integration with other tools
todoist task list --json content,due --jq '.[] | [.content, .due] | @csv' > tasks.csv

# Count tasks by priority
todoist task list --json priority --jq 'group_by(.priority) | map({priority: .[0].priority, count: length})'
```

### Input Composability

```bash
# Add tasks from a file (one per line)
cat tasks.txt | xargs -I {} todoist task add "{}"

# Stdin support
echo "Buy milk" | todoist task add --stdin

# Accept IDs from pipe
todoist task list --json id --jq '.[].id' | todoist task complete --stdin
```

### Practical Integration Patterns

```bash
# fzf integration helper (could be a built-in alias)
todoist fzf complete   # fuzzy-select and complete a task
todoist fzf view       # fuzzy-select and view a task

# Shell aliases users can create
alias tc='todoist task list --json id,content --jq ".[] | \"\(.id)\t\(.content)\"" | fzf | cut -f1 | xargs todoist task complete'

# Git hook integration
# .git/hooks/post-commit
todoist task add "Review commit: $(git log -1 --oneline)" --project "Code Review"
```

### Recommendations

1. Every `list` command supports `--json` with field selection
2. Built-in `--jq` for filtering without external jq
3. `--quiet` / `-q` flag: suppress decorative output, print only essential data (IDs)
4. Support `--stdin` / `-` for reading input from pipe
5. Respect `NO_COLOR` env variable (see section 7)
6. Consider built-in fzf-style selectors for common workflows

---

## 7. Terminal Compatibility & Accessibility

### Color Handling

**Standard: Respect NO_COLOR (https://no-color.org)**

```
if (process.env.NO_COLOR || !process.stdout.isTTY) {
  // disable all colors
}
```

Priority order for color decisions:
1. `--no-color` flag (explicit disable)
2. `--color` flag (explicit enable)
3. `NO_COLOR` env var
4. `FORCE_COLOR` env var
5. TTY detection (`isTTY`)

**Color usage guidelines (from btop, lazygit):**
- Use color to encode **meaning**, not decoration
- Priority colors: p1=red, p2=orange, p3=blue, p4=default (matches Todoist app)
- Use **bold** for emphasis, not color alone (accessibility)
- Overdue dates in red, today in yellow/amber, future in default
- Support user-configurable color themes (btop pattern)

### Screen Reader & Accessibility

- Never rely on color alone to convey information (add text indicators: `!!!`, `!!`, `!`)
- Support `--plain` flag for screen readers: no decorations, no box drawing, no colors
- Use standard exit codes consistently
- Write structured output to stdout so screen readers can parse it

### Terminal Size Handling

lazygit and k9s both handle this well:
- **Responsive layouts**: Collapse sidebar when terminal is narrow
- **Truncation with ellipsis**: Long text gets `...` at column boundary
- **Dynamic column widths**: Prioritize content > date > labels when space is limited
- **Minimum size detection**: Show warning if terminal is too small

### Unicode & Emoji

- Use Unicode box-drawing characters for borders (btop pattern)
- Provide ASCII fallback via `--ascii` or auto-detect based on `$LANG`
- Avoid emoji in default output (not all terminals render them well)
- Checkbox indicators: `[x]` completed, `[ ]` pending (universal)

---

## 8. TUI Layout Patterns

### Panel Layouts (from lazygit, k9s, btop)

**lazygit model (panels with context switching):**
```
+----------+--------------------------------+
| Status   | Main content area              |
+----------+ (changes based on selected     |
| Files    | panel and item)                |
+----------+                                |
| Branches |                                |
+----------+                                |
| Commits  |                                |
+----------+--------------------------------+
```
- 5 panels, `Tab` switches between them
- Main area changes based on context
- Active panel highlighted with border color
- `Enter` on item shows detail in main area

**k9s model (single-pane with drill-down):**
```
+--------------------------------------------+
| Context: prod | Namespace: default    [?]  |
+--------------------------------------------+
| :pods                                      |
+--------------------------------------------+
| NAME          READY  STATUS   RESTARTS AGE |
| api-server    1/1    Running  0        2d  |
| > web-app     1/1    Running  0        1d  |
| db-backup     0/1    Error    3        5h  |
+--------------------------------------------+
| <d>elete <l>ogs <s>hell <y>aml             |
+--------------------------------------------+
```
- Breadcrumb navigation (`:pods` -> select -> `:containers`)
- Single resource view at a time
- `:` command mode to switch resource types
- `/` to filter within current view
- `Esc` to go back

**btop model (multi-widget dashboard):**
```
+------------------+------------------+
| CPU              | Memory           |
| [graph bars]     | [graph bars]     |
+------------------+------------------+
| Process List                        |
| PID  NAME     CPU%  MEM%  ...      |
+-------------------------------------+
```
- Multiple simultaneous data widgets
- Live-updating graphs and meters
- Mouse-clickable areas
- Presets for different layouts (1-4 key)

### Recommended Layout for todoist-cli TUI

**Default: Two-panel sidebar layout**
```
+-------+-------------------------------------------+
| [P]   | Tasks                        Filter: all  |
| rojects|                                          |
|       | [ ] Buy groceries       p1  Today   @shop |
| > Inbox| [x] Call dentist        p3  Done         |
| Work  | [ ] Review PR #42       p2  Tomorrow      |
| Personal|                                         |
| Shopping|                                         |
|       |                                           |
+-------+-------------------------------------------+
| <a>dd <c>omplete <d>elete <e>dit  /search  ?help |
+-------+-------------------------------------------+
```

**Narrow terminal: Collapse to single pane**
```
+-------------------------------------------+
| > Inbox (3)                               |
+-------------------------------------------+
| [ ] Buy groceries       p1  Today  @shop  |
| [x] Call dentist         p3  Done          |
| [ ] Review PR #42       p2  Tomorrow       |
+-------------------------------------------+
| <a>dd <c>omplete <d>elete  /search  ?help |
+-------------------------------------------+
```

**Detail view: Task expanded**
```
+-------------------------------------------+
| < Back to list                Inbox > Task|
+-------------------------------------------+
| Buy groceries                             |
|                                           |
| Priority:  !!! (p1)                       |
| Due:       Today, Feb 6                   |
| Labels:    @shopping, @errands            |
| Project:   Personal                       |
| Section:   To Buy                         |
|                                           |
| Description:                              |
|   Get milk, bread, eggs, and butter       |
|                                           |
| Subtasks:                                 |
|   [ ] Milk                                |
|   [ ] Bread                               |
|   [x] Eggs                                |
+-------------------------------------------+
| <e>dit <c>omplete <d>elete  ?help        |
+-------------------------------------------+
```

### Visual Feedback Patterns

From lazygit and k9s:
- **Loading states**: Spinner or `Loading...` text while API calls are in progress
- **Success feedback**: Brief flash or status bar message: "Task completed" (auto-dismiss 2s)
- **Confirmation for destructive actions**: `Delete task "Buy groceries"? (y/N)`
- **Undo support**: "Task completed. Press Ctrl-Z to undo" (within 5s window)
- **Optimistic updates**: Update UI immediately, reconcile with API response

---

## 9. Recommendations for todoist-cli

### Priority 1: Must Have

| Feature | Pattern Source | Impact |
|---------|---------------|--------|
| `--json` output with field selection | gh CLI | Enables scripting/piping |
| `--jq` built-in filtering | gh CLI | No external dependency needed |
| TTY-aware output (colors + formatting auto-toggle) | gh CLI, modern standard | Works in pipes |
| `NO_COLOR` / `FORCE_COLOR` support | no-color.org standard | Accessibility |
| "Did you mean?" for typos | git, npm | Reduces frustration |
| Context-sensitive shortcut bar in TUI | lazygit, k9s | Discoverability |
| `?` help overlay in TUI | lazygit | Self-documenting |
| `/` fuzzy filter in TUI | k9s, fzf | Fast navigation |
| `Space` multi-select in TUI | lazygit | Bulk operations |
| Vim-style navigation (j/k/g/G) | universal TUI | Expected by target audience |
| Confirmation for destructive actions | universal | Safety |
| Non-zero exit codes with semantic meaning | POSIX, cli-guidelines | Scripting reliability |
| Shell completions (bash, zsh, fish) | gh CLI | Discoverability |

### Priority 2: Should Have

| Feature | Pattern Source | Impact |
|---------|---------------|--------|
| `--quiet` / `-q` for minimal output | Unix convention | Script-friendly |
| Command aliases (`todoist alias set`) | gh CLI | Power user customization |
| Undo for complete/delete (5s window) | mobile UX | Error recovery |
| `:` command palette in TUI | k9s | Power users |
| Responsive layout (collapse sidebar) | lazygit | Small terminals |
| `x` action menu in TUI | lazygit | Discover rare actions |
| Progress indicator for API calls | modern UX | Perceived performance |
| `--stdin` for pipe input | Unix convention | Composability |
| Configurable color theme | btop | Personalization |
| Examples in every `--help` | gh CLI | Onboarding |

### Priority 3: Nice to Have

| Feature | Pattern Source | Impact |
|---------|---------------|--------|
| Built-in fzf-style selector (`todoist fzf`) | fzf | Quick actions |
| Tree view for project hierarchy | btop layout | Visual organization |
| `--template` Go-style templates | gh CLI | Advanced formatting |
| Plugin/extension system | k9s, gh CLI | Extensibility |
| `--web` flag to open in browser | gh CLI | Quick browser escape hatch |
| Sync indicator in TUI | atuin | Data freshness awareness |
| Keyboard shortcut customization | lazygit, btop | Power users |
| ASCII art fallback mode | btop | Terminal compatibility |
| `todoist completion install` auto-setup | modern CLIs | Smooth onboarding |

### Implementation Notes

**Output architecture:**
```typescript
// Centralized output handler
function output(data: unknown, options: OutputOptions) {
  if (options.json) {
    const filtered = selectFields(data, options.json);
    if (options.jq) {
      return console.log(jqFilter(filtered, options.jq));
    }
    return console.log(JSON.stringify(filtered, null, isTerminal() ? 2 : 0));
  }
  if (isTerminal()) {
    return renderTable(data, { colors: !process.env.NO_COLOR });
  }
  return renderPlainText(data);
}
```

**Error handling architecture:**
```typescript
class CliError extends Error {
  constructor(
    message: string,
    public code: number,
    public suggestion?: string,
    public helpUrl?: string
  ) {
    super(message);
  }
}

// Usage:
throw new CliError(
  'Task not found',
  5,
  'Run "todoist task list" to see available tasks',
);
```

**TUI keyboard handling:**
```typescript
// Layered keybinding system
const GLOBAL_KEYS = { '?': 'help', 'q': 'quit', ':': 'command' };
const NAVIGATION_KEYS = { 'j': 'down', 'k': 'up', '/': 'filter' };
const LIST_KEYS = { 'a': 'add', 'c': 'complete', 'd': 'delete', 'Space': 'select' };
const DETAIL_KEYS = { 'e': 'edit', 'Esc': 'back' };

// Context determines active keybinding layer
function getActiveKeys(context: ViewContext) {
  return { ...GLOBAL_KEYS, ...NAVIGATION_KEYS, ...contextKeys[context] };
}
```

---

## Sources

- gh CLI formatting: https://cli.github.com/manual/gh_help_formatting
- gh CLI scripting: https://github.blog/engineering/engineering-principles/scripting-with-github-cli/
- lazygit UX discussion: https://github.com/jesseduffield/lazygit/issues/1712
- lazygit 5 years retrospective: https://jesseduffield.com/Lazygit-5-Years-On/
- k9s features: https://k9scli.io/
- k9s cheatsheet: https://ahmedjama.com/blog/2025/09/the-complete-k9s-cheatsheet/
- fzf shell integration: https://junegunn.github.io/fzf/shell-integration
- fzf ripgrep integration: https://junegunn.github.io/fzf/tips/ripgrep-integration/
- atuin search docs: https://docs.atuin.sh/cli/reference/search/
- btop repository: https://github.com/aristocratos/btop
- CLI UX patterns (Lucas Costa): https://lucasfcosta.com/blog/ux-patterns-cli-tools
- CLI guidelines: https://github.com/cli-guidelines/cli-guidelines
- BetterCLI.org: https://bettercli.org/
- Modern CLI book: https://moderncli.dev/
- NO_COLOR standard: https://no-color.org
- 6 things dev tools need in 2026: https://evilmartians.com/chronicles/six-things-developer-tools-must-have-to-earn-trust-and-adoption
