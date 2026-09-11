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

-- name: ListExitPermitsForApproval :many
-- Missing feature (docs/analysis/backend-inventory.md 1.15): a queue for
-- the counselor/leadership approval stages (the duty_teacher/class_teacher
-- stages are QR-scan only, same as the old app -- no listing needed there)
-- plus security, who see every 'approved' permit awaiting their gate scan.
-- sqlc.arg('today') is the tenant-local date (s.tenantNow), not
-- current_date: the Postgres session timezone is never set per tenant.
select ep.*, wi.status, wi.opened_at, wi.current_stage_index, wi.class_id, wi.subject_user_id
from exit_permits ep
join workflow_instances wi on wi.id = ep.instance_id
join workflow_definitions wd on wd.id = wi.definition_id
where ep.tenant_id = $1
  and wi.status in ('in_progress', 'approved')
  and (
    (
      wi.status = 'approved'
      and (
        exists (
          select 1 from user_roles ur
          join role_permissions rp on rp.role_id = ur.role_id
          where ur.tenant_id = $1 and ur.user_id = $2 and rp.permission_code = 'scan_exit_permits'
        )
        or exists (
          select 1
          from duty_assignments da
          join duty_types dt on dt.id = da.duty_type_id
          join duty_permissions dp on dp.duty_type_id = dt.id
          where da.tenant_id = $1
            and da.academic_year_id = wi.academic_year_id
            and da.user_id = $2
            and dp.permission_code = 'scan_exit_permits'
            and da.is_active and dt.is_active and dt.deleted_at is null
            and da.starts_on <= sqlc.arg('today')::date and (da.ends_on is null or da.ends_on >= sqlc.arg('today')::date)
        )
      )
    )
    or (
      wi.status = 'in_progress'
      and exists (
        select 1
        from duty_assignments da
        join duty_types dt on dt.id = da.duty_type_id
        where da.tenant_id = $1
          and da.academic_year_id = wi.academic_year_id
          and da.user_id = $2
          and da.is_active and dt.is_active and dt.deleted_at is null
          and da.starts_on <= sqlc.arg('today')::date and (da.ends_on is null or da.ends_on >= sqlc.arg('today')::date)
          and dt.scope_kind = 'school'
          and dt.slug in ('counselor', 'leadership')
          and (wd.stages -> wi.current_stage_index ->> 'approver_rule') = 'duty:' || dt.slug
      )
    )
  )
order by wi.opened_at;

-- name: ListExitPermitsForReport :many
select ep.*, wi.status, wi.opened_at, wi.closed_at, wi.academic_year_id
from exit_permits ep
join workflow_instances wi on wi.id = ep.instance_id
where ep.tenant_id = $1
  and wi.academic_year_id = $2
  and wi.opened_at >= $3
  and wi.opened_at < $4
order by wi.opened_at desc;
