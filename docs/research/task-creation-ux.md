# Task Creation UX Research

Analysis of task creation patterns across leading CLI/TUI task managers and productivity apps.

---

## 1. Product Analysis

### 1.1 Todoist (Quick Add)

**One-liner creation:**
Todoist's Quick Add is the gold standard for inline metadata parsing. A single text input can contain all task metadata using special prefixes:

```
Buy milk tomorrow p1 #Shopping @errands
Meeting with John every Monday at 10am #Work p2
```

**Inline syntax shortcuts:**
| Prefix | Function | Example |
|--------|----------|---------|
| (natural language) | Due date | `tomorrow`, `every friday`, `Jan 15 at 3pm` |
| `{date}` | Deadline | `{march 30}` |
| `p1`-`p3` | Priority (p1=highest, no p4 needed -- default is no priority) | `p1` |
| `#` | Project | `#Work` (with live autocomplete) |
| `@` | Label | `@urgent` (with live autocomplete) |
| `/` | Section | `/Backlog` (with live autocomplete) |
| `+` | Assignee (teams) | `+John` |
| `!` | Reminder | `!14:00`, `!30 min before` |

**Interactive creation:** Quick Add opens via `Q` hotkey (or Ctrl+Q / Cmd+K) with a text field at the top and clickable buttons below for date, priority, label, project. User can type inline syntax OR click buttons -- both approaches work simultaneously. **Visual chips** appear inline as items are recognized (e.g., typing "tomorrow" highlights it as a date chip). The Quick Add toolbar is **user-customizable** -- users can reorder, show, or hide action buttons.

**Description in Quick Add:** `Shift+Enter` expands a description field below the task name. `Ctrl+Enter` / `Cmd+Return` saves from within the description field.

**Smart parsing:** Natural language date parsing is best-in-class. Supports ~40 languages. Recognizes:
- Relative dates: `tomorrow`, `next week`, `in 3 days`
- Recurring: `every monday`, `every 2 weeks`, `every last friday`
- Specific: `Jan 15`, `15/01/2026`, `2026-01-15 at 3pm`
- Smart: `today at 5pm`, `this evening`

**Defaults:** New tasks go to Inbox, no date, priority 4 (none), no labels. The "default project" is configurable.

**Repeat creation:** After pressing Enter, the Quick Add dialog stays open for the next task (on desktop). On mobile, it closes but the "+" button is always accessible.

**Global shortcut:** System-wide keyboard shortcut captures tasks from any app without switching context.

**Key insight:** The power is in the *hybrid* approach -- type inline syntax for speed, or click buttons for discoverability. Both methods coexist in the same input. The **live autocomplete** on `#`, `@`, `/` means users never need to memorize exact project/label/section names. The **visual chips** showing parsed items in real-time build confidence in what the parser extracted.

---

### 1.2 Taskwarrior

**One-liner creation:**
```bash
task add Find the adjustable wrench project:Home priority:H due:friday +plumbing +urgent
```

**Attribute syntax:**
| Syntax | Function | Example |
|--------|----------|---------|
| (plain text) | Description | `Fix the door` |
| `project:` | Project | `project:Home.Kitchen` |
| `priority:` | Priority (H/M/L) | `priority:H` |
| `due:` | Due date | `due:friday`, `due:2026-02-15` |
| `scheduled:` | Scheduled date | `scheduled:tomorrow` |
| `until:` | Expiration | `until:eoy` |
| `recur:` | Recurrence | `recur:weekly` |
| `wait:` | Hidden until | `wait:monday` |
| `+tag` | Add tag | `+urgent` |
| `depends:` | Dependencies | `depends:12` |
| Any UDA key | Custom attribute | `estimate:4` |

**Interactive creation:** None built-in. `task add` is purely command-line. However, `task edit` opens `$EDITOR` for full modification of all fields.

**Smart parsing:** Date parsing supports named dates (`today`, `tomorrow`, `monday`, `eoy`, `eom`, `eoq`, `soy`, `sow`), relative dates (`due:3d`, `due:2w`), ISO format, and computed dates (`due:monday+2d`).

**Defaults:** Status=pending, priority=none, project=none. Configurable via `default.project`, `default.priority`, `default.due` etc.

