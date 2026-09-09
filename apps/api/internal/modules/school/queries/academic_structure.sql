-- name: CreateGradeLevel :one
insert into grade_levels (tenant_id, code, name, sequence)
values ($1, $2, $3, $4)
returning *;

-- name: CreateClass :one
insert into classes (tenant_id, academic_year_id, grade_level_id, name, capacity)
values ($1, $2, $3, $4, $5)
returning *;
