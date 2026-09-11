-- Cross-module reads: every query below reads a table owned by another
-- module (academic: academic_calendar_events/enrollments/classes; identity:
-- users/user_profiles/student_profiles), the same convention
-- internal/modules/attendance/queries/cross_reads.sql already established.

-- name: ListActiveTenantsForLibrary :many
-- tenants carries no RLS policy (see modules/school/repository.go), so this
-- is safe to run off the pool directly for the platform-wide reservation
-- expiry and daily reminder jobs, which must iterate every tenant (same
-- convention as internal/modules/permits/queries/cross_module.sql).
select id, timezone from tenants where status in ('trial', 'active');

-- name: GetTenantTimezoneForLibrary :one
select timezone from tenants where id = $1;

-- name: ListLibraryHolidaysInRange :many
-- Holiday date ranges overlapping [from, to] (docs/06-database-schema.md:246,
-- "library_holidays digabung ke academic_calendar_events"): each row can
-- span multiple days (migrations/0060_academic_calendar.up.sql end_date),
-- the caller expands it into individual dates.
select date, end_date from academic_calendar_events
where tenant_id = $1 and kind = 'holiday' and date <= $3 and end_date >= $2;

-- name: LookupLibraryMembers :many
select u.id as user_id, u.name as user_name, u.username, coalesce(sp.nis, '') as nis, coalesce(lm.member_no, '') as member_no
from users u
left join student_profiles sp on sp.user_id = u.id
left join library_members lm on lm.user_id = u.id and lm.tenant_id = u.tenant_id
where u.tenant_id = $1 and u.deleted_at is null
  and (u.name ilike '%' || sqlc.arg(query)::text || '%' or u.username ilike '%' || sqlc.arg(query)::text || '%'
    or sp.nis ilike '%' || sqlc.arg(query)::text || '%' or lm.member_no ilike '%' || sqlc.arg(query)::text || '%')
order by u.name
limit $2;

-- name: LookupLibraryCopies :many
select c.id as copy_id, c.barcode, c.status, t.id as title_id, t.title
from library_copies c
join library_titles t on t.id = c.title_id and t.deleted_at is null
where c.tenant_id = $1 and (c.barcode ilike '%' || sqlc.arg(query)::text || '%' or t.title ilike '%' || sqlc.arg(query)::text || '%')
order by t.title
limit $2;

-- name: ListActiveEnrollmentsForLibraryClass :many
select e.student_user_id as user_id, u.name as user_name
from enrollments e
join users u on u.id = e.student_user_id
where e.tenant_id = $1 and e.class_id = $2 and e.status = 'active'
order by u.name;

-- name: HasActiveLoanForMemberAndTitle :one
select exists(
  select 1 from library_loans where tenant_id = $1 and title_id = $2 and member_user_id = $3 and status = 'active'
)::bool;

-- name: GetActiveClassNameForStudent :one
select c.name from enrollments e
join classes c on c.id = e.class_id
where e.tenant_id = $1 and e.student_user_id = $2 and e.status = 'active'
order by e.joined_on desc
limit 1;

-- name: ListOverdueLoansDetailed :many
-- The overdue report the old app showed with class and guardian phone
-- (library_circulation_v2.go:634-678), dropped from the rebuild's first
-- pass overdue endpoint.
select l.*, coalesce(c.name, '') as class_name, coalesce(sp.guardian_phone, '') as guardian_phone
from library_loans l
left join lateral (
  select e.class_id from enrollments e
  where e.tenant_id = l.tenant_id and e.student_user_id = l.member_user_id and e.status = 'active'
  order by e.joined_on desc limit 1
) e on true
left join classes c on c.id = e.class_id
left join student_profiles sp on sp.user_id = l.member_user_id
where l.tenant_id = $1 and l.status = 'active' and l.due_on < $2
order by l.due_on;

-- name: ListLoansDueForReminder :many
-- Active loans due within due_reminder_days from today, not yet overdue --
-- the daily reminder job's source list (old app: reminders/send,
-- library_circulation.go:1998-2090 daily 07:00 job).
select * from library_loans
where tenant_id = $1 and status = 'active' and due_on >= $2 and due_on <= $3
order by due_on;
