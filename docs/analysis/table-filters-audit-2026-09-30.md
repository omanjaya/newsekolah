# DataTable filter bar rollout audit — 2026-09-30

Scope: every screen under `apps/web/features` that renders `<DataTable`
(grep `<DataTable` across `apps/web/features/**/*.tsx`, 60 files). For each,
this lists the list endpoint's query parameters (from `openapi/modules/*.yaml`)
and which ones the UI exposed before this pass. "Added now" is only filled in
for the screens actually changed in this rollout; the rest were left alone
(either already fully exposed, the endpoint has no more filterable params to
add, or the screen was out of this pass's priority list / explicitly
off-limits).

Reference pattern (unchanged, do not touch): `apps/web/features/library/components/catalogue-view.tsx`
and `members-view.tsx` — `DataTableFilters` (`packages/ui/src/components/data-table/data-table-filters.tsx`)
passed as the `filters` prop on `<DataTable`, each filter's value owned by
`useUrlState`, pill selects with a shared "Reset filter" chip once any filter
is active, "Hapus filter {label}" per pill.

## Changed this pass

| Screen                                               | Endpoint                                                   | Params supported                                                             | Exposed before                                                                                                                                                                     | Added now                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `library/components/violations-view.tsx`             | `GET /v1/library/violations`                               | `status`, `kind`, `limit`, `offset`                                          | `status`, `kind` as standalone `Select`s, local state (not URL-backed), separate "Bersihkan filter" link                                                                           | Same two filters moved into `DataTableFilters`, URL-backed (`status`, `kind` query params), pill Reset/remove chips                                                                                                                                                                                  |
| `school/components/users-view.tsx`                   | `GET /v1/users`                                            | `q`, `status`, `profile_kind`, `role`, `include_archived`, `cursor`, `limit` | `q` (search), `profile_kind` as standalone `Select`, `include_archived` as a toggle `Button` — both local state, not URL-backed                                                    | `profile_kind` and `include_archived` moved into `DataTableFilters` (URL-backed); added `status` and `role` filters the endpoint already accepted but the UI never sent (`role` options from `useRolesQuery`); any filter change resets cursor pagination                                            |
| `discipline/components/violations-ledger-view.tsx`   | `GET /v1/discipline/violations` (via `useViolationsQuery`) | `class_id`, `from`, `to`, `include_voided`                                   | `class_id` as standalone `Select`, `include_voided` as a `Checkbox` — local state                                                                                                  | Both moved into `DataTableFilters`, URL-backed (`class_id`, `include_voided`); date range (`from`/`to`) kept as separate date inputs since `DataTableFilterDef` only supports select/boolean                                                                                                         |
| `discipline/components/issued-letters-panel.tsx`     | warning letters list                                       | `class_id` (+ pagination)                                                    | `class_id` as standalone `Select`                                                                                                                                                  | Moved into `DataTableFilters`, URL-backed                                                                                                                                                                                                                                                            |
| `discipline/components/counseling-bk-team-panel.tsx` | BK-team counseling list                                    | `topic` (+ pagination)                                                       | `topic` as standalone `Select`                                                                                                                                                     | Moved into `DataTableFilters`, URL-backed. The "mine" counseling tab (`counseling-view.tsx`, `useMyCounselingsQuery`) takes no filterable query params beyond pagination — left unchanged                                                                                                            |
| `visitors/components/expected-guests-view.tsx`       | `GET /v1/visitors/expected-guests`                         | `date` (required), `include_resolved`                                        | `date` only (date input, already URL-backed via `useDateFilter`); screen always called the endpoint with `include_resolved=true`                                                   | Added an "onlyPending" boolean `DataTableFilters` pill (URL param `only_pending`) toggling `include_resolved`                                                                                                                                                                                        |
| `visitors/components/incident-log-view.tsx`          | `GET /v1/visitors/incidents`                               | `from`, `to` (required), `include_closed`, `limit`, `offset`                 | `include_closed` as a plain `Checkbox`, local state, default on                                                                                                                    | Moved into `DataTableFilters` as "onlyOpen" boolean (URL param `only_open`); `from`/`to` stay fixed to the last-30-days window (unchanged, no UI for them)                                                                                                                                           |
| `activities/components/clubs-view.tsx`               | `GET /v1/activities/extracurriculars`                      | `include_inactive`                                                           | Standalone `Checkbox`, local state                                                                                                                                                 | Moved into `DataTableFilters`, URL-backed (`include_inactive`)                                                                                                                                                                                                                                       |
| `activities/components/achievements-view.tsx`        | `GET /v1/activities/achievements`                          | `student_id`, `class_id`                                                     | Neither exposed (`useAchievementsQuery()` called with no params)                                                                                                                   | Added a `class` `DataTableFilters` select (URL param `class_id`), options from `useClassesQuery`                                                                                                                                                                                                     |
| `announcements/components/announcements-manage.tsx`  | `GET /v1/announcements` (admin list)                       | `status` (+ cursor pagination)                                               | Standalone `Select`, local state                                                                                                                                                   | Moved into `DataTableFilters`, URL-backed; resets cursor pagination on change                                                                                                                                                                                                                        |
| `audit/components/audit-logs-view.tsx`               | `GET /v1/audit/logs` (via `useAuditLogsQuery`)             | `actorUserId`, `entityType`, `from`, `to`, `cursor`                          | `actorUserId`/`entityType` as standalone `Select`s using `useRememberedViewState` (session-persisted, not URL-backed); a manual "Reset filters" button also cleared the date range | `actorUserId` and `entityType` moved into `DataTableFilters`, URL-backed (`actor`, `entity_type`), resets cursor pagination; dropped the manual reset button (the filter bar's own reset now covers actor/entity type; `from`/`to` keep their own clear, matching the discipline ledger's precedent) |