**Repeat creation:** Each `task add` is a separate command. Can be scripted or aliased. No built-in batch mode, but shell pipelines work well:
```bash
echo "Task 1\nTask 2\nTask 3" | while read t; do task add "$t" project:Work; done
```

**UDAs (User Defined Attributes):** Users can define custom fields:
```bash
task config uda.estimate.type numeric
task config uda.estimate.label Est
task add "Paint door" estimate:4
```

**Annotations:** Cannot be added during creation -- only after (`task 1 annotate "Note here"`).

**Key insight:** The `key:value` attribute syntax is extremely powerful and extensible. Position-independent -- attributes can appear anywhere in the command. The filter/command/modification syntax is consistent across all operations.

---

### 1.3 todo.txt

**One-liner creation:**
```bash
todo.sh add "(A) Call mom @phone +family due:2026-02-15"
```

**Syntax:**
| Syntax | Function | Example |
|--------|----------|---------|
| `(A)`-`(Z)` | Priority (must be first) | `(A)` |
| `+project` | Project tag | `+work` |
| `@context` | Context | `@phone` |
| `YYYY-MM-DD` | Creation date (auto) | `2026-02-07` |
| `due:YYYY-MM-DD` | Due date (addon) | `due:2026-02-15` |
| `t:YYYY-MM-DD` | Threshold date (addon) | `t:2026-02-10` |

**Interactive creation:** None. Purely text-based.

**Smart parsing:** None built-in. The format is static -- no natural language dates. Extensions/addons can add this.

**Defaults:** Creation date auto-added. No default priority or project.

**Repeat creation:** `addm` command supports multi-line input:
```bash
todo.sh addm "First task +project1 @context
Second task +project2 @context"
```

