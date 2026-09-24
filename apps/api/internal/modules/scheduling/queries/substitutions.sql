-- name: CreateSubstitutionRequest :one
insert into substitution_requests (
  tenant_id, academic_year_id, schedule_id, date, requester_user_id, substitute_user_id, requester_note
) values (
  $1, $2, $3, $4, $5, $6, $7
)
returning *;

-- name: GetSubstitutionByID :one
select * from substitution_requests where tenant_id = $1 and id = $2;

-- name: GetActiveSubstitutionForScheduleDate :one
select * from substitution_requests
where tenant_id = $1 and schedule_id = $2 and date = $3 and status in ('pending', 'accepted')
limit 1;

-- name: GetAcceptedSubstitutionForScheduleDate :one
select * from substitution_requests
where tenant_id = $1 and schedule_id = $2 and date = $3 and status = 'accepted' and substitute_user_id = $4
limit 1;

-- name: RespondSubstitutionRequest :one
update substitution_requests
set status = $3, response_note = $4, responded_at = now()
where tenant_id = $1 and id = $2 and status = 'pending'
returning *;

-- name: CancelSubstitutionRequest :one
update substitution_requests
set status = 'cancelled', responded_at = now()
where tenant_id = $1 and id = $2
returning *;

-- name: ListSubstitutionsIncoming :many
select * from substitution_requests
where tenant_id = $1 and substitute_user_id = $2
order by date desc, created_at desc;

-- name: ListSubstitutionsOutgoing :many
select * from substitution_requests
where tenant_id = $1 and requester_user_id = $2
order by date desc, created_at desc;

-- name: ListSubstitutionsIncomingWithSchedule :many
-- Same rows as ListSubstitutionsIncoming, joined with the covered
-- schedule's class/subject/period so the web substitutions page can render
-- a session-card without a second round trip per row. The join is always
-- safe: substitution_requests.schedule_id cascades on schedule delete, so
-- the referenced schedule row always exists for as long as this row does.
select sqlc.embed(sr), s.class_id, s.subject_id, s.start_period_id, s.end_period_id
from substitution_requests sr
join schedules s on s.id = sr.schedule_id
where sr.tenant_id = $1 and sr.substitute_user_id = $2
order by sr.date desc, sr.created_at desc;

-- name: ListSubstitutionsOutgoingWithSchedule :many
select sqlc.embed(sr), s.class_id, s.subject_id, s.start_period_id, s.end_period_id
from substitution_requests sr
join schedules s on s.id = sr.schedule_id
where sr.tenant_id = $1 and sr.requester_user_id = $2
order by sr.date desc, sr.created_at desc;

-- name: ListSubstitutionsAll :many
-- The manage_schedules-only "all" scope (docs/analysis/backend-inventory.md
-- section 1.13): every substitution request tenant-wide, optionally
-- narrowed to one status.
select * from substitution_requests
where tenant_id = $1 and (sqlc.narg(status)::text is null or status = sqlc.narg(status)::text)
order by date desc, created_at desc;

-- name: ListEligibleSubstituteTeachers :many
-- Active teachers this academic year, excluding requesterUserID, with an
-- optional name search -- the substitute-picker's option list
-- (docs/analysis/backend-inventory.md section 1.13).
select distinct u.id, u.name
from teaching_assignments ta
join users u on u.id = ta.teacher_user_id
where ta.tenant_id = $1 and ta.academic_year_id = $2 and ta.is_active and u.id != $3
  and (sqlc.narg(search)::text is null or u.name ilike '%' || sqlc.narg(search)::text || '%')
order by u.name
limit $4 offset $5;

-- name: ListAcceptedSubstitutionsForSubstituteDate :many
-- Every schedule a teacher is standing in for on one date, accepted only --
-- the input to the attendance module's "today's sessions" list
-- (own schedules plus accepted substitutions).
select * from substitution_requests
where tenant_id = $1 and substitute_user_id = $2 and date = $3 and status = 'accepted';
