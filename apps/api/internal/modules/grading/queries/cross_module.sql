-- name: GradingActiveTerm :one
-- cross-module read: terms is owned by the academic module.
select id, name from terms where tenant_id = $1 and academic_year_id = $2 and is_active limit 1;

-- name: GradingGetTerm :one
select id, academic_year_id, name, sequence from terms where tenant_id = $1 and id = $2;

-- name: GradingPreviousTerm :one
select id from terms where tenant_id = $1 and academic_year_id = $2 and sequence < $3 order by sequence desc limit 1;

-- name: GradingClassStudentIDs :many
-- cross-module read: enrollments is owned by the academic module.
select student_user_id from enrollments
where tenant_id = $1 and academic_year_id = $2 and class_id = $3 and status = 'active'
order by student_user_id;

-- name: GradingTeacherTeaches :one
-- cross-module read: teaching_assignments is owned by the academic module.
select exists (
  select 1 from teaching_assignments
  where tenant_id = $1 and academic_year_id = $2 and teacher_user_id = $3 and class_id = $4 and subject_id = $5 and is_active
)::bool as teaches;

-- name: GradingTeacherTeachesClass :one
-- Same as GradingTeacherTeaches without a specific subject, for endpoints
-- scoped to a whole class (the star ledger and class balances): true when
-- the teacher has any active assignment in this class.
select exists (
  select 1 from teaching_assignments
  where tenant_id = $1 and academic_year_id = $2 and teacher_user_id = $3 and class_id = $4 and is_active
)::bool as teaches;

-- name: GradingStudentClassID :one
select class_id from enrollments
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3 and status = 'active'
limit 1;

-- name: GradingGetLatestPolicy :one
select config, version from tenant_policies where tenant_id = $1 and kind = $2 order by version desc limit 1;

-- name: GradingCreatePolicy :exec
insert into tenant_policies (tenant_id, kind, version, config, effective_from, created_by)
values ($1, $2, $3, $4, $5, $6)
on conflict (tenant_id, kind, version) do nothing;

-- name: GradingStudentNames :many
select id, name from users where tenant_id = $1 and id = any(sqlc.arg(user_ids)::uuid[]);

-- name: GradingClassSubjects :many
-- cross-module read: teaching_assignments and subjects are owned by the
-- academic module. Used by the e-Rapor export to enumerate what a class is
-- taught in one term.
select distinct s.id, s.code, s.name
from teaching_assignments ta
join subjects s on s.id = ta.subject_id and s.tenant_id = ta.tenant_id
where ta.tenant_id = $1 and ta.academic_year_id = $2 and ta.class_id = $3 and ta.is_active
order by s.code;

-- name: GradingStudentNISNs :many
-- cross-module read: student_profiles is owned by the identity module.
-- NISN (Nomor Induk Siswa Nasional) is the key the current e-Rapor export
-- imports students by; NIS (Nomor Induk Siswa) is what the legacy
-- per-subject sheet keys rows on instead.
select u.id, u.name, coalesce(sp.nis, '') as nis, coalesce(sp.nisn, '') as nisn
from users u
left join student_profiles sp on sp.user_id = u.id and sp.tenant_id = u.tenant_id
where u.tenant_id = $1 and u.id = any(sqlc.arg(user_ids)::uuid[]);

-- name: GradingGetClassName :one
-- cross-module read: classes is owned by the academic module. The
-- gradebook export's class scope needs a name for its section/sheet.
select name from classes where tenant_id = $1 and id = $2;

-- name: GradingGetGradeLevelName :one
-- cross-module read: grade_levels is owned by the academic module. The
-- gradebook export's grade-level ("angkatan") scope needs a name for its
-- scope line.
select name from grade_levels where tenant_id = $1 and id = $2;

-- name: GradingListClassesByGradeLevel :many
-- cross-module read: classes is owned by the academic module. Every
-- non-deleted class of the academic year under a grade level, ordered by
-- name -- the gradebook export's grade-level scope: one section per class.
select id, name from classes
where tenant_id = $1 and academic_year_id = $2 and grade_level_id = $3 and deleted_at is null
order by name;

-- name: GradingGetSubjectName :one
-- cross-module read: subjects is owned by the academic module. The
-- gradebook export's scope line needs the subject's own name.
select name from subjects where tenant_id = $1 and id = $2;

-- name: GradingGetClassHomeroomTeacher :one
-- cross-module read: classes is owned by the academic module. The
-- gradebook export's per-class signature block prepends the class's
-- homeroom teacher ("Wali Kelas") ahead of the tenant's own default
-- signer, same as attendance/scheduling's exports.
select homeroom_teacher_id from classes where tenant_id = $1 and id = $2;

-- name: GradingGetUserName :one
-- cross-module read: users is owned by the identity module. Resolves the
-- homeroom teacher's display name for the gradebook export's signature
-- block.
select name from users where tenant_id = $1 and id = $2 and deleted_at is null;
