-- name: LinkParentStudent :one
insert into parent_students (parent_user_id, student_user_id, tenant_id, relation, can_approve_leave)
values ($1, $2, $3, $4, $5)
on conflict (parent_user_id, student_user_id) do update set relation = excluded.relation, can_approve_leave = excluded.can_approve_leave
returning *;

-- name: UnlinkParentStudent :exec
delete from parent_students where tenant_id = $1 and parent_user_id = $2 and student_user_id = $3;

-- name: ListChildrenForParent :many
select ps.student_user_id, ps.relation, ps.can_approve_leave, u.name as student_name,
  coalesce(c.name, '') as class_name, c.id as class_id
from parent_students ps
join users u on u.id = ps.student_user_id and u.deleted_at is null
left join enrollments e on e.student_user_id = ps.student_user_id and e.status = 'active'
  and e.academic_year_id = sqlc.narg(year_id)::uuid
left join classes c on c.id = e.class_id
where ps.tenant_id = $1 and ps.parent_user_id = $2
order by u.name;

-- name: ListParentsForStudent :many
select ps.parent_user_id, ps.relation, ps.can_approve_leave, u.name as parent_name, u.phone
from parent_students ps
join users u on u.id = ps.parent_user_id and u.deleted_at is null
where ps.tenant_id = $1 and ps.student_user_id = $2
order by u.name;

-- name: IsParentOfStudent :one
select exists (
  select 1 from parent_students
  where tenant_id = $1 and parent_user_id = $2 and student_user_id = $3
)::bool as is_parent;

-- name: GetActiveClassForStudent :one
select c.id as class_id, c.name as class_name
from enrollments e
join classes c on c.id = e.class_id and c.deleted_at is null
where e.tenant_id = $1 and e.student_user_id = $2 and e.academic_year_id = $3 and e.status = 'active'
limit 1;
