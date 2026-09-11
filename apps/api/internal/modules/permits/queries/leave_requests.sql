-- name: CreateLeaveRequest :one
insert into leave_requests (
  instance_id, tenant_id, category, reason, starts_on, ends_on,
  student_name_snapshot, class_name_snapshot, guardian_name_snapshot
)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
returning *;

-- name: GetLeaveRequest :one
select * from leave_requests where tenant_id = $1 and instance_id = $2;

-- name: IssueLeaveRequest :one
update leave_requests set letter_number = $3, issued_at = $4, issued_by = $5
where tenant_id = $1 and instance_id = $2
returning *;

-- name: ListLeaveRequestsBySubject :many
select lr.*, wi.status, wi.opened_at, wi.current_stage_index
from leave_requests lr
join workflow_instances wi on wi.id = lr.instance_id
where lr.tenant_id = $1 and wi.subject_user_id = $2
order by wi.opened_at desc
limit $3 offset $4;

-- name: ListLeaveRequestsForReview :many
-- The reviewer's queue: in-progress requests from classes where the
-- caller is homeroom, or every class when the caller holds a school-scoped
-- reviewing duty (counselor, leadership). class_id narrows further.
--
-- Regression fix (docs/analysis/backend-inventory.md 1.14): a request only
-- shows up for a duty holder when it is actually AT that duty's stage --
-- the homeroom stage's approver_rule is "homeroom_of_student", the
-- counselor/leadership stage's is "duty:<slug>" (domain.DefaultStages) --
-- so a homeroom teacher no longer sees requests that already moved past
-- their stage to counselor, and vice versa.
--
-- sqlc.arg('today') is the tenant-local date (s.tenantNow), not
-- current_date: the Postgres session timezone is never set per tenant.
select lr.*, wi.status, wi.opened_at, wi.current_stage_index, wi.class_id, wi.subject_user_id
from leave_requests lr
join workflow_instances wi on wi.id = lr.instance_id
join workflow_definitions wd on wd.id = wi.definition_id
where lr.tenant_id = $1 and wi.status = 'in_progress'
  and (sqlc.narg('class_id')::uuid is null or wi.class_id = sqlc.narg('class_id')::uuid)
  and exists (
    select 1
    from duty_assignments da
    join duty_types dt on dt.id = da.duty_type_id
    where da.tenant_id = lr.tenant_id
      and da.academic_year_id = wi.academic_year_id
      and da.user_id = $2
      and da.is_active
      and dt.is_active
      and dt.deleted_at is null
      and da.starts_on <= sqlc.arg('today')::date
      and (da.ends_on is null or da.ends_on >= sqlc.arg('today')::date)
      and (
        (dt.slug = 'homeroom' and da.scope_class_id = wi.class_id
          and (wd.stages -> wi.current_stage_index ->> 'approver_rule') = 'homeroom_of_student')
        or (dt.scope_kind = 'school' and dt.slug in ('counselor', 'leadership')
          and (wd.stages -> wi.current_stage_index ->> 'approver_rule') = 'duty:' || dt.slug)
      )
  )
order by wi.opened_at;

-- name: CreateLeaveDocument :one
insert into leave_documents (tenant_id, leave_request_id, kind, asset_id, created_by)
values ($1, $2, $3, $4, $5)
on conflict (leave_request_id, kind) do update set asset_id = excluded.asset_id, created_by = excluded.created_by
returning *;

-- name: GetLeaveDocument :one
select * from leave_documents where tenant_id = $1 and leave_request_id = $2 and kind = $3;

-- name: ListLeaveDocuments :many
select * from leave_documents where tenant_id = $1 and leave_request_id = $2;

-- name: GetIssuedLeaveCoveringDate :one
-- attendance.Overrider: an issued letter forces the student's status for
-- every date it covers.
select lr.* from leave_requests lr
join workflow_instances wi on wi.id = lr.instance_id and wi.tenant_id = lr.tenant_id
where lr.tenant_id = $1 and wi.subject_user_id = $2 and lr.issued_at is not null
  and lr.starts_on <= $3 and lr.ends_on >= $3
order by lr.issued_at desc
limit 1;
