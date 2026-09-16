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
// duties) resolve a source class (groups.id) to the target class id.
type classMigrationResult struct {
	targetClassID uuid.UUID
	gradeLevelID  uuid.UUID
}

// migrateGradeLevelsAndClasses derives grade levels from source class names
// (mapping.ParseGradeFromClassName; the live schema has no grade_levels
// table) and migrates classes keyed on (academic year, name), matching the
// target's own unique constraint.
func (st *Store) migrateGradeLevelsAndClasses(
	ctx context.Context, tenantID, academicYearID uuid.UUID, classes []SionClass, classStat, gradeStat *TableStat,
) (map[int64]classMigrationResult, error) {
	q := db.New(st.tx)
	gradeIDByCode := make(map[string]uuid.UUID)
	result := make(map[int64]classMigrationResult, len(classes))

	for _, c := range classes {
		classStat.Read++
		code, sequence, ok := mapping.ParseGradeFromClassName(c.Name)
		if !ok {
			classStat.RecordFailure(fmt.Sprintf("%d", c.ID), fmt.Sprintf("class name %q has no recognisable grade prefix", c.Name))
			continue
		}

		gradeLevelID, ok := gradeIDByCode[code]
		if !ok {
			id, created, err := st.ensureGradeLevel(ctx, q, tenantID, code, sequence)
			if err != nil {
				classStat.RecordFailure(fmt.Sprintf("%d", c.ID), fmt.Sprintf("ensure grade level %s: %v", code, err))
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
			classStat.RecordFailure(fmt.Sprintf("%d", c.ID), fmt.Sprintf("lookup class: %v", err))
			continue
		}
		if !created {
			created2, err := q.CreateClass(ctx, db.CreateClassParams{
				TenantID: tenantID, AcademicYearID: academicYearID, GradeLevelID: gradeLevelID, Name: c.Name,
			})
			if err != nil {
				classStat.RecordFailure(fmt.Sprintf("%d", c.ID), fmt.Sprintf("create class: %v", err))
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
// subject name (mapping.SlugCode) since the source identifies subjects by
// name only. Subjects are global in the live schema, so this runs once per
// ETL run regardless of academic year, and stays idempotent through the
// upsert.
func (st *Store) migrateSubjects(ctx context.Context, tenantID uuid.UUID, subjects []SionSubject, stat *TableStat) (IDMap, error) {
	result := make(IDMap, len(subjects))
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
			stat.RecordFailure(fmt.Sprintf("%d", sub.ID), fmt.Sprintf("upsert subject: %v", err))
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

// migrateRooms mirrors migrateSubjects: keyed on (tenant, code), code
// derived from the room name, since the live schema identifies rooms by
// name only. Rooms are global. The live source currently has zero rooms, so
// this reports 0 read/created for that school -- still implemented for a
// school whose dump does have rooms.
func (st *Store) migrateRooms(ctx context.Context, tenantID uuid.UUID, rooms []SionRoom, stat *TableStat) (IDMap, error) {
	result := make(IDMap, len(rooms))
	for _, r := range rooms {
		stat.Read++
		code := mapping.SlugCode(r.Name, 20)
		id, created, err := st.upsertOne(ctx,
			`insert into rooms (tenant_id, code, name)
			 values ($1, $2, $3)
			 on conflict (tenant_id, code) do update set name = excluded.name
			 returning id, (xmax = 0)`,
			tenantID, code, mapping.CleanName(r.Name),
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", r.ID), fmt.Sprintf("upsert room: %v", err))
			continue
		}
		if created {
			stat.Created++
		} else {
			stat.Updated++
		}
		result[r.ID] = id
	}
	return result, nil
}

// migrateEnrollments handles the live schema's group_members, which has no
// status/joined_at/left_at column at all -- unlike the old SION-rewrite
// schema, this is not a sometimes-missing field, it is every row, so a
// single aggregate gap note covers the whole table instead of one gap line
// per student.
func (st *Store) migrateEnrollments(
	ctx context.Context, tenantID, academicYearID uuid.UUID, academicYearStartsOn pgtype.Date,
	enrollments []SionEnrollment, users map[int64]userMigrationResult, classes map[int64]classMigrationResult,
	stat *TableStat,
) error {
	defaulted := 0
	for _, e := range enrollments {
		stat.Read++
		student, ok := users[e.StudentUserID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", e.StudentUserID), "student not migrated (see identity table failures)")
			continue
		}
		class, ok := classes[e.ClassID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", e.StudentUserID), "class not migrated (see classes table failures)")
			continue
		}
		defaulted++

		existingID, found, err := st.selectID(ctx,
			`select id from enrollments where academic_year_id = $1 and student_user_id = $2`,
			academicYearID, student.targetUserID)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", e.StudentUserID), fmt.Sprintf("lookup enrollment: %v", err))
			continue
		}

		if found {
			if err := st.execRow(ctx,
				`update enrollments set class_id = $1, status = 'active', left_on = null where id = $2`,
				class.targetClassID, existingID,
			); err != nil {
				stat.RecordFailure(fmt.Sprintf("%d", e.StudentUserID), fmt.Sprintf("update enrollment: %v", err))
				continue
			}
			stat.Updated++
			continue
		}

		if err := st.execRow(ctx,
			`insert into enrollments (tenant_id, academic_year_id, student_user_id, class_id, status, joined_on, left_on)
			 values ($1, $2, $3, $4, 'active', $5, null)`,
			tenantID, academicYearID, student.targetUserID, class.targetClassID, academicYearStartsOn,
		); err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", e.StudentUserID), fmt.Sprintf("create enrollment: %v", err))
			continue
		}
		stat.Created++
	}
	if defaulted > 0 {
		stat.RecordGap(fmt.Sprintf(
			"group_members has no join/leave date or status column; %d enrollment(s) defaulted to active/%s/no end date",
			defaulted, academicYearStartsOn.Time.Format("2006-01-02"),
		))
	}
	return nil
}

// migrateTeachingAssignments keys on the target's own unique tuple
// (academic_year_id, teacher_user_id, subject_id, class_id). The live
// schema's teacher_classes has no is_active column -- every assignment is
// live. The returned IDMap resolves a source teacher_classes.id to the
// target teaching_assignments.id, for a later ETL pass that needs to
// resolve a teacher_class id the same way this pass resolves users/classes.
func (st *Store) migrateTeachingAssignments(
	ctx context.Context, tenantID, academicYearID uuid.UUID,
	assignments []SionTeachingAssignment, users map[int64]userMigrationResult, classes map[int64]classMigrationResult,
	subjects IDMap, stat *TableStat,
) (IDMap, error) {
	result := make(IDMap, len(assignments))
	for _, a := range assignments {
		stat.Read++
		teacher, ok := users[a.TeacherUserID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), "teacher not migrated (see identity table failures)")
			continue
		}
		class, ok := classes[a.ClassID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), "class not migrated (see classes table failures)")
			continue
		}
		subjectID, ok := subjects[a.SubjectID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), "subject not migrated (see subjects table failures)")
			continue
		}

		id, created, err := st.upsertOne(ctx,
			`insert into teaching_assignments (tenant_id, academic_year_id, teacher_user_id, subject_id, class_id, is_active)
			 values ($1, $2, $3, $4, $5, true)
			 on conflict (academic_year_id, teacher_user_id, subject_id, class_id)
			 do update set is_active = true
			 returning id, (xmax = 0)`,
			tenantID, academicYearID, teacher.targetUserID, subjectID, class.targetClassID,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), fmt.Sprintf("upsert teaching assignment: %v", err))
			continue
		}
		if created {
			stat.Created++
		} else {
			stat.Updated++
		}
		result[a.ID] = id
	}
	return result, nil
}
