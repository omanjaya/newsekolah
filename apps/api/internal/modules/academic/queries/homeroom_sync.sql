-- Cross-module writes onto duty_types/duty_assignments (owned by the
-- identity module): the class record's homeroom_teacher_id and the
-- "homeroom" duty assignment for that class must always agree, so setting
-- one from academic's side (editing a class) writes the other in the same
-- transaction, mirroring identity's own UpdateClassHomeroomTeacher, which
-- does the reverse write onto classes.

-- name: AcademicFindHomeroomDutyTypeID :one
select id from duty_types where tenant_id = $1 and slug = 'homeroom' and deleted_at is null limit 1;

-- name: AcademicEndActiveHomeroomAssignments :exec
-- Ends every active homeroom assignment of the class, not just one, so a
-- class left with two holders by older code heals on the next edit.
update duty_assignments set is_active = false, ends_on = coalesce(ends_on, sqlc.arg(ends_on)::date)
where tenant_id = $1 and academic_year_id = $2 and duty_type_id = $3 and scope_class_id = $4 and is_active;

-- name: AcademicTeacherIsHomeroomOfOtherClass :one
-- Whether the teacher already holds the homeroom duty for another class
-- this year: a teacher is homeroom of one class at a time.
select exists(
  select 1 from duty_assignments
  where tenant_id = $1 and academic_year_id = $2 and duty_type_id = $3 and user_id = $4 and is_active
    and scope_class_id is not null and scope_class_id <> sqlc.arg(class_id)::uuid
);

-- name: AcademicCreateHomeroomAssignment :exec
insert into duty_assignments (tenant_id, academic_year_id, duty_type_id, user_id, scope_class_id, starts_on)
values ($1, $2, $3, $4, $5, $6);
