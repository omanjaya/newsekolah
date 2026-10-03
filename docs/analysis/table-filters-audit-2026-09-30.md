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

## Pass 2: academic

Scope: the academic-side screens listed under "not in this pass's priority
list" above, plus the handful of related screens the task also named
(`attendance/{daily-report-tab,monthly-report-tab}`,
`homeroom/homeroom-view`, `journal/journal-view`, `promotion/promotion-view`,
`activities/activities-calendar-view`, `analytics/at-risk-students-view`).
Same reference pattern as pass 1 (`library/catalogue-view.tsx`,
`members-view.tsx`; `DataTableFilters` passed as the `filters` prop,
`useUrlState`-backed, pill selects/booleans with a shared Reset chip).

Branch `worktree-agent-ae070c2325b89237d`, commits (base `f51c9f0`):

1. `feat(web): filter academic years list`
2. `feat(web): filter homeroom roster`
3. `feat(web): filter journal list`

### Changed this pass

| Screen                                  | Endpoint                      | Params supported                                                                               | Exposed before                                                                                                                                                                                                                                     | Added now                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `academic/components/years-view.tsx`    | `GET /v1/academic/years`      | `search`, `page`, `page_size`, `include_archived`                                              | `include_archived` as a standalone `Switch`, local `useRememberedViewState` (not URL-backed); `search` already satisfied client-side by the table's own local-mode global filter                                                                   | `include_archived` moved into `DataTableFilters` as a boolean pill, URL-backed (`include_archived` query param)                                                                                                                                                                                                                                                                                                                                                                                    |
| `homeroom/components/homeroom-view.tsx` | `GET /v1/attendance/homeroom` | `date` (required), `search`, `status_code`, `limit`, `offset`                                  | `date` (required, kept as the `PageHeader` action's date input), `search` (DataTable global filter), `status_code` as a standalone `Select` with a manual "Hapus filter" link, local `useRememberedViewState` (not URL-backed)                     | `status_code` moved into `DataTableFilters` as a select pill (`status` query param), URL-backed via `useUrlState`; resets pagination on change; dropped the manual clear link (the filter bar's own per-pill remove control and shared Reset chip now cover it)                                                                                                                                                                                                                                    |
| `journal/components/journal-view.tsx`   | `GET /v1/journals`            | `academic_year_id` (required), `class_id`, `date_from`, `date_to`, `search`, `limit`, `offset` | `class_id` as a standalone `Select` (only rendered for `view_journals_all`), local `useState` (not URL-backed); `search` was never sent — the endpoint supported it but `useJournalsQuery` never passed it through and the table had no search box | `class_id` moved into `DataTableFilters` as a select pill, URL-backed (`class_id` query param), resets pagination on change; added a search box wired to the previously-unused `search` param (`useJournalsQuery` gained a fourth `search` argument; `GET /v1/journals` itself unchanged). `date_from`/`date_to` left unexposed -- no date-range filter type exists on `DataTableFilterDef` yet (another agent is adding one), and this screen had no pre-existing date UI to "leave as is" either |

### Audited, no change needed or required-scope pickers left as-is

| Screen                                               | Endpoint                                                                                                  | Params supported                            | Notes                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `academic/components/grade-levels-view.tsx`          | `GET /v1/academic/grade-levels`                                                                           | none                                        | No query params at all; the file's only `Select` is the "apply template" dialog's template picker, not a list filter                                                                                                                                                                                                                                                                |
| `academic/components/subject-offerings-view.tsx`     | `GET /v1/academic/years/{yearId}/subject-offerings`                                                       | none (yearId is a path param)               | No query params; the year `Select` is a required scope control (offerings are always scoped to one year) feeding the path param, already styled as a label+control row above the table -- kept as-is, matching `employee-recap-view.tsx`'s precedent from pass 1. The grade-level `Select` inside the add/edit dialog sets a field on the offering being created, not a list filter |
| `academic/components/rooms-view.tsx`                 | `GET /v1/academic/rooms`                                                                                  | `search`, `page`, `page_size`               | `search` already wired server-side via `useRoomsQuery(search)`; no select/boolean param to add                                                                                                                                                                                                                                                                                      |
| `academic/components/tracks-view.tsx`                | `GET /v1/academic/tracks`                                                                                 | none                                        | No query params at all; its own text filter runs client-side over the full (always-fetched) list                                                                                                                                                                                                                                                                                    |
| `attendance/components/daily-report-tab.tsx`         | `GET /v1/attendance/reports/daily`                                                                        | `date` (required), `class_id` (required)    | Both params required -- this is a picker-driven report, not an optional-filter list. Already a label+`Select`/`Input` row above the table, consistent with `today-board-view.tsx`'s precedent; left unchanged                                                                                                                                                                       |
| `attendance/components/monthly-report-tab.tsx`       | `GET /v1/attendance/reports/monthly`                                                                      | `student_id` (required), `month` (required) | Same reasoning: class and student pickers are required scope, not optional filters; `month` is a required date, not a range. Left unchanged                                                                                                                                                                                                                                         |
| `promotion/components/promotion-view.tsx`            | n/a (`usePreviewPromotionMutation`/`useCommitPromotionMutation` are `POST`s, not a filterable `GET` list) | n/a                                         | `fromYear`/`toYear` are required workflow inputs for the preview action, already `useUrlState`-backed and styled as a label+`Select` row next to the "Preview" button -- nothing to move into a filter bar since there is no list-filter endpoint behind this screen                                                                                                                |
| `activities/components/activities-calendar-view.tsx` | `GET /v1/activities/events`                                                                               | `from`, `to`                                | The only unexposed params are a date range; this screen has no pre-existing date UI at all (unlike the discipline ledger's `from`/`to`), and adding one here would duplicate the date-range filter type another agent is adding to `DataTableFilterDef` -- left unchanged pending that type                                                                                         |
| `analytics/components/at-risk-students-view.tsx`     | `GET /v1/analytics/at-risk-students`                                                                      | none                                        | No query params; scope (own class vs. every class) is resolved server-side by role. Consistent with the "audited, no change needed" entries from pass 1                                                                                                                                                                                                                             |

Screens changed: 3 (academic years; homeroom roster; journal list).

Filters added: academic years (`include_archived`); homeroom (`status`);
journal (`class_id` moved into the filter bar, plus a new `search` box
wired to the endpoint's previously-unused `search` param).

No screen in this pass's scope had more than three header action buttons,
so no "Lainnya" dropdown consolidation was needed.

Skipped and why: `grade-levels-view.tsx`, `subject-offerings-view.tsx`,
`rooms-view.tsx`, `tracks-view.tsx` (no additional select/boolean query
param available on their endpoints), `daily-report-tab.tsx`,
`monthly-report-tab.tsx` (required-scope report pickers, not optional
filters), `promotion-view.tsx` (required-scope workflow inputs for a `POST`
preview, not a filterable list), `activities-calendar-view.tsx` (the only
unexposed params are a date range, deferred to the in-flight
date-range filter type), and `at-risk-students-view.tsx` (endpoint has no
query params).
