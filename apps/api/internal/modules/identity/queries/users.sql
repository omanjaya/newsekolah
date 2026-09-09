-- name: GetUserByUsername :one
select * from users where tenant_id = $1 and username = $2 and deleted_at is null;

-- name: GetUserByID :one
select * from users where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: UpdateUserPassword :exec
update users set password_hash = $3, must_change_password = $4 where tenant_id = $1 and id = $2;

-- name: UpdateUserLastLogin :exec
update users set last_login_at = $3 where tenant_id = $1 and id = $2;

-- name: CreateUser :one
insert into users (tenant_id, username, email, phone, password_hash, name, status, must_change_password, locale)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
returning *;

-- name: CreateUserProfile :exec
insert into user_profiles (user_id, tenant_id, kind)
values ($1, $2, $3);
