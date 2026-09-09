-- name: ListStudentNISNs :many
-- Every non-blank NISN this tenant already has, with the user_id it
-- belongs to. The Dapodik importer uses this single round trip to decide,
-- for every row in the uploaded file, whether it is a new student
-- (create) or one already on file (update) -- matching student_profiles'
-- own unique(tenant_id, nisn) constraint.
select nisn, user_id
from student_profiles
where tenant_id = $1 and nisn is not null and nisn <> '';

-- name: CreateDapodikImportBatch :one
insert into dapodik_import_batches (tenant_id, row_count, created_count, updated_count, error_count, created_by)
values ($1, $2, $3, $4, $5, $6)
returning *;
