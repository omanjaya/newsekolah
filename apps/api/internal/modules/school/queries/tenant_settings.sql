-- name: ListTenantSettingsByPrefix :many
select * from tenant_settings where tenant_id = $1 and key like $2 order by key;

-- name: UpsertTenantSetting :exec
insert into tenant_settings (tenant_id, key, value, updated_by)
values ($1, $2, $3, $4)
on conflict (tenant_id, key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

-- name: GetPlatformSetting :one
select value from platform_settings where key = $1;

-- name: SetupCounts :one
-- One round trip for the onboarding checklist: how much of the school's
-- master data exists. Every count is scoped to the active academic year
-- where the table has one.
select
  (select count(*) from academic_years ay where ay.tenant_id = $1)::int as academic_years,
  (select count(*) from terms t where t.tenant_id = $1 and t.academic_year_id = sqlc.narg(year_id)::uuid)::int as terms,
  (select count(*) from grade_levels gl where gl.tenant_id = $1)::int as grade_levels,
  (select count(*) from classes c where c.tenant_id = $1 and c.academic_year_id = sqlc.narg(year_id)::uuid)::int as classes,
  (select count(*) from subjects s where s.tenant_id = $1 and s.deleted_at is null)::int as subjects,
  (select count(*) from period_templates pt where pt.tenant_id = $1)::int as period_templates,
  (select count(*) from periods p where p.tenant_id = $1)::int as periods,
  (select count(*) from school_days sd where sd.tenant_id = $1 and sd.academic_year_id = sqlc.narg(year_id)::uuid and sd.is_active)::int as school_days,
  (select count(*) from users u join user_profiles up on up.user_id = u.id
     where u.tenant_id = $1 and u.deleted_at is null and up.kind = 'teacher')::int as teachers,
  (select count(*) from users u join user_profiles up on up.user_id = u.id
     where u.tenant_id = $1 and u.deleted_at is null and up.kind = 'student')::int as students,
  (select count(*) from enrollments e where e.tenant_id = $1 and e.academic_year_id = sqlc.narg(year_id)::uuid and e.status = 'active')::int as enrollments,
  (select count(*) from teaching_assignments ta where ta.tenant_id = $1 and ta.academic_year_id = sqlc.narg(year_id)::uuid and ta.is_active)::int as teaching_assignments,
  (select count(*) from schedules sc where sc.tenant_id = $1 and sc.academic_year_id = sqlc.narg(year_id)::uuid)::int as schedules,
  (select count(*) from duty_assignments da where da.tenant_id = $1 and da.academic_year_id = sqlc.narg(year_id)::uuid and da.is_active)::int as duty_assignments;

-- name: UpdateTenantProfile :one
update tenants set name = $2, education_level = $3, timezone = $4, locale = $5
where id = $1
returning *;
