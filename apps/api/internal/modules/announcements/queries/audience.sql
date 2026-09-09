-- name: ListActiveUserIDsForTenant :many
-- cross-module read: users table is owned by the identity module.
select id from users where tenant_id = $1 and status = 'active' and deleted_at is null;

-- name: ListUserIDsByRoleSlugs :many
-- cross-module read: roles/user_roles tables are owned by the identity module.
select distinct ur.user_id
from user_roles ur
join roles r on r.id = ur.role_id
where ur.tenant_id = $1 and r.slug = any(sqlc.arg(role_slugs)::text[]);

-- name: ListActiveStudentUserIDsByClasses :many
-- cross-module read: classes/enrollments tables are owned by the academic
-- module. Not yet migrated in this branch; type-checked here against
-- schema_stub/cross_module.sql (see that file's header) and safe to run
-- once the real tables exist post-merge -- same shape.
select distinct student_user_id
from enrollments
where tenant_id = $1 and status = 'active' and class_id = any(sqlc.arg(class_ids)::uuid[]);

-- name: ValidateUserIDsBelongToTenant :many
-- cross-module read: users table is owned by the identity module.
select id from users where tenant_id = $1 and id = any(sqlc.arg(user_ids)::uuid[]) and deleted_at is null;

-- name: ListRoleSlugsForUser :many
-- cross-module read: roles/user_roles tables are owned by the identity module.
-- Used to decide whether a role-targeted announcement is visible to a user.
select r.slug
from user_roles ur
join roles r on r.id = ur.role_id
where ur.tenant_id = $1 and ur.user_id = $2;

-- name: ListActiveClassIDsForStudent :many
-- cross-module read: enrollments is owned by the academic module.
select class_id from enrollments
where tenant_id = $1 and student_user_id = $2 and status = 'active';
