-- name: AcademicCreateGradeLevel :one
insert into grade_levels (tenant_id, code, name, sequence)
values ($1, $2, $3, $4)
returning *;

-- name: AcademicApplyGradeLevelTemplateRow :one
insert into grade_levels (tenant_id, code, name, sequence)
values ($1, $2, $3, $4)
on conflict (tenant_id, code) do nothing
returning *;

-- name: AcademicUpdateGradeLevel :one
update grade_levels set code = $3, name = $4, sequence = $5
where tenant_id = $1 and id = $2
returning *;

-- name: AcademicGetGradeLevelByID :one
select * from grade_levels where tenant_id = $1 and id = $2;

-- name: AcademicListGradeLevels :many
select * from grade_levels where tenant_id = $1 order by sequence;

-- name: AcademicDeleteGradeLevel :exec
delete from grade_levels where tenant_id = $1 and id = $2;

-- name: AcademicCountClassesForGradeLevel :one
select count(*) from classes where tenant_id = $1 and grade_level_id = $2 and deleted_at is null;

-- name: AcademicCreateTrack :one
insert into tracks (tenant_id, code, name)
values ($1, $2, $3)
returning *;

-- name: AcademicUpdateTrack :one
update tracks set code = $3, name = $4
where tenant_id = $1 and id = $2
returning *;

-- name: AcademicGetTrackByID :one
select * from tracks where tenant_id = $1 and id = $2;

-- name: AcademicListTracks :many
select * from tracks where tenant_id = $1 order by name;

-- name: AcademicDeleteTrack :exec
delete from tracks where tenant_id = $1 and id = $2;

-- name: AcademicCountClassesForTrack :one
select count(*) from classes where tenant_id = $1 and track_id = $2 and deleted_at is null;