## Audited, no change needed (endpoint has no more filterable params)

| Screen                                                | Endpoint                                                | Params supported                   | Notes                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `library/components/desk-overdue-table.tsx`           | `GET /v1/library/loans/overdue`                         | none                               | No query params at all; nothing to expose                                                                                          |
| `library/components/visits-view.tsx`                  | `GET /v1/library/visits`                                | `from`, `to` (both required)       | Date range only, already a date picker; no select/boolean param to add                                                             |
| `library/components/stocktake-view.tsx`               | `GET /v1/library/stocktakes`                            | `limit`, `offset`                  | Pagination only                                                                                                                    |
| `school/components/subjects-view.tsx`                 | `GET /v1/academic/subjects`                             | `search`, `page`, `page_size`      | Search already wired to the table's global filter; no select/boolean param to add                                                  |
| `staff-attendance/components/today-board-view.tsx`    | `GET /v1/staff-attendance/today`                        | `date`                             | Already a date input                                                                                                               |
| `staff-attendance/components/employee-recap-view.tsx` | `GET /v1/staff-attendance/employees/{employeeId}/recap` | `month` (employee is a path param) | Employee picker is a required navigation control, not an optional list filter; month already exposed                               |
| `reports/components/schedules-view.tsx`               | `GET /v1/reports/schedules`                             | none                               | No query params at all                                                                                                             |
| `school/components/classes-view.tsx`                  | n/a                                                     | n/a                                | Does not render `<DataTable`; it's a master/detail nav + roster panel, not a filterable list — out of scope for `DataTableFilters` |

## Not in this pass's priority list (audited by grep only, not implemented)

These all render `<DataTable` but sit outside the task's prioritized areas
(school data / library / discipline / visitors / staff attendance /
activities / announcements admin / audit logs / reports list). Grep shows
whether each already carries its own standalone `Select`/`Checkbox` filters
(candidates for a future pass) or none:

- `academic/components/{grade-levels-view,subject-offerings-view}.tsx` — have standalone `Select`s (year/grade level)
- `academic/components/{rooms-view,tracks-view,years-view}.tsx` — no standalone filters beyond search/checkbox state
- `activities/components/activities-calendar-view.tsx` — no standalone filters
- `analytics/components/at-risk-students-view.tsx` — no standalone filters (class/student lookups used for display only)
- `attendance/components/{daily-report-tab,monthly-report-tab}.tsx` — have standalone `Select`s (class/grade/student)
- `billing/components/{arrears-report-view,bills-list-view,fee-types-view,generation-view}.tsx` — `bills-list-view` and `fee-types-view` have standalone `Select`/`Checkbox`
- `discipline/components/{at-risk-panel,student-counseling-history,violation-catalog-view}.tsx` — `at-risk-panel` and `violation-catalog-view` have standalone `Select`/`Checkbox`
- `homeroom/components/homeroom-view.tsx` — has a standalone `Select`
- `integrations/components/{api-keys-panel,webhook-deliveries-panel,webhook-endpoints-panel}.tsx` — `webhook-deliveries-panel` has a standalone `Select` (endpoint picker)
- `journal/components/journal-view.tsx` — has a standalone `Select`
- `library/components/{copies-browser-view,loan-rules-view,master-entry-tab,material-types-tab,member-types-view,partners-tab,title-copies-view}.tsx` — settings/master-data tabs, not prioritized; `copies-browser-view` and `loan-rules-view` already have standalone `Select`s
- `mentoring/components/{mentor-group-members-panel,mentor-groups-view,mentor-meeting-notes-panel}.tsx` — `mentor-groups-view` has a standalone `Select` (scope)
- `onboarding/components/onboarding-wizard.tsx`, `platform/components/tenants-view.tsx`, `profile/components/sessions-table.tsx` — no standalone filters
- `promotion/components/promotion-view.tsx` — has standalone `Select`s (year pickers)
- `supervision/components/supervision-cycle-detail-view.tsx`, `supervision-cycle-report-view.tsx`, `supervision-cycles-view.tsx` — no standalone filters

## Explicitly off-limits (per task instructions, not touched)

`library/components/{catalogue-view,members-view,ddc-classes-tab,import-preview-table,library-reports-view,report-*}.tsx`,
`grading/**`, `documents/**`, `academic/enrollment-import-view.tsx`,
`dashboard/home/blocks/leadership`, `messaging/deliveries-view.tsx`,
`school/periods-view.tsx`, `school/user-import-preview-table.tsx`,
`settings/notification-*`, `staff-attendance/import-view.tsx`,
`schedule/schedule-bulk-view.tsx`, and `packages/ui`.

## Summary

Branch `worktree-agent-af007af90dece1955`, commits (base `df7e35c`):

1. `808f8ce` feat(web): filter the library violations list
2. `6b0197f` feat(web): filter the school users list
3. `29cca06` feat(web): filter discipline lists
4. `d356c5d` feat(web): filter the visitors lists
5. `69d426e` feat(web): filter the activities lists
6. `fd5b0d6` feat(web): filter the announcements admin list
7. `7b629e0` feat(web): filter the audit log list

Screens changed: 10 (library violations; school users; discipline violations
ledger, issued letters, counseling BK-team; visitors expected guests and
incident log; activities clubs and achievements; announcements admin list;
audit logs).

Filters added: library violations (`status`, `kind`); school users
(`kind`, `status`, `role`, `include_archived`); discipline (`class_id`,
`include_voided` on the ledger; `class_id` on issued letters; `topic` on
BK-team counseling); visitors (`only_pending` on expected guests,
`only_open` on incidents); activities (`include_inactive` on clubs,
`class_id` on achievements); announcements (`status`); audit logs (`actor`,
`entity_type`).

Every screen with more than three header action buttons in the prioritized
list already used the primary + secondary + "Lainnya" dropdown pattern
before this pass (e.g. `catalogue-view.tsx`, `users-view.tsx`), so no
header-action consolidation was needed on the screens actually changed.

Skipped and why: `classes-view.tsx` (no `<DataTable`, master/detail nav, not
a filterable list), `subjects-view.tsx` and every "audited, no change
needed" screen above (endpoint has no additional select/boolean query
param to expose), `reports/schedules-view.tsx` (endpoint takes no query
params at all), and the ~35 screens listed under "not in this pass's
priority list" (outside the task's prioritized areas; left for a future
pass).

## Pass 2: library settings, integrations, platform, profile

Scope: library master-data tabs, integrations, platform tenants, and the
profile sessions list — the screens this file's "not in this pass's
priority list" section above named as candidates. For each, every
`openapi/modules/*.yaml` list endpoint behind the screen was checked for
query parameters the UI did not yet expose.

### Changed this pass

