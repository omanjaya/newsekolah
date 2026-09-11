-- name: CreateWorkflowInstance :one
insert into workflow_instances (
  tenant_id, academic_year_id, definition_id, kind, subject_user_id, class_id,
  current_stage_index, status, payload, opened_at, created_by
)
values ($1, $2, $3, $4, $5, $6, 0, 'in_progress', $7, $8, $9)
returning *;

-- name: GetWorkflowInstanceByID :one
select * from workflow_instances where tenant_id = $1 and id = $2;

-- name: GetWorkflowInstanceForUpdate :one
select * from workflow_instances where tenant_id = $1 and id = $2 for update;

-- name: AdvanceWorkflowInstanceStage :one
update workflow_instances
set current_stage_index = $3, status = $4, closed_at = $5
where tenant_id = $1 and id = $2
returning *;

-- name: ListWorkflowInstancesBySubject :many
select * from workflow_instances
where tenant_id = $1 and kind = $2 and subject_user_id = $3
order by opened_at desc
limit $4 offset $5;

-- name: GetInProgressWorkflowInstance :one
-- Any not-yet-terminal instance of this kind for this subject, used to
-- reject a new submission with a clear 409 before the DB constraint would.
select * from workflow_instances
where tenant_id = $1 and kind = $2 and subject_user_id = $3 and status in ('in_progress', 'approved')
order by opened_at desc
limit 1;

-- name: GetExitPermitInstanceForSubjectToday :one
-- Regression fix (docs/analysis/backend-inventory.md 1.15): the old app
-- capped a student at one exit-permit request per day "apa pun
-- statusnya" -- including ones that already exited. sqlc.arg('today') is
-- the tenant-local date (s.tenantNow), so this pre-check turns the common
-- case into a friendly 409 in the timezone the school actually operates
-- in; opened_date itself stays the fixed-UTC approximation
-- ux_workflow_instances_one_exit_permit_per_day enforces (see that
-- migration), which still backstops the race this pre-check cannot close.
select * from workflow_instances
where tenant_id = $1 and kind = 'exit_permit' and subject_user_id = $2
  and opened_date = sqlc.arg('today')::date
  and status in ('in_progress', 'approved', 'completed')
limit 1;

-- name: LockSubjectForInstanceCounting :exec
-- Transaction-scoped advisory lock so two concurrent late-arrival opens
-- for the same student cannot both read the same
-- CountWorkflowInstancesForSubjectYear result and mint the same
-- occurrence_number (docs/analysis/database-inventory.md 1.5: the old
-- app's per-student late-arrival numbering had exactly this race).
select pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0));

-- name: CountWorkflowInstancesForSubjectYear :one
select count(*)::bigint from workflow_instances
where tenant_id = $1 and kind = $2 and subject_user_id = $3 and academic_year_id = $4
  and status <> 'cancelled';

-- name: CountInProgressWorkflowInstances :one
-- Backs the admin dashboard's pending queues (leave requests, exit
-- permits, late arrivals all share this table -- see the kind check
-- constraint).
select count(*)::bigint from workflow_instances
where tenant_id = $1 and kind = $2 and status = 'in_progress';

-- name: ExpireHangingWorkflowInstances :many
-- Bug fix vs. the old app (docs/02-system-design.md section 6.2 step 4):
-- any instance still in_progress past its opening day is force-closed so
-- it never blocks the next day's attendance. openedBefore is the instant
-- of local midnight for the tenant's timezone, computed by the caller so
-- this query stays timezone-agnostic.
update workflow_instances
set status = 'expired', closed_at = now()
where tenant_id = $1 and status = 'in_progress' and opened_at < $2
returning *;

-- name: MergeWorkflowInstancePayload :one
-- Shallow-merges extra into the instance's existing payload (jsonb ||),
-- e.g. attaching a late arrival review's opaque violation_ids list.
update workflow_instances
set payload = payload || $3
where tenant_id = $1 and id = $2
returning *;

-- name: ListWorkflowInstancesByClassAndKind :many
select * from workflow_instances
where tenant_id = $1 and kind = $2 and class_id = $3 and status = 'in_progress'
order by opened_at;
