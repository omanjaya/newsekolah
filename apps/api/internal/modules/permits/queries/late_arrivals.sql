-- name: CreateLateArrival :one
insert into late_arrivals (instance_id, tenant_id, reason, occurrence_number, required_action, homeroom_reported, duty_teacher_user_id)
values ($1, $2, $3, $4, $5, $6, $7)
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
-- tidak bisa ditandai hadir"). $3 is the tenant-local day attendance is
-- saving, so it is compared with local_date: opened_date is the UTC day,
-- which for a UTC+8 school is still yesterday before 08:00 local.
select wi.* from workflow_instances wi
where wi.tenant_id = $1
  and wi.kind = 'late_arrival'
  and wi.subject_user_id = $2
  and wi.status = 'in_progress'
  and wi.local_date = $3
limit 1;

-- name: ListLateArrivalsForReview :many
-- The picket teacher's review queue: open flows whose current stage is a
-- manual one (the default chain's duty_teacher review), scoped to the
-- teacher whose own token opened each flow, matching ReviewLateArrival's
-- actor check (regression fix, docs/analysis/backend-inventory.md 1.16).
-- A caller who holds manage_attendance through a directly assigned role
-- (not a duty), the "admin" case, sees every such flow. A flow already
-- past its review (waiting for leadership's or the class teacher's QR) is
-- not listed here: ListLateArrivalsAtScanStage feeds those approvers.
-- class_name is read live from classes (a cross-module read, see
-- cross_module.sql): a late arrival keeps no snapshot, and an approver
-- working across the school needs the class beside the name.
select la.*, wi.subject_user_id, wi.class_id, wi.current_stage_index, wi.status, wi.opened_at,
  wi.academic_year_id, (wd.stages -> wi.current_stage_index)::jsonb as current_stage,
  coalesce(c.name, '')::text as class_name
from late_arrivals la
join workflow_instances wi on wi.id = la.instance_id
join workflow_definitions wd on wd.id = wi.definition_id
left join classes c on c.tenant_id = wi.tenant_id and c.id = wi.class_id
where la.tenant_id = $1 and wi.status = 'in_progress'
  and (wd.stages -> wi.current_stage_index ->> 'verification') = 'manual'
  and (
    la.duty_teacher_user_id = $2
    or exists (
      select 1 from user_roles ur
      join role_permissions rp on rp.role_id = ur.role_id
      where ur.tenant_id = $1 and ur.user_id = $2 and rp.permission_code = 'manage_attendance'
    )
  )
order by wi.opened_at;

-- name: ListLateArrivalsAtScanStage :many
-- Every open flow whose current stage needs an approver's QR (the default
-- chain's leadership and class_teacher stages). Who may approve each one
-- depends on its stage's approver rule, which for teacher_of_class_now is
-- a schedule lookup SQL cannot express, so the service narrows this list
-- to the caller with the same rule evaluation the scan itself runs
-- (Service.ListLateArrivalsForReview). Late arrivals are same-day flows
-- (ExpireHangingInstances closes them at midnight), so this stays small.
select la.*, wi.subject_user_id, wi.class_id, wi.current_stage_index, wi.status, wi.opened_at,
  wi.academic_year_id, (wd.stages -> wi.current_stage_index)::jsonb as current_stage,
  coalesce(c.name, '')::text as class_name
from late_arrivals la
join workflow_instances wi on wi.id = la.instance_id
join workflow_definitions wd on wd.id = wi.definition_id
left join classes c on c.tenant_id = wi.tenant_id and c.id = wi.class_id
where la.tenant_id = $1 and wi.status = 'in_progress'
  and (wd.stages -> wi.current_stage_index ->> 'verification') = 'qr_scan'
order by wi.opened_at;
