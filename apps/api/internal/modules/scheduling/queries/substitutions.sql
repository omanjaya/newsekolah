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

-- name: ListAcceptedSubstitutionsForSubstituteDate :many
-- Every schedule a teacher is standing in for on one date, accepted only --
-- the input to the attendance module's "today's sessions" list
-- (own schedules plus accepted substitutions).
select * from substitution_requests
where tenant_id = $1 and substitute_user_id = $2 and date = $3 and status = 'accepted';
