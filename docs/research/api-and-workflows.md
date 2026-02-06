# Todoist API & Power User Workflows Research

> Date: 2026-02-06
> Purpose: Identify unused API capabilities and high-value power user workflows for todoist-cli v2

---

## Table of Contents

1. [API Migration: REST v2 -> Unified API v1](#1-api-migration-rest-v2---unified-api-v1)
2. [REST API v2 - Complete Endpoint Audit](#2-rest-api-v2---complete-endpoint-audit)
3. [Sync API v9 - Unique Capabilities](#3-sync-api-v9---unique-capabilities)
4. [Todoist Filter Language](#4-todoist-filter-language)
5. [Power User Workflows](#5-power-user-workflows)
6. [Subtasks & Recurring Tasks](#6-subtasks--recurring-tasks)
7. [Prioritized Feature Recommendations](#7-prioritized-feature-recommendations)

---

## 1. API Migration: REST v2 -> Unified API v1

### Critical: API Deprecation Timeline

- **REST API v2** and **Sync API v9** are **deprecated**
- Shutdown date: **February 10, 2026** (IMMINENT)
- New unified API: **Todoist API v1** at `developer.todoist.com/api/v1/`
- Official SDKs available: JavaScript and Python

### What API v1 Brings

| Feature | REST v2 | API v1 |
|---------|---------|--------|
| Tasks CRUD | Yes | Yes |
| Projects CRUD | Yes | Yes |
| Sections CRUD | Yes | Yes |
| Labels CRUD | Yes | Yes |
| Comments CRUD | Yes | Yes |
| Shared Labels | Partial | Full |
| Collaborators | Read-only | Full |
| Activity Log | No | Yes |
| Completed Tasks | No | Yes |
| User Profile / Karma | No | Yes |
| Sync endpoint (batch ops) | No | Yes |
| Workspaces | No | Yes |
| Backups | No | Yes |
| Webhooks | No | Yes |
| Pagination | No | Yes |
| Better error messages | No | Yes |

### Recommendation

**Migrate to API v1 ASAP.** REST v2 shuts down Feb 10, 2026. The unified API gives us access to many features we currently lack (activity log, completed tasks, karma, batch operations).

---

## 2. REST API v2 - Complete Endpoint Audit

### Currently Used by todoist-cli

- Tasks: create, list, get, update, close, reopen, delete
- Projects: create, list, get, update, delete
- Labels: create, list, get, update, delete
- Comments: create, list, get, update, delete

### NOT Used (Available in REST v2)

#### Sections API
```
GET    /rest/v2/sections          - List all sections (filter by project_id)
POST   /rest/v2/sections          - Create a section
GET    /rest/v2/sections/{id}     - Get a section
POST   /rest/v2/sections/{id}     - Update a section
DELETE /rest/v2/sections/{id}     - Delete a section
```
**Value: HIGH** - Sections are essential for organizing tasks within projects (e.g., "In Progress", "Backlog", "Done"). Many workflows rely on sections.

#### Project Archive/Unarchive
```
POST   /rest/v2/projects/{id}/archive    - Archive a project
POST   /rest/v2/projects/{id}/unarchive  - Restore archived project
```
**Value: MEDIUM** - Useful for GTD "someday/maybe" projects.

#### Collaborators
```
GET    /rest/v2/projects/{id}/collaborators  - List project members
```
**Value: MEDIUM** - Read-only in REST v2. Useful for `assigned to:` workflows.

#### Shared Labels
```
GET    /rest/v2/labels/shared          - List shared labels
POST   /rest/v2/labels/shared/rename   - Rename shared labels
POST   /rest/v2/labels/shared/remove   - Remove shared labels
```
**Value: LOW-MEDIUM** - Only relevant for team/workspace use.

---

## 3. Sync API v9 - Unique Capabilities

These features are ONLY available via Sync API (now migrated to API v1's `/sync` endpoint):

### Activity Log
- Detailed audit trail of all user actions
- Filter by: project, person, event type, date
- Shows: task completions, creations, updates, deletions
- **Value: HIGH** - Enables "what did I do today/this week" reports

### Completed Tasks History
- Query archived/completed tasks by completion date
- Get completion stats: `completed_count`, `days_items`, `week_items`
- **Value: HIGH** - Weekly reviews, productivity tracking, burndown charts

### Karma / Productivity Stats
- User karma score and trends
- Daily/weekly goals and streaks
- Productivity visualization data
- **Value: MEDIUM** - Gamification, motivation tracking

### Batch Operations (Sync Endpoint)
- Execute multiple commands in a single request
- Temporary IDs for referencing newly-created items
- UUID-based command deduplication
- **Value: HIGH** - Bulk task creation, project setup, template application

### Filters (Server-side)
- CRUD for user's saved filter views
- **Value: MEDIUM** - Manage filters from CLI

### Reminders
- Create/manage task reminders
- **Value: MEDIUM** - Set reminders from CLI

### User Info
- Profile, settings, plan limits
- Notification preferences
- **Value: LOW** - Mostly informational

### Backups
- Download account backups
- **Value: LOW** - Niche but useful for power users

---

## 4. Todoist Filter Language

### Overview
Todoist has a powerful query language for filtering tasks. This is what users type in the app's filter views. **Implementing CLI support for this syntax would be extremely high value.**

### Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `&` | AND | `today & p1` |
| `\|` | OR | `today \| overdue` |
| `!` | NOT | `!subtask` |
| `()` | Grouping | `(today \| overdue) & #Work` |
| `,` | Separate lists | `today, overdue` |
| `\` | Escape special chars | `#Shopping\ list` |

### Filter Categories

#### Date Filters
```
today                       - Due today
tomorrow                    - Due tomorrow
yesterday                   - Due yesterday
overdue / od                - Past due
no date                     - No due date
no time                     - Has date but no time
3 days                      - Due within next 3 days
-3 days                     - Due in past 3 days
date: Jan 3                 - Due on specific date
date before: May 5          - Due before date
date after: May 5           - Due after date
due before: +4 hours        - Relative time
```

#### Deadline Filters
```
no deadline / !no deadline
deadline: today
deadline before: today      - Overdue deadlines
deadline after: yesterday & deadline before: in 7 days
```

#### Priority Filters
```
p1                          - Priority 1 (highest)
p2                          - Priority 2
p3                          - Priority 3
no priority                 - Priority 4 (default/none)
```

#### Label Filters
```
@email                      - Specific label
no labels                   - Tasks without labels
@urgent*                    - Wildcard label matching
```

#### Project & Section Filters
```
#Work                       - Single project
##Work                      - Project + all subprojects
##School & !#Science        - Exclude specific project
/_Meetings                  - Section (across all projects)
#!/*                        - Tasks not in any section
```

#### Search
```
search: Meeting             - Full text search
search: send email          - Multi-word search
search: http                - Tasks with links
```

#### Subtask Filters
```
subtask                     - Only subtasks
!subtask                    - Only parent tasks
```

#### Assignment Filters
```
assigned                    - Any assignment
assigned to: me             - Assigned to current user
assigned to: others         - Assigned to others
assigned by: me             - Tasks I assigned
assigned to: Steve Gray     - Assigned to specific person
```

#### Creation Date
```
created: today
created: Jan 3 2023
created before: -365 days   - Older than 1 year
created after: -365 days    - Within past year
```

#### Other
```
recurring / !recurring      - Recurring tasks
shared                      - Tasks in shared projects
subtask / !subtask          - Subtask vs parent
view all                    - All active tasks
workspace: My projects      - Workspace filter
```

### Implementation Strategy for CLI

**Option A: Client-side filter parsing** - Parse Todoist filter syntax locally, translate to API query params. Complex but works offline.

**Option B: Server-side filter** - The API v1 tasks endpoint supports a `filter` query parameter that accepts Todoist filter syntax directly. This is the preferred approach.

**Recommendation:** Use server-side filter via API, with client-side fallback for unsupported filters or offline mode.

Example CLI usage:
```bash
todoist tasks --filter "today & p1"
todoist tasks --filter "(overdue | today) & #Work & !assigned to: others"
todoist tasks --filter "created before: -30 days & no date"
```

---

## 5. Power User Workflows

### 5.1 GTD (Getting Things Done)

The GTD methodology maps naturally to Todoist and our CLI:

#### Capture (Inbox)
- Quick add to Inbox with natural language dates
- CLI: `todoist add "Call dentist tomorrow at 2pm"`

#### Clarify & Organize
- Move tasks from Inbox to projects
- Add labels: `@next`, `@waiting`, `@someday`
- Set priorities, due dates, sections
- Break into subtasks

#### Review (Weekly)
- Review all projects for stale tasks
- Check `@waiting` items
- Process Inbox to zero
- Review upcoming week

#### Engage
- Work from filtered views: `today & @next`

#### Recommended GTD Labels
```
@next          - Next actions
@waiting       - Waiting for someone
@someday       - Someday/maybe items
@two_minutes   - Quick tasks under 2 min
@agenda        - Discuss at next meeting
@reference     - Reference material
```

#### Recommended GTD Filters
```
# Inbox processing
"#Inbox"

# Next actions
"@next & (today | overdue | no date)"

# Waiting for
"@waiting"

# Someday/maybe
"@someday"

# Weekly review - stale tasks
"created before: -30 days & no date & !@someday"

# What I completed this week
# (requires completed tasks API)
```

#### CLI Feature: `todoist review`
A guided weekly review workflow:
1. Show Inbox count -> process each item
2. Show `@waiting` items -> update status
3. Show overdue tasks -> reschedule or complete
4. Show tasks with no date -> assign or label @someday
5. Show completed tasks this week -> productivity summary

### 5.2 Eisenhower Matrix

Maps priorities to urgency/importance quadrants:

| Quadrant | Priority | Filter | Action |
|----------|----------|--------|--------|
| Urgent & Important | p1 | `p1` | Do first |
| Important, Not Urgent | p2 | `p2` | Schedule |
| Urgent, Not Important | p3 | `p3` | Delegate |
| Not Urgent/Important | p4 | `no priority` | Eliminate |

Alternative using labels:
```
@urgent & @important           - Do it
@important & !@urgent          - Schedule it
@urgent & !@important          - Delegate it
!@important & !@urgent         - Drop it
```

#### CLI Feature: `todoist matrix`
```bash
todoist matrix              # Show tasks in 4-quadrant view
todoist matrix --today      # Only today's tasks in matrix
```

### 5.3 Time Blocking

Todoist supports duration on tasks (e.g., "meeting tomorrow 2pm for 1h"):

```bash
todoist add "Deep work on report tomorrow 9am for 2h" -p 1
todoist tasks --filter "today" --show-duration
todoist today --timeline    # Show tasks in timeline/schedule view
```

#### CLI Feature: `todoist today --timeline`
Show today's tasks sorted by time with duration blocks:
```
09:00 - 11:00  [2h] Deep work on report          p1
11:00 - 11:30  [30m] Check emails                 p3
14:00 - 15:00  [1h] Team meeting                  p2
        (no time) Buy groceries                    p4
```

### 5.4 Daily Planning / "Eat the Frog"

```bash
todoist today               # Show today's tasks sorted by priority
todoist frog                # Show only p1 task(s) due today
```

Filter: `today & p1 & !assigned to: others`

### 5.5 Quick Capture Workflows

```bash
# Natural language quick add
todoist add "Buy milk @errands #Shopping p3"
todoist add "Review PR every weekday at 10am"
todoist add "Dentist appointment Jan 15 at 3pm for 1h"

# Pipe/stdin capture
echo "Fix login bug" | todoist add -p 1 -P "Work"

# Batch add from file
todoist add --from tasks.txt
```

### 5.6 Automation Patterns

```bash
# Morning routine
todoist tasks --filter "today & @morning" --sort priority

# End of day review
todoist tasks --filter "today & !recurring" --incomplete

# Weekly report
todoist completed --since "7 days ago" --group-by project

# Stale task cleanup
todoist tasks --filter "created before: -90 days & no date & !@someday"
```

---

## 6. Subtasks & Recurring Tasks

### Subtasks via API

Tasks have a `parent_id` field:
```json
{
  "id": "123",
  "content": "Write blog post",
  "parent_id": null,
  "order": 1
}
```

Creating a subtask:
```json
POST /tasks
{
  "content": "Write outline",
  "parent_id": "123"
}
```

Key behaviors:
- Subtasks inherit project from parent
- Completing parent does NOT auto-complete subtasks
- Subtasks can have their own due dates, priorities, labels
- `order` field controls position among siblings
- Nesting depth: up to 4 levels in free plan, unlimited in Pro

#### CLI Features for Subtasks
```bash
todoist add "Write outline" --parent 123
todoist tasks --tree                    # Show task hierarchy
todoist tasks --filter "!subtask"       # Only parent tasks
todoist tasks --project Work --tree     # Project tree view
```

### Recurring Tasks via API

The `due` object has these fields:
```json
{
  "due": {
    "date": "2024-01-15",
    "string": "every monday at 9am",
    "datetime": "2024-01-15T09:00:00Z",
    "timezone": "America/New_York",
    "is_recurring": true
  }
}
```

#### Natural Language Recurring Patterns

**Fixed schedule (every):**
```
every day / daily
every weekday / every workday
every monday, friday
every 3 days
every month on the 15th
every last day
every 3rd friday
every jan 27th
every quarter
every morning (9am) / afternoon (12pm) / evening (7pm) / night (10pm)
```

**Completion-based (every!):**
```
every! 3 days        - 3 days after last completion
every! 2 weeks       - 2 weeks after last completion
every! month         - 1 month after last completion
```

**With bounds:**
```
every day starting aug 3
every day ending aug 3
every day for 3 weeks
every 3rd tuesday starting aug 29 ending in 6 months
```

**With times:**
```
every mon, fri at 20:00
every 12 hours starting at 9pm
every fri at noon
```

**Holidays:**
```
new year day, valentine, halloween, new year eve
```

#### CLI Features for Recurring Tasks
```bash
todoist add "Standup every weekday at 9:30am"
todoist tasks --filter "recurring"
todoist tasks --filter "recurring & #Work"
```

When completing a recurring task via `POST /tasks/{id}/close`, the API automatically:
1. Marks current occurrence as complete
2. Creates next occurrence based on the recurrence rule
3. Updates the `due` object with the next date

---

## 7. Prioritized Feature Recommendations

### P0 - Critical (Do First)

| Feature | Effort | Impact | Notes |
|---------|--------|--------|-------|
| **Migrate to API v1** | HIGH | CRITICAL | REST v2 shuts down Feb 10, 2026 |
| **Filter syntax support** | MEDIUM | HIGH | `todoist tasks --filter "today & p1"` - use server-side filter param |
| **Sections CRUD** | LOW | HIGH | Essential for organizing tasks within projects |

### P1 - High Value

| Feature | Effort | Impact | Notes |
|---------|--------|--------|-------|
| **Subtask support (tree view)** | MEDIUM | HIGH | `--parent`, `--tree` flag, hierarchy display |
| **Completed tasks history** | MEDIUM | HIGH | Weekly review, productivity tracking |
| **Activity log** | LOW | MEDIUM | "What did I do today" |
| **Batch operations** | MEDIUM | HIGH | Template apply, bulk create, bulk update |
| **Natural language dates** | LOW | HIGH | Already supported by API, just pass `due_string` |

### P2 - Medium Value

| Feature | Effort | Impact | Notes |
|---------|--------|--------|-------|
| **Weekly review workflow** | MEDIUM | HIGH | Guided `todoist review` command |
| **Today timeline view** | MEDIUM | MEDIUM | Time-based task visualization |
| **Eisenhower matrix view** | LOW | MEDIUM | 4-quadrant priority display |
| **Project archive/unarchive** | LOW | LOW | GTD someday/maybe support |
| **Collaborators list** | LOW | LOW | View who's on shared projects |
| **Karma/productivity stats** | LOW | MEDIUM | Gamification, streaks |

### P3 - Nice to Have

| Feature | Effort | Impact | Notes |
|---------|--------|--------|-------|
| **Saved filters CRUD** | LOW | LOW | Manage filters from CLI |
| **Reminders** | LOW | LOW | Set reminders from CLI |
| **Shared labels** | LOW | LOW | Team/workspace features |
| **Backups download** | LOW | LOW | Account backup from CLI |
| **Webhooks management** | MEDIUM | LOW | For automation/integration |

### Killer CLI Workflows to Implement

1. **`todoist today`** - Today view with timeline, priorities, and overdue
2. **`todoist review`** - Guided GTD weekly review
3. **`todoist matrix`** - Eisenhower matrix visualization
4. **`todoist completed`** - View completed task history with stats
5. **`todoist tasks --filter "<todoist filter>"`** - Full filter syntax support
6. **`todoist tasks --tree`** - Hierarchical task view with subtasks
7. **`todoist add "<natural language>"`** - Smart quick-add with NLP dates
8. **`todoist stats`** - Karma, streaks, weekly/daily completion stats
9. **`todoist bulk`** - Batch operations (complete, move, label, reschedule)
10. **`todoist log`** - Activity log / audit trail

---

## Sources

- [Todoist REST API v2 Reference](https://developer.todoist.com/rest/v2/) (deprecated)
- [Todoist API v1 (Unified)](https://developer.todoist.com/api/v1/)
- [Todoist Sync API v9 Reference](https://developer.todoist.com/sync/v9/) (deprecated)
- [Todoist Developer Guides](https://developer.todoist.com/guides/)
- [Introduction to Filters](https://www.todoist.com/help/articles/introduction-to-filters-V98wIH)
- [24 Todoist Filters](https://www.todoist.com/inspiration/todoist-filters)
- [GTD with Todoist](https://www.todoist.com/help/articles/getting-things-done-gtd-with-todoist-e5j2h3)
- [Eisenhower Matrix with Todoist](https://www.todoist.com/help/articles/eisenhower-matrix-with-todoist-kj0Eru)
- [Introduction to Recurring Dates](https://www.todoist.com/help/articles/introduction-to-recurring-dates-YUYVJJAV)
- [Time Blocking in Todoist](https://www.todoist.com/help/articles/time-blocking-in-todoist-d6Pf1uTpc)
- [GTD Weekly Review Template](https://www.todoist.com/templates/gtd-weekly-review)
- [Todoist API v1 Announcement](https://groups.google.com/a/doist.com/g/todoist-api/c/LKz0K5TRQ9Q/m/IlIemN4-CAAJ)
