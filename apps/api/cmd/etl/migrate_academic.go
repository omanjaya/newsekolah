package main

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
)

// classMigrationResult lets later steps (enrollments, teaching assignments,
// schedules) resolve a SION class id to the target class id.
type classMigrationResult struct {
	targetClassID uuid.UUID
	gradeLevelID  uuid.UUID
}

// migrateGradeLevelsAndClasses derives grade levels from SION class names
// (mapping.ParseGradeFromClassName; SION has no grade_levels table) and
// migrates classes keyed on (academic year, name), which is SION's own
// unique constraint on the classes table.
func (st *Store) migrateGradeLevelsAndClasses(
	ctx context.Context, tenantID, academicYearID uuid.UUID, classes []SionClass, classStat, gradeStat *TableStat,
) (map[string]classMigrationResult, error) {
	q := db.New(st.tx)
	gradeIDByCode := make(map[string]uuid.UUID)
	result := make(map[string]classMigrationResult, len(classes))

	for _, c := range classes {
		classStat.Read++
		code, sequence, ok := mapping.ParseGradeFromClassName(c.Name)
		if !ok {
			classStat.RecordFailure(c.ID, fmt.Sprintf("class name %q has no recognisable grade prefix", c.Name))
			continue
		}

		gradeLevelID, ok := gradeIDByCode[code]
		if !ok {
			id, created, err := st.ensureGradeLevel(ctx, q, tenantID, code, sequence)
			if err != nil {
				classStat.RecordFailure(c.ID, fmt.Sprintf("ensure grade level %s: %v", code, err))
				continue
			}
			gradeIDByCode[code] = id
			gradeLevelID = id
			gradeStat.Read++
			if created {
				gradeStat.Created++
			} else {
				gradeStat.Skipped++
			}
		}

		classID, created, err := st.selectID(ctx,
			`select id from classes where academic_year_id = $1 and name = $2`, academicYearID, c.Name)
		if err != nil {
			classStat.RecordFailure(c.ID, fmt.Sprintf("lookup class: %v", err))
			continue
		}
		if !created {
			created2, err := q.CreateClass(ctx, db.CreateClassParams{
				TenantID: tenantID, AcademicYearID: academicYearID, GradeLevelID: gradeLevelID, Name: c.Name,
			})
			if err != nil {
				classStat.RecordFailure(c.ID, fmt.Sprintf("create class: %v", err))
				continue
			}
			classID = created2.ID
			classStat.Created++
		} else {
			classStat.Skipped++
		}

		result[c.ID] = classMigrationResult{targetClassID: classID, gradeLevelID: gradeLevelID}
	}
	return result, nil
}

func (st *Store) ensureGradeLevel(ctx context.Context, q *db.Queries, tenantID uuid.UUID, code string, sequence int16) (uuid.UUID, bool, error) {
	id, found, err := st.selectID(ctx, `select id from grade_levels where tenant_id = $1 and code = $2`, tenantID, code)
	if err != nil {
		return uuid.Nil, false, err
	}
	if found {
		return id, false, nil
	}
	level, err := q.CreateGradeLevel(ctx, db.CreateGradeLevelParams{
		TenantID: tenantID, Code: code, Name: "Kelas " + code, Sequence: sequence,
	})
	if err != nil {
		return uuid.Nil, false, err
	}
	return level.ID, true, nil
}

// migrateSubjects keys on (tenant, code), where code is derived from the
// subject name (mapping.SlugCode) since SION identifies subjects by name
// only.
func (st *Store) migrateSubjects(ctx context.Context, tenantID uuid.UUID, subjects []SionSubject, stat *TableStat) (map[string]uuid.UUID, error) {
	result := make(map[string]uuid.UUID, len(subjects))
	for _, sub := range subjects {
		stat.Read++
		code := mapping.SlugCode(sub.Name, 20)
		id, created, err := st.upsertOne(ctx,
			`insert into subjects (tenant_id, code, name)
			 values ($1, $2, $3)
			 on conflict (tenant_id, code) do update set name = excluded.name
			 returning id, (xmax = 0)`,
			tenantID, code, mapping.CleanName(sub.Name),
		)
		if err != nil {
			stat.RecordFailure(sub.ID, fmt.Sprintf("upsert subject: %v", err))
			continue
		}
		if created {
			stat.Created++
		} else {
			stat.Updated++
		}
		result[sub.ID] = id
	}
	return result, nil
}

