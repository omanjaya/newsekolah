-- name: AcademicCreateEnrollment :one
insert into enrollments (tenant_id, academic_year_id, student_user_id, class_id, status, joined_on)
values ($1, $2, $3, $4, 'active', $5)
returning *;

-- name: AcademicGetActiveEnrollment :one
select * from enrollments
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3 and status = 'active';

-- name: AcademicGetEnrollmentByID :one
select * from enrollments where tenant_id = $1 and id = $2;

-- name: AcademicCloseEnrollment :one
update enrollments
set status = $3, left_on = $4
where tenant_id = $1 and id = $2
returning *;

-- name: AcademicListEnrollmentsByClass :many
select sqlc.embed(enrollments), count(*) over () as total_count
from enrollments
where tenant_id = $1 and class_id = $2 and status = 'active'
order by joined_on
limit $3 offset $4;

-- name: AcademicListEnrollmentsByYear :many
select * from enrollments where tenant_id = $1 and academic_year_id = $2 and status = 'active';

-- name: AcademicListEnrollmentsByYearAndGradeLevel :many
-- Joins classes to scope active enrollments to one grade level, for
-- promotion planning: candidates are every actively-enrolled student in
-- that grade for the source academic year.
select e.*
from enrollments e
join classes c on c.id = e.class_id
where e.tenant_id = $1 and e.academic_year_id = $2 and c.grade_level_id = $3 and e.status = 'active';

-- name: AcademicListPromotionCandidates :many
-- Every actively-enrolled student in the source academic year, with the
-- grade level and track their current class carries -- everything
-- domain.BuildPromotionPlan needs, in one round trip.
select
  e.id as enrollment_id,
  e.student_user_id,
  e.class_id as from_class_id,
  c.grade_level_id,
  gl.sequence as grade_sequence,
  c.track_id
from enrollments e
join classes c on c.id = e.class_id
join grade_levels gl on gl.id = c.grade_level_id
where e.tenant_id = $1 and e.academic_year_id = $2 and e.status = 'active';

-- name: AcademicListClassesForYear :many
-- Every class in one academic year (no pagination, no search): used to
-- build the promotion planner's destination-year target list.
select id, grade_level_id, track_id
from classes
where tenant_id = $1 and academic_year_id = $2 and deleted_at is null;
