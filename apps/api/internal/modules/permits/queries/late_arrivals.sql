-- name: CreateLateArrival :one
insert into late_arrivals (instance_id, tenant_id, reason, occurrence_number, required_action, homeroom_reported)
values ($1, $2, $3, $4, $5, $6)
returning *;

-- name: GetLateArrival :one
select * from late_arrivals where tenant_id = $1 and instance_id = $2;

-- name: UpdateLateArrivalReview :one
update late_arrivals set reason = $3, required_action = $4, homeroom_reported = $5
where tenant_id = $1 and instance_id = $2
returning *;

-- name: MarkLateArrivalCompleted :one
update late_arrivals set completed_at = $3
where tenant_id = $1 and instance_id = $2
returning *;

-- name: GetInProgressLateArrivalToday :one
-- permits.AttendanceBlocker: a student mid-flow cannot be marked present
-- for today's attendance until this resolves, per
-- docs/analysis/backend-inventory.md 1.16 ("selama belum completed siswa
-- tidak bisa ditandai hadir").
select wi.* from workflow_instances wi
where wi.tenant_id = $1
  and wi.kind = 'late_arrival'
  and wi.subject_user_id = $2
  and wi.status = 'in_progress'
  and wi.opened_date = $3
limit 1;

-- name: ListLateArrivalsForReview :many
select la.*, wi.subject_user_id, wi.class_id, wi.current_stage_index, wi.status, wi.opened_at
from late_arrivals la
join workflow_instances wi on wi.id = la.instance_id
where la.tenant_id = $1 and wi.status = 'in_progress'
order by wi.opened_at;
