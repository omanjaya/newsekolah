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
select lr.*, wi.status, wi.opened_at, wi.current_stage_index, wi.class_id, wi.subject_user_id
from leave_requests lr
join workflow_instances wi on wi.id = lr.instance_id
where lr.tenant_id = $1 and wi.status = 'in_progress' and wi.class_id = $2
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
