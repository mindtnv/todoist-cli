# Todoist API v1 Deep Dive Research Report

**Date:** 2026-02-06
**Base URL:** `https://api.todoist.com/api/v1/`
**Documentation:** https://developer.todoist.com/api/v1/
**Tested with:** Real API token via Bun runtime

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [API Architecture Overview](#api-architecture-overview)
3. [Activity Log (GET /activities)](#1-activity-log---get-activities)
4. [User Productivity Stats (Sync + REST)](#2-user-productivity-stats)
5. [Sync Endpoint - Full Details](#3-sync-endpoint---post-sync)
6. [Completed Tasks](#4-completed-tasks)
7. [User Endpoint (REST)](#5-user-endpoint---get-user)
8. [All Endpoint Test Results](#6-full-endpoint-test-results)
9. [Deprecated / Gone Endpoints](#7-deprecated--gone-endpoints)
10. [Implementation Recommendations](#8-implementation-recommendations)

---

## Executive Summary

The Todoist API v1 is a **unified API** that merges the old REST API v2 and Sync API v9 into a single namespace under `/api/v1/`. Key findings:

| Feature | Endpoint | Status | Method |
|---------|----------|--------|--------|
| Activity Log | `GET /activities` | **WORKING (200)** | REST |
| Productivity Stats | `POST /sync` with `resource_types: ["stats"]` | **WORKING (200)** | Sync |
| User Karma/Goals | `GET /user` | **WORKING (200)** | REST |
| Completed Tasks | `GET /tasks/completed` | **WORKING (200)** | REST |
| Full Sync | `POST /sync` with `resource_types: ["all"]` | **WORKING (200)** | Sync |
| Backups | `GET /backups` | **WORKING (200)** | REST |

**Critical discovery:** The old endpoints like `/activity/get`, `/completed/get_stats`, `/completed/get_all` return **410 Gone** -- they have been replaced by the new v1 endpoints.

---

## API Architecture Overview

Todoist API v1 has two interaction models within the same base URL:

### REST Endpoints
Standard RESTful CRUD for individual resources:
- `GET/POST/DELETE /tasks`, `/projects`, `/labels`, `/sections`, `/comments`
- `GET /activities` (activity log)
- `GET /user` (user info + karma)
- `GET /tasks/completed` (completed tasks)
- `GET /backups` (backup archives)

### Sync Endpoint
A single `POST /sync` endpoint for bulk data synchronization:
- Uses `sync_token` for incremental sync (`"*"` for full sync)
- Uses `resource_types` array to select which data categories to fetch
- Uses `commands` array for batch write operations
- Returns the entire user data model or selected slices of it

---

## 1. Activity Log - GET /activities

### Endpoint
```
GET https://api.todoist.com/api/v1/activities
```

### Status: WORKING (200 OK)

### Authentication
```
Authorization: Bearer <token>
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Number of results per page (tested with 2, 3, 5) |
| `event_type` | string | Filter by event type (e.g., `completed`, `added`, `updated`, `deleted`) |
| `object_type` | string | Filter by object type (e.g., `item`, `project`, `note`) |
| `cursor` | string | Pagination cursor from `next_cursor` in previous response |

### Response Structure
```json
{
  "next_cursor": "kstB2mGRj1rRgcQQAZw0gmBNc8O0GO9EYMYG9Q.txdYCVEiJiAvSFZ8",
  "results": [
    {
      "event_date": "2026-02-06T20:13:37.334135Z",
      "event_type": "completed",
      "extra_data": {
        "client": "Bun/1.3.6",
        "content": "Task name here",
        "note_count": 0
      },
      "extra_data_id": null,
      "id": 2.140292930587728e+36,
      "initiator_id": "39768711",
      "object_id": "6fwgQ6WMCPv5xRR4",
      "object_type": "item",
      "parent_item_id": null,
      "parent_project_id": "6J44PcG9RXf3Pvv4",
      "source": "clickhouse"
    }
  ]
}
```

### Activity Event Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique event ID (very large number) |
| `event_date` | string (ISO 8601) | When the event occurred |
| `event_type` | string | Type: `completed`, `added`, `updated`, `deleted`, `archived`, `unarchived`, etc. |
| `object_type` | string | What was affected: `item`, `project`, `note`, `section`, etc. |
| `object_id` | string | ID of the affected object |
| `initiator_id` | string | User ID who performed the action |
| `parent_item_id` | string/null | Parent task ID if applicable |
| `parent_project_id` | string | Project the object belongs to |
| `extra_data` | object | Additional context (task content, note_count, client info) |
| `extra_data_id` | string/null | Related extra data ID |
| `source` | string | Data source (observed: `"clickhouse"`) |

### Pagination
Uses cursor-based pagination:
1. First request: `GET /activities?limit=10`
2. Next page: `GET /activities?limit=10&cursor=<next_cursor_value>`
3. When `next_cursor` is `null`, there are no more results.

### Known Event Types (observed)
- `completed` - Task was completed
- `added` - Task/item was created
- `updated` - Task/item was modified
- `deleted` - Task/item was removed

### IMPORTANT: Replaces old endpoints
- `GET /activity/get` returns **410 Gone** (old Sync API v9 endpoint)
- `GET /activity/log` returns **404 Not Found**
- `GET /activity` returns **404 Not Found**

### Plan Limits
From `user_plan_limits`, the activity log access depends on the plan:
- `activity_log: true` - whether user has access
- `activity_log_limit: -1` - unlimited for Pro (-1 means no limit)

---

## 2. User Productivity Stats

There are **two ways** to get productivity stats:

### Method A: Sync API (RECOMMENDED - most data)
```
POST https://api.todoist.com/api/v1/sync
Content-Type: application/json

{
  "resource_types": ["stats"],
  "sync_token": "*"
}
```

#### Response
```json
{
  "full_sync": true,
  "full_sync_date_utc": "2026-02-06T20:19:37Z",
  "stats": {
    "completed_count": 729,
    "days_items": [
      {
        "date": "2026-02-06",
        "total_completed": 3
      }
    ],
    "week_items": [
      {
        "from": "2026-02-02",
        "to": "2026-02-08",
        "total_completed": 4
      }
    ]
  },
  "sync_token": "3I3uwXIAixyg...",
  "temp_id_mapping": {}
}
```

#### Stats Fields

| Field | Type | Description |
|-------|------|-------------|
| `completed_count` | integer | Total lifetime completed tasks (729 in test) |
| `days_items` | array | Daily completion counts with dates |
| `days_items[].date` | string | Date in YYYY-MM-DD format |
| `days_items[].total_completed` | integer | Tasks completed that day |
| `week_items` | array | Weekly completion counts |
| `week_items[].from` | string | Week start date (YYYY-MM-DD) |
| `week_items[].to` | string | Week end date (YYYY-MM-DD) |
| `week_items[].total_completed` | integer | Tasks completed that week |

### Method B: REST /user endpoint (karma + basic counts)
```
GET https://api.todoist.com/api/v1/user
```

#### Relevant Fields from /user Response

| Field | Type | Value (test) | Description |
|-------|------|--------------|-------------|
| `karma` | integer | 10108 | Current karma points |
| `karma_trend` | string | "up" | Karma trend direction |
| `completed_count` | integer | 729 | Total lifetime completed |
| `completed_today` | integer | 3 | Completed today count |
| `daily_goal` | integer | 18 | Daily task goal |
| `weekly_goal` | integer | 30 | Weekly task goal |
| `start_day` | integer | 1 | Week start day (1=Monday) |
| `days_off` | array | [6, 7] | Weekend days |
| `is_premium` | boolean | true | Premium subscription active |
| `premium_status` | string | "current_personal_plan" | Plan type |

### Method C: Sync user resource (karma + goals, NO completed_count/today)
```
POST /sync with resource_types: ["user"]
```
Returns the same `user` object but notably **without** `completed_count` and `completed_today` fields (those are REST-only additions).

### IMPORTANT: Dead endpoints for stats
- `GET /user/productivity_stats` - **404 Not Found**
- `GET /stats` - **404 Not Found**
- `GET /completed/get_stats` - **410 Gone** (old API)
- `POST /completed/get_stats` - **405 Method Not Allowed**
- `GET /productivity_stats` - **404 Not Found**

### Combining for Full Stats Picture

To get ALL productivity data, use both:

1. **`POST /sync` with `["stats"]`** for: `completed_count`, `days_items`, `week_items`
2. **`GET /user`** for: `karma`, `karma_trend`, `completed_today`, `daily_goal`, `weekly_goal`

Or use `POST /sync` with `["stats", "user"]` to get both in one call (but the sync user object lacks `completed_count` and `completed_today`).

---

## 3. Sync Endpoint - POST /sync

### Endpoint
```
POST https://api.todoist.com/api/v1/sync
Content-Type: application/json

{
  "resource_types": ["all"],
  "sync_token": "*"
}
```

### Status: WORKING (200 OK)

### Request Body Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sync_token` | string | Yes | Use `"*"` for full sync, or previous `sync_token` for incremental |
| `resource_types` | string[] | Yes | Array of resource type names, or `["all"]` |
| `commands` | array | No | JSON array of write commands |

### All Supported resource_types (22 types, ALL verified working)

| resource_type | Response Key(s) | Description |
|---------------|-----------------|-------------|
| `labels` | `labels` | Personal labels array |
| `projects` | `projects` | Projects array |
| `items` | `items` | Active tasks/items array |
| `notes` | `notes`, `project_notes`, `incomplete_item_ids`, `incomplete_project_ids` | Task notes + project notes |
| `sections` | `sections` | Sections array |
| `filters` | `filters` | Saved filters array |
| `reminders` | `reminders` | Reminders array |
| `reminders_location` | `reminders` | Location-based reminders |
| `locations` | `locations` | Saved locations |
| `user` | `user` | User object (56 keys) |
| `live_notifications` | `live_notifications`, `live_notifications_last_read_id` | In-app notifications |
| `collaborators` | `collaborators`, `collaborator_states` | Project collaborators |
| `user_settings` | `user_settings` | User preference settings |
| `notification_settings` | `settings_notifications` | Notification preferences |
| `user_plan_limits` | `user_plan_limits` | Plan feature limits |
| `completed_info` | `completed_info` | Completed task counts per project |
| `stats` | `stats` | Productivity statistics |
| `workspaces` | `workspaces` | Workspace list |
| `workspace_users` | (empty for personal) | Workspace members |
| `workspace_filters` | `workspace_filters` | Workspace-level filters |
| `view_options` | `view_options` | View configuration |
| `project_view_options_defaults` | `project_view_options_defaults` | Default project view settings |
| `role_actions` | `role_actions` | Permission actions per role |

### Full Sync Response Keys (resource_types: ["all"])
When requesting all resources, the response contains **35 top-level keys**:

```
calendar_accounts, calendars, collaborator_states, collaborators,
completed_info, day_orders, filters, folders, full_sync,
full_sync_date_utc, incomplete_item_ids, incomplete_project_ids,
items, labels, live_notifications, live_notifications_last_read_id,
locations, notes, project_notes, project_view_options_defaults,
projects, reminders, role_actions, sections, stats, suggestions,
sync_token, temp_id_mapping, tooltips, user, user_plan_limits,
user_settings, view_options, workspace_filters, workspaces
```

**Note:** Some keys appear in the "all" response but are not individual resource_types:
- `calendar_accounts` - Google Calendar integrations
- `calendars` - Individual calendars
- `day_orders` - Task day ordering
- `folders` - Project folders
- `suggestions` - AI/smart suggestions
- `tooltips` - UI tooltip state
- `project_notes` - Returned with `notes` resource type

### Incremental Sync
After the first full sync, save the returned `sync_token`. On subsequent calls:
```json
{
  "resource_types": ["items", "projects"],
  "sync_token": "3I3uwXIAixyg..."
}
```
Only changed items since the last sync will be returned. `full_sync: false` indicates incremental.

### Write Commands (via commands array)
The sync endpoint also supports batch write operations. Command types include:

**Items:** `item_add`, `item_update`, `item_move`, `item_reorder`, `item_delete`, `item_complete`, `item_uncomplete`, `item_close`, `day_order_update`

**Projects:** `project_add`, `project_update`, `project_move`, `project_delete`, `project_archive`, `project_unarchive`, `project_reorder`, `project_change_role`, `project_leave`

**Sections:** `section_add`, `section_update`, `section_move`, `section_reorder`, `section_delete`, `section_archive`, `section_unarchive`

**Labels:** `label_add`, `label_update`, `label_delete`, `label_rename_shared`, `label_delete_shared_occurrences`, `label_update_orders`

**Filters:** `filter_add`, `filter_update`, `filter_delete`, `filter_update_orders`

**Reminders:** `reminder_add`, `reminder_update`, `reminder_delete`

**User:** `user_update`, `update_goals`, `user_settings_update`

**Sharing:** `share_project`, `share_project_delete`, `share_project_accept_invite`, `share_project_reject_invite`, `share_project_delete_invite`

**Notes:** `note_add`, `project_note_add`

**Live Notifications:** `live_notification_set_last_known`, `live_notification_mark_as_read`, `live_notification_mark_all_as_read`, `live_notification_mark_as_unread`

**Workspaces:** `workspace_add`, `workspace_update`, `workspace_leave`, `workspace_delete`, `workspace_update_user`, `workspace_update_user_sidebar_preference`, `workspace_delete_user`, `workspace_invite`

**View Options:** `set_view_option`, `delete_view_option`

**Workspace Filters:** `workspace_filter_add`, `workspace_filter_update`, `workspace_filter_delete`, `workspace_filter_update_orders`

---

## 4. Completed Tasks

### GET /tasks/completed
```
GET https://api.todoist.com/api/v1/tasks/completed
```

### Status: WORKING (200 OK)

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Number of items to return |
| `since` | string | ISO 8601 date to filter from |
| `project_id` | string | Filter by project |

### Response Structure
```json
{
  "items": [
    {
      "completed_at": "2026-02-06T20:13:37.000000Z",
      "content": "Task name here",
      "id": "9096392544",
      "item_object": null,
      "meta_data": null,
      "note_count": 0,
      "notes": [],
      "project_id": "6J44PcG9RXf3Pvv4",
      "section_id": null,
      "task_id": "6fwgQ6WMCPv5xRR4",
      "user_id": "39768711"
    }
  ],
  "projects": {
    "6J44PcG9RXf3Pvv4": { /* full project object */ }
  },
  "sections": {}
}
```

### Completed Task Item Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Completion record ID |
| `task_id` | string | Original task ID |
| `content` | string | Task text content |
| `project_id` | string | Project the task belongs to |
| `section_id` | string/null | Section if applicable |
| `completed_at` | string (ISO 8601) | When it was completed |
| `user_id` | string | Who completed it |
| `note_count` | integer | Number of notes/comments |
| `notes` | array | Inline notes array |
| `item_object` | object/null | Full task object (if requested) |
| `meta_data` | object/null | Additional metadata |

### GET /tasks/completed_by_due_date
```
GET https://api.todoist.com/api/v1/tasks/completed_by_due_date
```
Returns **400 Bad Request** - requires `task_id` parameter. This endpoint retrieves completion records for a specific recurring task by its due dates.

### completed_info via Sync
The `completed_info` sync resource provides per-project completion counts:
```json
[
  {
    "project_id": "6VhxF59Qqgq437H7",
    "completed_items": 5,
    "archived_sections": 0
  }
]
```

---

## 5. User Endpoint - GET /user

### Endpoint
```
GET https://api.todoist.com/api/v1/user
```

### Status: WORKING (200 OK)

### Full Response Keys (57 keys)
```
activated_user, auto_reminder, avatar_big, avatar_medium, avatar_s640,
avatar_small, business_account_id, completed_count, completed_today,
daily_goal, date_format, days_off, deleted_at, email, feature_identifier,
features, full_name, getting_started_guide_projects, has_magic_number,
has_password, has_started_a_trial, id, image_id, inbox_project_id,
is_celebrations_enabled, is_deleted, is_premium, joinable_workspace,
joined_at, karma, karma_trend, lang, mfa_enabled, next_week,
onboarding_completed, onboarding_initiated, onboarding_level,
onboarding_persona, onboarding_role, onboarding_started,
onboarding_team_mode, onboarding_use_cases, premium_status,
premium_until, ramble_sessions_usage, share_limit, sort_order,
start_day, start_page, theme_id, time_format, token, tz_info,
unique_prefix, verification_status, websocket_url, weekend_start_day,
weekly_goal
```

### Key Fields for CLI

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `karma` | integer | 10108 | Total karma points |
| `karma_trend` | string | "up" | "up" or "down" |
| `completed_count` | integer | 729 | Total lifetime completed tasks |
| `completed_today` | integer | 3 | Tasks completed today |
| `daily_goal` | integer | 18 | Daily goal setting |
| `weekly_goal` | integer | 30 | Weekly goal setting |
| `is_premium` | boolean | true | Premium subscription |
| `premium_status` | string | "current_personal_plan" | Plan name |
| `premium_until` | string | "2026-05-11T..." | Expiration date |
| `full_name` | string | "Name" | Display name |
| `email` | string | "user@example.com" | Email |
| `inbox_project_id` | string | "6J44PcG9RXf3Pvv4" | Default inbox project |
| `tz_info` | object | `{"timezone":"Europe/Moscow","gmt_string":"+03:00"}` | Timezone info |
| `start_day` | integer | 1 | Week start (1=Monday) |
| `days_off` | array | [6, 7] | Weekend days |
| `features` | object | `{"beta":1, "karma_disabled":false, ...}` | Feature flags |

---

## 6. Full Endpoint Test Results

### WORKING Endpoints (35 total)

#### REST Endpoints (6)
| Status | Method | Endpoint | Response Type |
|--------|--------|----------|---------------|
| 200 | GET | `/user` | Object (57 keys) |
| 200 | GET | `/activities` | Paginated `{next_cursor, results}` |
| 200 | GET | `/activities?limit=5` | Paginated `{next_cursor, results}` |
| 200 | GET | `/activities?event_type=completed` | Filtered activities |
| 200 | GET | `/activities?object_type=item` | Filtered activities |
| 200 | GET | `/tasks/completed` | `{items, projects, sections}` |
| 200 | GET | `/backups` | Array of `{url, version}` |

#### Sync Endpoint - All resource_types (22 verified)
| Status | resource_type | Response Keys |
|--------|--------------|---------------|
| 200 | `all` | 35 keys (everything) |
| 200 | `labels` | labels |
| 200 | `projects` | projects |
| 200 | `items` | items |
| 200 | `notes` | notes, project_notes, incomplete_item_ids, incomplete_project_ids |
| 200 | `sections` | sections |
| 200 | `filters` | filters |
| 200 | `reminders` | reminders |
| 200 | `reminders_location` | reminders |
| 200 | `locations` | locations |
| 200 | `user` | user |
| 200 | `live_notifications` | live_notifications, live_notifications_last_read_id |
| 200 | `collaborators` | collaborators, collaborator_states |
| 200 | `user_settings` | user_settings |
| 200 | `notification_settings` | settings_notifications |
| 200 | `user_plan_limits` | user_plan_limits |
| 200 | `completed_info` | completed_info |
| 200 | `stats` | stats |
| 200 | `workspaces` | workspaces |
| 200 | `workspace_users` | (empty for personal accounts) |
| 200 | `workspace_filters` | workspace_filters |
| 200 | `view_options` | view_options |
| 200 | `project_view_options_defaults` | project_view_options_defaults |
| 200 | `role_actions` | role_actions |

### NON-WORKING Endpoints

#### 404 Not Found (6)
| Endpoint | Notes |
|----------|-------|
| `GET /user/productivity_stats` | Does not exist in v1 |
| `POST /user/productivity_stats` | Does not exist in v1 |
| `GET /stats` | Does not exist in v1 |
| `GET /user/stats` | Does not exist in v1 |
| `GET /productivity_stats` | Does not exist in v1 |
| `GET /activity/log` | Does not exist in v1 |
| `GET /activity` | Does not exist in v1 |
| `GET /colors` | Does not exist in v1 |

#### 410 Gone (old API endpoints)
| Endpoint | Error Message |
|----------|---------------|
| `GET /completed/get_stats` | "This API endpoint is no longer available" |
| `GET /activity/get` | "This API endpoint is no longer available" |
| `GET /completed/get_all` | "This API endpoint is no longer available" |
| `POST /completed/get_all` | "This API endpoint is no longer available" |

#### 405 Method Not Allowed
| Endpoint | Notes |
|----------|-------|
| `POST /completed/get_stats` | Old endpoint, wrong method |
| `POST /activity/get` | Old endpoint, wrong method |

#### 400 Bad Request
| Endpoint | Notes |
|----------|-------|
| `GET /tasks/completed_by_due_date` | Requires `task_id` parameter |

---

## 7. Deprecated / Gone Endpoints

The following old Sync API v9 / REST API v2 endpoints have been **permanently removed** (410 Gone):

| Old Endpoint | Replacement in v1 |
|-------------|-------------------|
| `GET /activity/get` | `GET /activities` |
| `GET /completed/get_stats` | `POST /sync` with `resource_types: ["stats"]` |
| `GET /completed/get_all` | `GET /tasks/completed` |
| `POST /completed/get_all` | `GET /tasks/completed` |

The Todoist developer docs confirm: the old Sync API v9 and REST API v2 are deprecated. All functionality is now under the unified `/api/v1/` namespace.

---

## 8. Implementation Recommendations

### For Activity Log (src/api/activity.ts)
The current implementation returns an empty array. It should use `GET /activities`:

```typescript
// GET /activities with cursor-based pagination
// Supports: limit, event_type, object_type, cursor params
// Response: { next_cursor: string | null, results: ActivityEvent[] }
```

### For Stats (src/api/stats.ts)
The current implementation only uses `GET /user`. It should combine two sources:

```typescript
// Source 1: POST /sync with resource_types: ["stats"]
// Returns: { stats: { completed_count, days_items, week_items } }

// Source 2: GET /user
// Returns: { karma, karma_trend, completed_today, daily_goal, weekly_goal }
```

### For Completed Tasks (src/api/completed.ts)
The current implementation works but the response type needs updating:

```typescript
// GET /tasks/completed
// Response fields: id, task_id, content, project_id, section_id,
//   completed_at, user_id, note_count, notes, item_object, meta_data
```

### Key Patterns
1. **Pagination:** REST endpoints use cursor-based pagination: `{ results: [], next_cursor: string | null }`
2. **Authentication:** All endpoints use `Authorization: Bearer <token>`
3. **Content-Type:** Always `application/json`
4. **Rate Limits:** Standard rate limiting applies; 429 responses indicate throttling
5. **Sync Token:** Save and reuse for incremental sync to minimize data transfer

### user_plan_limits (Feature Gating)
The `user_plan_limits.current` object reveals what's available per plan:

| Feature Key | Type | Pro Value | Description |
|-------------|------|-----------|-------------|
| `activity_log` | boolean | true | Activity log access |
| `activity_log_limit` | integer | -1 | -1 = unlimited |
| `completed_tasks` | boolean | true | Completed tasks access |
| `filters` | boolean | true | Filter support |
| `max_collaborators` | integer | 5 | Max project collaborators |
| `max_filters` | integer | 150 | Max saved filters |
| `reminders` | boolean | true | Reminders support |
| `calendar_feeds` | boolean | true | Calendar feed export |
| `durations` | boolean | true | Task duration support |
| `deadlines` | boolean | true | Deadline support |

---

## Appendix A: Complete REST Endpoint Catalog

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/access_tokens/migrate_personal_token` | Migrate personal tokens to OAuth |
| DELETE | `/access_tokens` | Revoke OAuth tokens |
| POST | `/revoke` | RFC 7009 token revocation |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tasks` | List active tasks |
| POST | `/tasks` | Create task |
| GET | `/tasks/{task_id}` | Get task |
| POST | `/tasks/{task_id}` | Update task |
| DELETE | `/tasks/{task_id}` | Delete task |
| POST | `/tasks/{task_id}/close` | Complete task |
| POST | `/tasks/{task_id}/reopen` | Reopen task |
| POST | `/tasks/{task_id}/move` | Move task |
| POST | `/tasks/quick_add` | Quick add with NLP |
| GET | `/tasks/completed` | Get completed tasks |
| GET | `/tasks/completed_by_due_date` | Completed by due date |
| GET | `/tasks/filter/{filter_id}` | Tasks matching filter |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List projects |
| POST | `/projects` | Create project |
| GET | `/projects/{id}` | Get project |
| POST | `/projects/{id}` | Update project |
| DELETE | `/projects/{id}` | Delete project |
| POST | `/projects/{id}/archive` | Archive |
| POST | `/projects/{id}/unarchive` | Unarchive |
| GET | `/projects/{id}/collaborators` | Collaborators |
| GET | `/projects/{id}/permissions` | Permissions |
| POST | `/projects/{id}/join` | Join shared project |
| GET | `/projects/archived` | Archived projects |
| GET | `/projects/search` | Search projects |

### Sections
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/sections` | List sections |
| POST | `/sections` | Create section |
| GET | `/sections/{id}` | Get section |
| POST | `/sections/{id}` | Update section |
| DELETE | `/sections/{id}` | Delete section |
| GET | `/sections/search` | Search sections |

### Labels
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/labels` | List personal labels |
| POST | `/labels` | Create label |
| GET | `/labels/{id}` | Get label |
| POST | `/labels/{id}` | Update label |
| DELETE | `/labels/{id}` | Delete label |
| GET | `/labels/shared` | Shared labels |
| GET | `/labels/search` | Search labels |
| POST | `/labels/shared_remove` | Remove shared label |
| POST | `/labels/shared_rename` | Rename shared label |

### Comments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/comments` | List comments |
| POST | `/comments` | Create comment |
| GET | `/comments/{id}` | Get comment |
| POST | `/comments/{id}` | Update comment |
| DELETE | `/comments/{id}` | Delete comment |

### Workspaces
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/workspaces/{id}/invitations` | List invitations |
| DELETE | `/workspaces/{id}/invitations/{inv_id}` | Cancel invitation |
| PUT | `/workspaces/{id}/invitations/{inv_id}/accept` | Accept invitation |
| PUT | `/workspaces/{id}/invitations/{inv_id}/reject` | Reject invitation |
| GET | `/workspaces/{id}/projects` | Active projects |
| GET | `/workspaces/{id}/projects/archived` | Archived projects |
| GET | `/workspaces/{id}/plan` | Plan details |
| GET | `/workspaces/{id}/users` | Members |
| POST | `/workspaces/{id}/join` | Join workspace |
| POST | `/workspaces/{id}/logo` | Upload logo |

### Templates
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/templates/{id}/projects` | Import template |
| POST | `/templates` | Create from file |
| GET | `/templates/export/file` | Export as file |
| GET | `/templates/export/url` | Export as URL |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/user` | User info + karma + stats |
| GET | `/activities` | Activity log |
| GET | `/backups` | Available backups |
| GET | `/backups/download` | Download backup |
| POST | `/uploads` | Upload file |
| DELETE | `/uploads/{id}` | Delete upload |
| PUT | `/user/settings/notifications` | Update notification prefs |
| PUT | `/email` | Email forwarding |
| DELETE | `/email/disable` | Disable email forwarding |
| POST | `/sync` | Sync read/write |

---

## Appendix B: Sync Response - stats Object Detail

```json
{
  "completed_count": 729,
  "days_items": [
    {
      "date": "2026-02-06",
      "total_completed": 3
    }
  ],
  "week_items": [
    {
      "from": "2026-02-02",
      "to": "2026-02-08",
      "total_completed": 4
    }
  ]
}
```

Note: The `days_items` and `week_items` arrays may contain multiple entries covering a history window. The exact range depends on the user's account history and the sync state.

---

## Appendix C: Sync Response - user Object Detail (56 keys from sync, 57 from REST)

The REST `GET /user` endpoint returns all the sync user fields PLUS:
- `completed_count` (integer)
- `completed_today` (integer)
- `token` (the API token itself)
- `websocket_url` (for real-time updates)

The sync `user` object does NOT include `completed_count`, `completed_today`, or `token`.

---

*This report was generated through live API testing on 2026-02-06. All endpoints were tested with a valid Pro account API token.*