**Key insight:** Extreme simplicity is the feature. One line = one task. Plain text file that works with `grep`, `sort`, `sed`, and any text editor. The `+project` and `@context` convention has influenced many other tools (including Todoist's `#` and `@`).

---

### 1.4 GitHub CLI (gh)

**One-liner creation:**
```bash
gh issue create --title "Bug: login fails" --body "Steps to reproduce..." --label bug --assignee @me
```

**Flags:**
| Flag | Function |
|------|----------|
| `-t, --title` | Title |
| `-b, --body` | Body text |
| `-F, --body-file` | Read body from file |
| `-l, --label` | Labels (repeatable) |
| `-a, --assignee` | Assignee (`@me` for self) |
| `-m, --milestone` | Milestone |
| `-p, --project` | Project |
| `-T, --template` | Use issue template |
| `-e, --editor` | Open `$EDITOR` |
| `-w, --web` | Open in browser |
| `--recover` | Recover from failed creation |

**Interactive creation:** Running `gh issue create` without flags triggers an interactive prompt:
1. Choose template (if templates exist)
2. Enter title
3. Enter body (option to open `$EDITOR` or skip)
4. Choose: Submit / Submit as draft / Cancel

**Smart parsing:** None for dates. Template support pre-fills structured body.

**Defaults:** Uses repo context for defaults. Templates pre-fill body structure.

**Key insight:** The dual-mode approach (flags for scripting, interactive prompts for humans) is excellent. The `--recover` flag for failed submissions is a thoughtful touch. The `--editor` flag skips all prompts and opens the text editor directly.

---

### 1.5 Linear CLI

Multiple CLI tools exist for Linear (schpet/linear-cli, czottmann/linearis, Finesssee/linear-cli):

**One-liner creation:**
```bash
linear create "Fix the login bug"
linear issue create --title "Bug" --priority urgent --label bug --assignee @me
```

**Interactive creation:** Some implementations offer interactive team/project/status selection with fuzzy search.

**Key insight:** Linear CLIs emphasize agent-friendliness (JSON output, structured data). The `linearis` tool was explicitly designed for LLM agent integration with minimal context overhead. Smart ID resolution (e.g., `ENG-123` resolves automatically).

---

### 1.6 Notion

**Task creation patterns:**
- `Cmd+N` -- new page
- Slash commands: `/todo` for checkbox, `/database` for inline DB
- `@` mentions for dates and people: `@today`, `@tomorrow`, `@John`
- Database items: click `+ New` or press Enter at bottom of table view
- Templates: pre-built page structures with placeholders

**Quick entry:** No global Quick Add like Todoist. All entry happens within the Notion app/window. However, the inline `/` command system is very fast:
```
/todo Buy groceries @tomorrow
```

**Key insight:** Notion's strength is the `/` command paradigm -- type `/` to see all available block types, then filter by typing. This slash-command pattern has become a de facto standard for content creation UIs.

---

### 1.7 Things 3

**Quick Entry:**
- `Ctrl+Space` -- global Quick Entry from any app (Mac)
- `Ctrl+Option+Space` -- Quick Entry with Autofill (auto-fills URL/title from current app)
- `Cmd+N` -- new task within Things
- `Space` -- new task below current selection
- `Cmd+V` -- paste clipboard, each line becomes a separate task

**Keyboard-driven field entry in Quick Entry:**
| Shortcut | Function |
|----------|----------|
| `Cmd+S` | Set When (start date) |
| `Cmd+Shift+D` | Set Deadline |
| `Cmd+Shift+M` | Move to list/project |
| `Cmd+Shift+T` | Add tags |
| `Tab` | Move between fields |
| `Cmd+Return` | Save and close |

**Defaults:** New tasks go to Inbox. No date, no tags, no project.

**Repeat creation:** Quick Entry closes after save, but `Ctrl+Space` is instant to re-invoke. Within Things, pressing `Enter` after a task saves it and opens a new task line immediately.

**Date manipulation shortcuts (within task editor):**
| Shortcut | Function |
|----------|----------|
| `Ctrl+]` | Start date +1 day |
| `Ctrl+[` | Start date -1 day |
| `Cmd+T` | Set to Today |
| `Cmd+E` | Set to This Evening |
| `Cmd+R` | Set to Anytime |
| `Cmd+O` | Set to Someday |

**Key insight:** Things 3's power is the *global* Quick Entry that works from any app. The Autofill variant captures context (URL, email subject, document title) automatically. Paste-to-create-multiple is brilliant for batch entry. The **date nudge shortcuts** (`Ctrl+]`/`Ctrl+[`) are extremely efficient for quick scheduling adjustments.

---

### 1.8 TickTick

**Smart date parsing (Quick Add):**
```
Buy milk tomorrow at 5pm !high #Shopping
Meeting every Monday 10am-11am ^Work
```

**Inline syntax:**
| Syntax | Function | Example |
|--------|----------|---------|
| (natural language) | Date/time | `tomorrow`, `next friday 3pm` |
| `!` | Priority | `!high`, `!medium`, `!low` |
| `#` | Tag | `#meeting` |
| `^` | List (project) | `^Work` |
| `@` | Assign to user | `@John` |
| Time range | Duration | `10am-11am` |

**Smart Recognition features:**
- Date and time extraction from natural language
- Recurring pattern detection: `every day`, `every 2 weeks`
- Duration tasks with start-end times
- Option to keep or remove parsed date text from task title
- Early and postponed reminder parsing
- Can be toggled on/off globally in settings

**Desktop input bar features:**
- Input bar at top of task list with persistent visibility
- `Shift+Enter` in add bar expands description field inline (no modal needed)
- `Cmd+Enter` creates the task when description is expanded
- Dropdown on input bar right side for priority, attachments, templates
- **Customizable input bar** -- users choose which quick-actions to show via "Input Box Settings"

**Key insight:** TickTick's duration parsing (start-end times) is unique. The configurable "keep or remove parsed text" option respects user preference. The `^` prefix for lists is distinctive and avoids conflicts with `#` for tags. The **inline description expansion** (`Shift+Enter`) is an excellent middle ground between a one-liner and a full form.

---

## 2. Top 10 Best Practices

| # | Pattern | Used By | Impact |
|---|---------|---------|--------|
| 1 | **Inline metadata in text** -- special prefixes parse project, label, priority, date from a single text input | Todoist, Taskwarrior, todo.txt, TickTick | Eliminates need for separate fields; tasks created in seconds |
| 2 | **Natural language dates** -- "tomorrow", "next friday", "in 3 days" instead of date pickers | Todoist, TickTick, Taskwarrior | Dramatically reduces friction for date entry |
| 3 | **Dual-mode: flags + interactive** -- full one-liner via flags, guided prompts when flags omitted | GitHub CLI, Linear CLI | Serves both scripting/power users and newcomers |
| 4 | **Global capture shortcut** -- system-wide hotkey adds tasks without leaving current app | Todoist, Things 3 | Critical for "capture the thought" workflow |
| 5 | **Stay-open for batch entry** -- dialog/prompt stays open after task creation for rapid sequential entry | Todoist, Things 3 | 10x faster when adding multiple tasks |
| 6 | **Paste-to-create-many** -- clipboard with multiple lines creates one task per line | Things 3 | Bulk import from meeting notes, emails |
| 7 | **Smart defaults with override** -- sensible defaults (Inbox, no date, no priority) configurable per-user | All products | Reduces required input to just the description |
| 8 | **Template/preset support** -- pre-filled fields for common task types | GitHub CLI, Notion, Todoist | Eliminates repetitive metadata entry |
| 9 | **Position-independent attributes** -- metadata can appear anywhere in the command, not just at the end | Taskwarrior | Natural typing flow, no rigid ordering |
| 10 | **Recovery from failure** -- save draft if submission fails | GitHub CLI (`--recover`) | Prevents frustration and data loss |

---

## 3. Feature Comparison Table

| Feature | Todoist | Taskwarrior | todo.txt | GitHub CLI | Linear CLI | Notion | Things 3 | TickTick |
|---------|---------|-------------|----------|------------|------------|--------|----------|---------|
| One-liner creation | Yes (inline) | Yes (attrs) | Yes (inline) | Yes (flags) | Yes (flags) | No | No | Yes (inline) |
| Interactive flow | Hybrid | No | No | Yes | Partial | N/A | N/A | Hybrid |
| NL date parsing | Excellent | Good | None | None | None | Basic (@) | None | Excellent |
| Inline metadata | #project @label p1 | key:value +tag | +proj @ctx (A) | --flag val | --flag val | /slash @ | Shortcuts | ^list #tag !pri |
| Batch entry | Enter to continue | Shell script | `addm` | No | No | Cmd+V | Cmd+V | No |
| Templates | Yes | No | No | Yes | Yes | Yes | No | No |
| Custom fields | No | UDAs | Addons | Labels | Custom fields | Properties | Tags only | No |
| Global capture | Yes | No | No | No | No | No | Yes | Yes |
| Recurring tasks | Yes | Yes | Addon | No | No | No | Yes | Yes |
| Recovery on fail | Auto-save | N/A | N/A | `--recover` | N/A | Auto-save | Auto-save | Auto-save |

---

## 4. Recommendations for todoist-cli

### 4.1 CLI Mode

#### Primary Command: `todoist add` / `todoist a`

**One-liner with inline parsing (inspired by Todoist + Taskwarrior):**
```bash
# Full inline syntax -- all metadata extracted from text
todoist add "Buy milk tomorrow p1 #Shopping @errands"

# Explicit flags for scripting
todoist add "Buy milk" --project Shopping --label errands --priority 1 --due tomorrow

# Mixed: inline + flags (flags override inline)
todoist add "Buy milk tomorrow" --project Shopping
```

**Recommended inline syntax (matching Todoist's own):**
| Prefix | Function | Example |
|--------|----------|---------|
| (natural) | Due date | `tomorrow`, `next mon`, `jan 15` |
| `p1`-`p4` | Priority | `p1` |
| `#` | Project | `#Shopping` |
| `@` | Label | `@errands` |
| `//` | Section | `//Backlog` |
| `+` | Assignee | `+John` |

Rationale: use Todoist's own syntax so users don't have to learn a new system.

**Recommended flags:**
```
-p, --project <name>     Project name (fuzzy match)
-l, --label <name>       Label (repeatable: -l urgent -l work)
-P, --priority <1-4>     Priority (1=highest, 4=none)
-d, --due <date>         Due date (natural language)
-D, --description <text> Extended description
-s, --section <name>     Section within project
-a, --assignee <name>    Assignee (teams)
-r, --reminder <time>    Reminder
-e, --editor             Open $EDITOR for description
    --duration <mins>    Task duration
```

#### Interactive Mode: `todoist add -i` or `todoist add` (no arguments)

When invoked with no task text, enter guided mode (inspired by GitHub CLI):

```
$ todoist add
? Task name: Buy groceries
? Due date (empty to skip): tomorrow 5pm
? Project (tab for list): Shopping
? Priority (1-4, default 4):
? Labels (comma separated): errands, personal
? Description (enter to skip, e to open editor):

Created: "Buy groceries" in Shopping (due tomorrow at 5:00 PM)
Add another? (Y/n): y
? Task name: _
```

Key features:
- Tab completion for projects, labels, sections
- "Add another?" loop for batch entry
- Empty input = skip field (use defaults)
- `e` opens `$EDITOR` for multi-line description

#### Batch Mode: `todoist add --batch` or pipe

```bash
# Interactive batch -- one task per line, shared attributes
todoist add --batch --project Work --priority 2
> Fix login bug @backend
> Update API docs @docs
> Review PR #42
> (empty line or Ctrl+D to finish)

# Pipe mode -- one task per line from stdin
echo "Task 1 #Work\nTask 2 #Home" | todoist add --batch

# From file
todoist add --batch < tasks.txt
```

#### Quick Aliases

```bash
todoist a       # alias for add
todoist q       # quick add (one-liner only, no prompts)
```

### 4.2 TUI Mode

#### Quick Add Bar (inspired by Todoist Quick Add)

Always-accessible input at the top or bottom of the screen, toggled with `a` or `q`:

```
+--------------------------------------------------+
| TODOIST                          [Inbox] [Today]  |
+--------------------------------------------------+
| > Buy milk tomorrow p1 #Shopping @errands     [+] |
+--------------------------------------------------+
| [ ] Fix login bug          Work     Due: Today    |
| [ ] Review PR              Work     Due: Tomorrow |
| [ ] Call dentist            Personal              |
+--------------------------------------------------+
```

**Keyboard shortcuts:**
| Key | Action |
|-----|--------|
| `a` or `q` | Open Quick Add bar |
| `Enter` | Submit task, stay in Quick Add for next |
| `Esc` | Close Quick Add bar |
| `Tab` | Cycle through field pickers (project, date, priority, label) |
| `Ctrl+Enter` | Submit and close Quick Add |
| `#` | Trigger project autocomplete dropdown |
| `@` | Trigger label autocomplete dropdown |
| `p1`-`p4` | Set priority inline |
| `Ctrl+E` | Open full task editor (all fields visible) |

#### Full Task Editor (for detailed entry)

Opened with `Ctrl+E` from Quick Add or `e` on a selected task:

```
+--------------------------------------------------+
| NEW TASK                                    [Esc] |
+--------------------------------------------------+
| Title:    [Buy groceries                        ] |
| Project:  [Shopping         ] [Tab: autocomplete] |
| Section:  [                 ]                     |
| Due:      [tomorrow 5pm     ] [Tab: date picker]  |
| Priority: [ ] 1  [x] 2  [ ] 3  [ ] 4             |
| Labels:   [errands, personal]                     |
| Reminder: [                 ]                     |
| Duration: [30min            ]                     |
| Desc:     [                 ] [Ctrl+E: editor]    |
+--------------------------------------------------+
|              [Save: Enter]  [Cancel: Esc]         |
+--------------------------------------------------+
```

**Field navigation:** Tab/Shift+Tab between fields. Each field supports:
- Text input with inline autocomplete
- Dropdown picker on Tab (fuzzy search for projects/labels)
- Priority as radio buttons (1-4 with number keys)

#### Paste-to-Create (inspired by Things 3)

`Ctrl+V` in task list view creates one task per clipboard line:

```
Pasted 3 tasks from clipboard:
  [x] Buy milk
  [x] Call dentist
  [x] Fix door
Apply to all: Project? (empty=Inbox): _
```

---

## 5. Proposed UX Flows

### Flow A: Power User Quick Add (CLI, 2 seconds)

```
$ todoist a "Deploy v2.3 friday p1 #Release @backend"
Created: "Deploy v2.3" in Release (due Fri Feb 14, P1) [@backend]
```

User types one command, all metadata extracted inline, task created instantly.

### Flow B: Guided Creation (CLI, 15 seconds)

```
$ todoist add
? Task: Prepare quarterly report
? Due: next friday
? Project: Work [Tab -> autocomplete shows matching projects]
? Priority (1-4): 2
? Labels: reports, q1

Created: "Prepare quarterly report" in Work (due Fri Feb 14, P2) [@reports, @q1]
Add another? (Y/n): n
```

User follows prompts, gets autocomplete help, no syntax to memorize.

### Flow C: TUI Quick Add (3 seconds)

User presses `a`, types in the Quick Add bar:
```
> Prepare quarterly report next friday p2 #Work @reports
```
Presses `Enter`. Task appears in the list. Quick Add bar stays open for the next task.

### Flow D: TUI Full Editor (10 seconds)

User presses `Ctrl+E`, fills in the form with Tab navigation between fields, autocomplete for projects and labels, date picker for due date. Presses `Enter` to save.

### Flow E: Batch Import (CLI, 5 seconds for 10 tasks)

```
$ todoist add --batch --project Sprint-42
> Fix login validation @backend
> Update error messages @frontend
> Add rate limiting @backend p1
> Write migration script @database
> (Ctrl+D)
Created 4 tasks in Sprint-42
```

### Flow F: Pipe from External Source

```bash
# From meeting notes
grep "TODO:" meeting-notes.md | sed 's/TODO: //' | todoist add --batch --project Work --due friday

# From git issues
gh issue list --label bug --json title -q '.[].title' | todoist add --batch --project Bugs
```

---

## 6. Implementation Priority

See also: `docs/research/task-creation-audit.md` for current codebase gaps and bugs.

| Priority | Feature | Rationale | Current status in todoist-cli |
|----------|---------|-----------|-------------------------------|
| P0 | Fix priority default bug in CLI (`4` should be `1`) | Bug -- creates urgent tasks by default | Broken (see audit) |
| P0 | Reuse EditTaskModal for creation (unified add/edit) | Biggest UX gap: add is InputPrompt, edit is rich form | Missing |
| P0 | Pass current project context to add | Tasks created in project view go to Inbox | Missing |
| P1 | One-liner `add` with inline syntax matching Todoist | Core differentiator, power user essential | Partial (no section, no deadline) |
| P1 | Flag-based `add` with `--description` | CI/CD and scripting use cases | Missing `--description` |
| P1 | Live parse preview in InputPrompt | Show what quick-add will extract as user types | Missing |
| P1 | Autocomplete for `#project` and `@label` | Reduces errors, matches Todoist web behavior | Missing |
| P1 | Natural language date parsing (use Todoist API's own parser) | Todoist API supports `due_string` natively | Partial |
| P2 | Interactive guided mode (CLI: no-args = prompted) | Onboarding, discoverability (GitHub CLI pattern) | Missing |
| P2 | "Add and continue" mode in TUI | Stay-open Quick Add for batch entry | Missing |
| P2 | Batch mode (stdin/pipe) | Power user workflow | Missing |
| P2 | Fix global regex statefulness in quick-add.ts | Latent bug | Broken (see audit) |
| P2 | Remove 8-item cap on label/project pickers | EditTaskModal shows max 8 items | Broken |
| P3 | Section support in quick-add syntax (`/sectionname`) | Matches Todoist's own Quick Add | Missing |
| P3 | Paste-to-create-many | Nice-to-have for brain-dump | Missing |
| P3 | Templates/presets | Repeated task patterns | Missing |
| P3 | `--recover` on failure | Resilience | Missing |

---

## 7. Key Design Principles

1. **Todoist syntax first** -- don't invent new syntax where Todoist's existing inline shortcuts work. Users already know `#project`, `@label`, `p1`. Reuse this muscle memory.

2. **Progressive disclosure** -- `todoist add "task"` just works. Adding `--project` or inline `#Project` is optional. The interactive mode reveals all options. The TUI editor shows everything.

3. **Keyboard > Mouse** -- every action should be reachable via keyboard. TUI should never require a mouse.

4. **Leverage the API** -- Todoist's `quick_add` API endpoint already parses inline syntax and natural language dates. Use it directly instead of reimplementing parsing.

5. **Unix philosophy** -- support stdin/stdout, pipes, and composability. The CLI should work well as part of shell scripts and CI/CD pipelines.

6. **Fail gracefully** -- if a project name doesn't match, suggest the closest match. If the API fails, save the task locally for retry. Never lose user input.
