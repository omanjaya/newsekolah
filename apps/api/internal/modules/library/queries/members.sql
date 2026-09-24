-- name: CreateMemberType :one
insert into library_member_types
  (tenant_id, name, max_loan_items, max_loan_days, renewal_days, max_renewals, fine_type, fine_per_tenor, tenor_days, suspend_days, validity_months, default_for_role)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, sqlc.narg(default_for_role)::text)
returning *;

-- name: UpdateMemberType :one
update library_member_types set
  name = $3, max_loan_items = $4, max_loan_days = $5, renewal_days = $6, max_renewals = $7,
  fine_type = $8, fine_per_tenor = $9, tenor_days = $10, suspend_days = $11, validity_months = $12,
  default_for_role = sqlc.narg(default_for_role)::text
where tenant_id = $1 and id = $2 and deleted_at is null
returning *;

-- name: DeleteMemberType :execrows
update library_member_types set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: GetMemberType :one
select * from library_member_types where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: GetMemberTypeByRole :one
select * from library_member_types where tenant_id = $1 and default_for_role = $2 and deleted_at is null limit 1;

-- name: ListMemberTypes :many
select * from library_member_types where tenant_id = $1 and deleted_at is null order by name;

-- name: CountMembersByType :one
select count(*)::int from library_members where tenant_id = $1 and member_type_id = $2;

-- name: CreateMember :one
insert into library_members (user_id, tenant_id, member_no, member_type_id, registered_on, valid_until, status, notes)
values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: GetMember :one
select * from library_members where tenant_id = $1 and user_id = $2;

-- name: GetMemberByNo :one
select * from library_members where tenant_id = $1 and member_no = $2;

-- name: ListMembers :many
select m.* from library_members m
join users u on u.id = m.user_id
where m.tenant_id = $1
  and (sqlc.narg(status)::text is null or m.status = sqlc.narg(status)::text)
  and (sqlc.narg(member_type_id)::uuid is null or m.member_type_id = sqlc.narg(member_type_id)::uuid)
  and (sqlc.narg(search)::text is null
    or lower(u.name) like '%' || lower(sqlc.narg(search)::text) || '%'
    or lower(m.member_no) like '%' || lower(sqlc.narg(search)::text) || '%')
order by u.name
limit $2 offset $3;

-- name: GetMembersByIDs :many
-- Bulk card printing's explicit member-ids mode (order is applied by the
-- caller, same as GetCopiesByIDs for copy labels).
select * from library_members where tenant_id = $1 and user_id = any(sqlc.arg(ids)::uuid[]);

-- name: ListMembersForCardPrint :many
-- Bulk card printing's member-type/class mode: members of one type
-- and/or currently enrolled (active) in one class, up to limit rows,
-- ordered by name.
select m.* from library_members m
join users u on u.id = m.user_id
where m.tenant_id = $1
  and (sqlc.narg(member_type_id)::uuid is null or m.member_type_id = sqlc.narg(member_type_id)::uuid)
  and (
    sqlc.narg(class_id)::uuid is null
    or exists (
      select 1 from enrollments e
      where e.tenant_id = m.tenant_id and e.student_user_id = m.user_id and e.status = 'active' and e.class_id = sqlc.narg(class_id)::uuid
    )
  )
order by u.name
limit $2;

-- name: UpdateMemberStatus :one
update library_members set status = $3, suspended_until = $4 where tenant_id = $1 and user_id = $2 returning *;

-- name: UpdateMemberProfile :one
update library_members set member_type_id = $3, valid_until = $4, notes = $5
where tenant_id = $1 and user_id = $2
returning *;

-- name: IncrementLateReturnCount :one
update library_members set late_return_count = late_return_count + 1 where tenant_id = $1 and user_id = $2 returning *;

-- name: CountActiveLoansAndUnpaidFinesForClearance :one
select
  (select count(*) from library_loans ll where ll.tenant_id = $1 and ll.member_user_id = $2 and ll.status = 'active')::int as active_loans,
  (select count(*) from library_violations lv where lv.tenant_id = $1 and lv.member_user_id = $2 and lv.status = 'unpaid')::int as unpaid_violations;

-- name: ListLibraryMemberCandidates :many
-- Users of one role (student|teacher|staff|parent) not yet registered as a
-- library member, optionally narrowed to one class (role must be student
-- when class_id is set) -- the bulk-register candidate list (old app
-- library_members.go:783-859).
select u.id as user_id, u.name as user_name
from users u
join user_profiles up on up.user_id = u.id and up.kind = $2
where u.tenant_id = $1 and u.deleted_at is null
  and not exists (select 1 from library_members lm where lm.tenant_id = u.tenant_id and lm.user_id = u.id)
  and (
    sqlc.narg(class_id)::uuid is null
    or exists (
      select 1 from enrollments e
      where e.tenant_id = u.tenant_id and e.student_user_id = u.id and e.status = 'active' and e.class_id = sqlc.narg(class_id)::uuid
    )
  )
order by u.name;
