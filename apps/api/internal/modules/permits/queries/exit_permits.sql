-- name: CreateExitPermit :one
insert into exit_permits (
  instance_id, tenant_id, destination, start_period_id, end_period_id, student_name_snapshot, class_name_snapshot,
  return_required
)
values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: GetExitPermit :one
select * from exit_permits where tenant_id = $1 and instance_id = $2;

-- name: ListExitPermitsByInstances :many
-- The permit rows of a page of a student's own exit permit instances.
select * from exit_permits
where tenant_id = $1 and instance_id = any(sqlc.arg('instance_ids')::uuid[]);

-- name: MarkExitPermitIssued :one
update exit_permits set issued_at = $3
where tenant_id = $1 and instance_id = $2
returning *;

-- name: SetExitPermitGateToken :one
update exit_permits set gate_token_id = $3
where tenant_id = $1 and instance_id = $2
returning *;

-- name: MarkExitPermitExited :one
-- expected_return_at is null for a permit that needs no return.
update exit_permits set exited_at = $3, security_user_id = $4,
  expected_return_at = sqlc.narg('expected_return_at')
where tenant_id = $1 and instance_id = $2
returning *;

-- name: MarkExitPermitReturned :one
-- Records the student back through the gate. Only a permit that exited,
-- expects a return and has none yet matches, so a second record (or a
-- concurrent one) finds no row instead of moving the time.
update exit_permits set returned_at = $3, return_security_user_id = $4
where tenant_id = $1 and instance_id = $2
  and exited_at is not null and return_required and returned_at is null
returning *;

-- name: ListExitPermitsAwaitingReturn :many
-- The gate's "not back yet" list: permits that went through the gate on
-- the tenant-local day sqlc.arg('today') (workflow_instances.local_date,
-- the day the permit was opened, which is the exit day) and whose student
-- has not been recorded back. The earliest due return first.
select ep.*, wi.subject_user_id, wi.class_id
from exit_permits ep
join workflow_instances wi on wi.id = ep.instance_id
where ep.tenant_id = $1
  and wi.local_date = sqlc.arg('today')::date
  and ep.exited_at is not null
  and ep.return_required
  and ep.returned_at is null
order by ep.expected_return_at nulls last, ep.exited_at;

-- name: ListExitPermitsForApproval :many
-- Missing feature (docs/analysis/backend-inventory.md 1.15): a queue for
-- the counselor/leadership approval stages (the duty_teacher/class_teacher
-- stages are QR-scan only, same as the old app -- no listing needed there)
-- plus security, who see every 'approved' permit awaiting their gate scan.
-- sqlc.arg('today') is the tenant-local date (s.tenantNow), not
-- current_date: the Postgres session timezone is never set per tenant.
-- current_stage is null once every stage has passed (an approved permit
-- waiting at the gate): the index is then past the last stage.
select ep.*, wi.status, wi.opened_at, wi.current_stage_index, wi.class_id, wi.subject_user_id,
  (wd.stages -> wi.current_stage_index)::jsonb as current_stage
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
-- The year's dates are the school's calendar days, so they are compared
-- with local_date (the tenant-local day the permit was opened), not with
-- opened_at: midnight UTC would cut the first hours of a UTC+7 school's
-- first day off the report and add the first hours after its last day.
select ep.*, wi.status, wi.opened_at, wi.closed_at, wi.academic_year_id
from exit_permits ep
join workflow_instances wi on wi.id = ep.instance_id
where ep.tenant_id = $1
  and wi.academic_year_id = $2
  and wi.local_date >= sqlc.arg('starts_on')::date
  and wi.local_date <= sqlc.arg('ends_on')::date
order by wi.opened_at desc;

-- name: CountExitPermitsForApproval :one
-- Size of ListExitPermitsForApproval's queue for the same caller. Keep the
-- where clause identical to that query: the inbox badge must match the list.
select count(*)::int as total
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
  );
