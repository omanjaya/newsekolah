-- name: CreateExitPermit :one
insert into exit_permits (
  instance_id, tenant_id, destination, start_period_id, end_period_id, student_name_snapshot, class_name_snapshot
)
values ($1, $2, $3, $4, $5, $6, $7)
returning *;

-- name: GetExitPermit :one
select * from exit_permits where tenant_id = $1 and instance_id = $2;

-- name: MarkExitPermitIssued :one
update exit_permits set issued_at = $3
where tenant_id = $1 and instance_id = $2
returning *;

-- name: SetExitPermitGateToken :one
update exit_permits set gate_token_id = $3
where tenant_id = $1 and instance_id = $2
returning *;

-- name: MarkExitPermitExited :one
update exit_permits set exited_at = $3, security_user_id = $4
where tenant_id = $1 and instance_id = $2
returning *;

-- name: ListExitPermitsForReport :many
select ep.*, wi.status, wi.opened_at, wi.closed_at, wi.academic_year_id
from exit_permits ep
join workflow_instances wi on wi.id = ep.instance_id
where ep.tenant_id = $1
  and wi.academic_year_id = $2
  and wi.opened_at >= $3
  and wi.opened_at < $4
order by wi.opened_at desc;