// migrateEnrollments keys on (academic year, student), matching SION's own
// `unique_student_class_year` constraint: at most one class per student per
// year on both sides.
func (st *Store) migrateEnrollments(
	ctx context.Context, tenantID, academicYearID uuid.UUID, academicYearStartsOn pgtype.Date,
	enrollments []SionEnrollment, users map[string]userMigrationResult, classes map[string]classMigrationResult,
	stat *TableStat,
) error {
	for _, e := range enrollments {
		stat.Read++
		student, ok := users[e.StudentUserID]
		if !ok {
			stat.RecordFailure(e.StudentUserID, "student not migrated (see identity table failures)")
			continue
		}
		class, ok := classes[e.ClassID]
		if !ok {
			stat.RecordFailure(e.StudentUserID, "class not migrated (see classes table failures)")
			continue
		}
		status := mapEnrollmentStatus(e.Status)
		joinedOn := nullDate(e.JoinedAt)
		if !joinedOn.Valid {
			// enrollments.joined_on is NOT NULL, but SION frequently leaves
			// joined_at blank; the academic year's own start date is the
			// least-wrong default and is noted as a gap by the caller.
			joinedOn = academicYearStartsOn
			stat.RecordGap(fmt.Sprintf("student %s: joined_at missing in SION, defaulted to academic year start", e.StudentUserID))
		}

		existingID, found, err := st.selectID(ctx,
			`select id from enrollments where academic_year_id = $1 and student_user_id = $2`,
			academicYearID, student.targetUserID)
		if err != nil {
			stat.RecordFailure(e.StudentUserID, fmt.Sprintf("lookup enrollment: %v", err))
			continue
		}

		if found {
			if err := st.execRow(ctx,
				`update enrollments set class_id = $1, status = $2, left_on = $3 where id = $4`,
				class.targetClassID, status, nullDate(e.LeftAt), existingID,
			); err != nil {
				stat.RecordFailure(e.StudentUserID, fmt.Sprintf("update enrollment: %v", err))
				continue
			}
			stat.Updated++
			continue
		}

		if err := st.execRow(ctx,
			`insert into enrollments (tenant_id, academic_year_id, student_user_id, class_id, status, joined_on, left_on)
			 values ($1, $2, $3, $4, $5, $6, $7)`,
			tenantID, academicYearID, student.targetUserID, class.targetClassID, status,
			joinedOn, nullDate(e.LeftAt),
		); err != nil {
			stat.RecordFailure(e.StudentUserID, fmt.Sprintf("create enrollment: %v", err))
			continue
		}
		stat.Created++
	}
	return nil
}

func mapEnrollmentStatus(sionStatus string) string {
	switch sionStatus {
	case "active", "moved", "graduated":
		return sionStatus
	case "inactive":
		return "left"
	default:
		return "active"
	}
}

// migrateTeachingAssignments keys on the target's own unique tuple
// (academic_year_id, teacher_user_id, subject_id, class_id), identical to
// SION's `unique_teacher_subject_class_year`.
func (st *Store) migrateTeachingAssignments(
	ctx context.Context, tenantID, academicYearID uuid.UUID,
	assignments []SionTeachingAssignment, users map[string]userMigrationResult, classes map[string]classMigrationResult,
	subjects map[string]uuid.UUID, stat *TableStat,
) error {
	for _, a := range assignments {
		stat.Read++
		teacher, ok := users[a.TeacherUserID]
		if !ok {
			stat.RecordFailure(a.TeacherUserID, "teacher not migrated (see identity table failures)")
			continue
		}
		class, ok := classes[a.ClassID]
		if !ok {
			stat.RecordFailure(a.TeacherUserID, "class not migrated (see classes table failures)")
			continue
		}
		subjectID, ok := subjects[a.SubjectID]
		if !ok {
			stat.RecordFailure(a.TeacherUserID, "subject not migrated (see subjects table failures)")
			continue
		}

		_, created, err := st.upsertOne(ctx,
			`insert into teaching_assignments (tenant_id, academic_year_id, teacher_user_id, subject_id, class_id, is_active)
			 values ($1, $2, $3, $4, $5, $6)
			 on conflict (academic_year_id, teacher_user_id, subject_id, class_id)
			 do update set is_active = excluded.is_active
			 returning id, (xmax = 0)`,
			tenantID, academicYearID, teacher.targetUserID, subjectID, class.targetClassID, a.IsActive,
		)
		if err != nil {
			stat.RecordFailure(a.TeacherUserID, fmt.Sprintf("upsert teaching assignment: %v", err))
			continue
		}
		if created {
			stat.Created++
		} else {
			stat.Updated++
		}
	}
	return nil
}
