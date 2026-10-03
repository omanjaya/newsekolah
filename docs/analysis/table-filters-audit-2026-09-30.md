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

## Pass 2: billing, discipline catalog, mentoring, supervision

Scope for this pass: `billing/components/{arrears-report-view,bills-list-view,
fee-types-view,generation-view}.tsx`; `discipline/components/{at-risk-panel,
student-counseling-history,violation-catalog-view}.tsx`;
`mentoring/components/{mentor-group-members-panel,mentor-groups-view,
mentor-meeting-notes-panel}.tsx`; `supervision/components/
{supervision-cycle-detail-view,supervision-cycle-report-view,
supervision-cycles-view}.tsx` — the screens this pass's own audit (above,
"not in this pass's priority list") had already surveyed by grep only.
This pass reads each screen's list endpoint in `openapi/modules/*.yaml` and
its hook in the feature's own `api.ts` to confirm, rather than guess,
whether a param is actually forwarded.

### Changed

| Screen                                             | Endpoint                                                                                | Params supported                                  | Exposed before                                                                                                          | Added now                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `billing/components/fee-types-view.tsx`            | `GET /v1/billing/fee-types` (`useFeeTypesQuery`)                                        | `include_inactive`                                | Standalone `Checkbox`, local state                                                                                      | Moved into `DataTableFilters`, URL-backed (`include_inactive`)                                                                                                                                                                                                                                                                                                                                  |
| `billing/components/bills-list-view.tsx`           | `GET /v1/billing/bills` (`useBillsQuery`)                                               | `period`, `status`, `class_id`, `limit`, `offset` | `period` (date `Input`), `status` and `class_id` as standalone `Select`s — all local state                              | `status` and `class_id` moved into `DataTableFilters`, URL-backed (`status`, `class_id`); `period` stays its own labeled month input next to the filter pills (not a select/boolean value `DataTableFilterDef` can represent)                                                                                                                                                                   |
| `discipline/components/violation-catalog-view.tsx` | `GET /v1/discipline/violation-types` (`useViolationTypesQuery`)                         | `include_inactive`, `search`                      | `include_inactive` as standalone `Checkbox`, local state                                                                | Moved into `DataTableFilters`, URL-backed (`include_inactive`); `search` is never forwarded by `useViolationTypesQuery` (its only caller), so per this pass's rule of only wiring a param the hook already forwards, it was left alone — the table's own `mode="local"` search box already covers the same need client-side                                                                     |
| `discipline/components/at-risk-panel.tsx`          | `GET /v1/discipline/sp-candidates` (`useSPCandidatesQuery`)                             | `class_id`, `level`, `search`, `limit`, `offset`  | `class_id` and `level` as standalone `Select`s using `useRememberedViewState` (session-persisted, not URL-backed)       | Both moved into `DataTableFilters`, URL-backed (`class_id`, `level`); any change resets pagination                                                                                                                                                                                                                                                                                              |
| `mentoring/components/mentor-groups-view.tsx`      | `GET /v1/mentoring/groups`, `GET /v1/mentoring/my-groups` (neither takes a query param) | n/a — not an optional filter                      | `scope` (`mine`/`all`) as a standalone `Select`, URL-backed via `useUrlState`, positioned in its own row above the tabs | Restyled only (no param to add): `scope` picks which of the two zero-param endpoints runs, not an optional narrowing filter, so it stays required rather than moving into `DataTableFilters`; restyled from a `label`+`Select` into a pill-style `Tabs` switch (matching `CounselingView`'s mine/bk-team pattern) positioned directly above the table, next to where its toolbar renders search |

### Audited, no change possible (endpoint has no filterable query params)

| Screen                                                     | Endpoint                                                                                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `billing/components/arrears-report-view.tsx`               | `GET /v1/billing/arrears` (`useArrearsReportQuery`)                                            | No parameters at all — the report is two fully aggregated, server-computed tables (`by_class`, `by_student`); no standalone filter existed either. Nothing to move or add.                                                                                                                                                                                                                                                     |
| `billing/components/generation-view.tsx`                   | `POST /v1/billing/generation/{preview,run}`                                                    | Not a list endpoint — `period` is a required month the whole screen is scoped to (you cannot preview or generate without picking one), not an optional narrowing filter. It already renders as a labeled input directly above the result table, the same `label` + `Input` idiom used for every other required-scope picker in the app (e.g. `staff-attendance/employee-recap-view.tsx`'s employee/month pickers). Left as is. |
| `discipline/components/student-counseling-history.tsx`     | `GET /v1/discipline/students/{studentId}/counselings` (`useStudentCounselingsQuery`)           | Only path param (`studentId`, supplied by the parent page's navigation, not a picker inside this component) — no query params at all. No standalone filter existed. Nothing to move or add.                                                                                                                                                                                                                                    |
| `mentoring/components/mentor-group-members-panel.tsx`      | `GET /v1/mentoring/groups/{groupId}/members`                                                   | Only path param (`groupId`) — no query parameters. No standalone filter existed (the panel's only `Select` is the "assign a student" picker inside the add-member dialog, not a list filter). Nothing to move or add.                                                                                                                                                                                                          |
| `mentoring/components/mentor-meeting-notes-panel.tsx`      | `GET /v1/mentoring/groups/{groupId}/notes`                                                     | Only path param (`groupId`) — no query parameters. No standalone filter existed. Nothing to move or add.                                                                                                                                                                                                                                                                                                                       |
| `supervision/components/supervision-cycles-view.tsx`       | `GET /v1/supervision/cycles`                                                                   | No parameters at all. No standalone filter existed. Nothing to move or add.                                                                                                                                                                                                                                                                                                                                                    |
| `supervision/components/supervision-cycle-detail-view.tsx` | `GET /v1/supervision/cycles/{cycleId}/scheduled`                                               | Only path param (`cycleId`, a route segment set by navigating from the cycles list — there is no in-page picker for it to restyle). No query parameters. No standalone filter existed. Nothing to move or add.                                                                                                                                                                                                                 |
| `supervision/components/supervision-cycle-report-view.tsx` | Same `GET /v1/supervision/cycles/{cycleId}/scheduled` data, aggregated client-side per teacher | No separate endpoint or query params; same `cycleId` path-scoped navigation as the detail view. No standalone filter existed. Nothing to move or add.                                                                                                                                                                                                                                                                          |

### Summary

Branch `worktree-agent-a28d287c320f716d8`, base `f51c9f0`. Commits:

1. `48b97a9` `feat(web): filter billing lists` — `fee-types-view.tsx`, `bills-list-view.tsx`
2. `d13f815` `feat(web): filter discipline catalog lists` — `violation-catalog-view.tsx`, `at-risk-panel.tsx`
3. `311e72a` `feat(web): filter mentoring lists` — `mentor-groups-view.tsx` (restyle only, no new param)

Screens changed: 5 (billing fee types, billing bills list, discipline
violation catalog, discipline at-risk panel, mentoring groups scope
restyle). Screens audited with no change possible: 8 (billing arrears
report and generation; discipline student counseling history; mentoring's
member panel and meeting notes; all three supervision screens) — every one
of those list endpoints takes either no query parameters at all or only the
path parameter that already scopes it (student/group/cycle id), and none
had a pre-existing standalone filter to move, so there was nothing this
task's mandate ("move existing filters; add filters the endpoint already
supports but the UI doesn't expose") covers.

Filters added: billing (`include_inactive` on fee types; `status`,
`class_id` on the bills list); discipline (`include_inactive` on the
violation catalog; `class_id`, `level` on the at-risk panel). No new filter
param for mentoring — `mentor-groups-view.tsx`'s required `scope` control
was only restyled.

No screen in this pass's scope had more than three header action buttons,
so no primary/secondary/"Lainnya" dropdown consolidation was needed.

Required-scope pickers were kept required rather than folded into the
optional filter bar: `generation-view.tsx`'s period picker (the screen
cannot preview or generate without one) stays a `label`+`Input`, the same
idiom used elsewhere for that pattern; `mentor-groups-view.tsx`'s mine/all
scope picker (it selects between two different zero-param endpoints, not a
narrowing filter on one) was restyled from a `label`+`Select` into a
pill-style `Tabs` switch positioned directly above the table, closer to
where the table's own search/filter row renders.