| Screen                                                 | Endpoint                                  | Params supported                                                                | Exposed before                                                                                                                              | Added now                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `library/components/copies-browser-view.tsx`           | `GET /v1/library/copies`                  | `title_id`, `status`, `category_id`, `location_id`, `search`, `limit`, `offset` | `status`, `category_id`, `location_id` as three standalone `Select`s next to a manual "Bersihkan filter" link, local state (not URL-backed) | Same three filters moved into `DataTableFilters`, URL-backed (`status`, `category_id`, `location_id` query params), pill Reset/remove chips; `title_id` left unexposed (no title picker on this screen; used only by the per-title copies view, which calls a different endpoint)                                                                  |
| `integrations/components/webhook-deliveries-panel.tsx` | `GET /v1/integrations/webhook-deliveries` | `endpoint_id`, `cursor`, `limit`                                                | `endpoint_id` as a standalone `Select` (with its own "Semua endpoint" option), state lifted to the parent tab so it survives switching tabs | Moved into `DataTableFilters` as a select pill (empty value = "Semua endpoint"), same lifted parent state and same cursor-reset-on-change behavior; this control turned out to be optional, not required — `endpoint_id` is an optional query param and the panel already had an "all endpoints" option, so no required-scope exception was needed |

### Audited, no change needed (endpoint has no filterable params, or none at all)

| Screen                                                | Endpoint(s)                                                                                                            | Notes                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `library/components/loan-rules-view.tsx`              | `GET /v1/library/loan-rules`                                                                                           | No query params at all; small list (dated overrides), already uses the shared `DataTable` toolbar consistently |
| `library/components/master-entry-tab.tsx`             | `GET /v1/library/collection-categories`, `/v1/library/acquisition-sources`, `/v1/library/locations` (shared component) | No query params on any of the three backing endpoints; small code/name master lists                            |
| `library/components/material-types-tab.tsx`           | `GET /v1/library/material-types`                                                                                       | No query params at all; small master list                                                                      |
| `library/components/member-types-view.tsx`            | `GET /v1/library/member-types`                                                                                         | No query params at all; small master list                                                                      |
| `library/components/partners-tab.tsx`                 | `GET /v1/library/partners`                                                                                             | No query params at all; small master list                                                                      |
| `library/components/title-copies-view.tsx`            | `GET /v1/library/titles/{titleId}/copies`                                                                              | Only a required `titleId` path param; no query params to expose on this single-title view                      |
| `integrations/components/api-keys-panel.tsx`          | `GET /v1/integrations/api-keys`                                                                                        | No query params at all                                                                                         |
| `integrations/components/webhook-endpoints-panel.tsx` | `GET /v1/integrations/webhook-endpoints`                                                                               | No query params at all                                                                                         |
| `platform/components/tenants-view.tsx`                | `GET /v1/platform/tenants`                                                                                             | No query params at all; status/level are columns, not filters the API supports                                 |
| `profile/components/sessions-table.tsx`               | `GET /v1/auth/sessions`                                                                                                | No query params at all; the existing search box already covers device/IP/client text search client-side        |

All ten of these already render through the shared `DataTable` (and, where
present, `DataTableToolbar`), so their toolbar styling was already
consistent with the reference pattern before this pass — no code changes
were needed to "say so" here, per the task's own carve-out for small
master-data tabs with no endpoint filters.

None of these screens had more than three header action buttons, so no
"Lainnya" dropdown consolidation was needed either.

### Summary

Branch `worktree-agent-a033d4051ccfd3deb`, commits (base `f51c9f0`):

1. `feat(web): filter library copies browser` — `copies-browser-view.tsx`
2. `feat(web): filter integrations webhook deliveries` — `webhook-deliveries-panel.tsx`

Screens changed: 2 (library copies browser; integrations webhook
deliveries). Filters added: copies browser (`status`, `category_id`,
`location_id`); webhook deliveries (`endpoint_id`, non-URL, lifted state
unchanged).

Skipped and why: `loan-rules-view.tsx`, `master-entry-tab.tsx`,
`material-types-tab.tsx`, `member-types-view.tsx`, `partners-tab.tsx`,
`title-copies-view.tsx`, `api-keys-panel.tsx`, `webhook-endpoints-panel.tsx`,
`tenants-view.tsx`, `sessions-table.tsx` — every one of their backing list
endpoints takes no select/boolean query parameter at all (several take no
query parameters whatsoever), so there was nothing to move into
`DataTableFilters` without inventing a filter the API does not support;
each already uses the shared `DataTable` toolbar consistently.
