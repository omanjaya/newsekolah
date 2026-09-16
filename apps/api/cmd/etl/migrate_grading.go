package main

import (
	"context"
	"fmt"
	"sort"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/cmd/etl/mapping"
)

// componentKey identifies one target assessment_component by the source
// (learning_objective, class) pair it was derived from -- see
// migrateAssessmentComponents' doc comment for why a class is needed at
// all, when learning_objectives itself carries none.
func componentKey(learningObjectiveID, classID int64) string {
	return fmt.Sprintf("%d|%d", learningObjectiveID, classID)
}

// migrateAssessmentComponents derives one target assessment_component per
// distinct (learning_objective, class) pair actually graded (grades.group_id
// is the only place a learning objective and a class are connected in the
// live schema; learning_objectives itself is shared across every class a
// teacher teaches that subject to). Keyed on the target's own unique
// (academic_year_id, term_id, class_id, subject_id, code).
func (st *Store) migrateAssessmentComponents(
	ctx context.Context, tenantID, academicYearID, termID uuid.UUID, grades []SionGrade,
	learningObjectives map[int64]SionLearningObjective, users map[int64]userMigrationResult,
	classes map[int64]classMigrationResult, subjects IDMap, stat *TableStat,
) (map[string]uuid.UUID, error) {
	type pair struct{ loID, classID int64 }
	seen := make(map[pair]bool)
	var ordered []pair
	for _, g := range grades {
		p := pair{g.LearningObjectiveID, g.ClassID}
		if !seen[p] {
			seen[p] = true
			ordered = append(ordered, p)
		}
	}
	sort.Slice(ordered, func(i, j int) bool {
		if ordered[i].loID != ordered[j].loID {
			return ordered[i].loID < ordered[j].loID
		}
		return ordered[i].classID < ordered[j].classID
	})

	result := make(map[string]uuid.UUID, len(ordered))
	for _, p := range ordered {
		stat.Read++
		lo, ok := learningObjectives[p.loID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d/%d", p.loID, p.classID), "learning objective not found in source (outside the migrated year)")
			continue
		}
		class, ok := classes[p.classID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d/%d", p.loID, p.classID), "class not migrated (see classes table failures)")
			continue
		}
		subjectID, ok := subjects[lo.SubjectID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d/%d", p.loID, p.classID), "subject not migrated (see subjects table failures)")
			continue
		}
		if !lo.TeacherID.Valid {
			stat.RecordFailure(fmt.Sprintf("%d/%d", p.loID, p.classID), "learning objective has no teacher recorded")
			continue
		}
		teacher, ok := users[lo.TeacherID.Int64]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d/%d", p.loID, p.classID), "teacher not migrated (see identity table failures)")
			continue
		}

		var kktp any
		if lo.KKTP.Valid {
			kktp = float64(lo.KKTP.Int64)
		}

		id, created, err := st.upsertOne(ctx,
			`insert into assessment_components (
			   tenant_id, academic_year_id, term_id, teacher_user_id, class_id, subject_id,
			   code, kind, description, kktp, weight, sequence
			 ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			 on conflict (academic_year_id, term_id, class_id, subject_id, code) do update set
			   kind = excluded.kind, description = excluded.description, kktp = excluded.kktp,
			   weight = excluded.weight, sequence = excluded.sequence
			 returning id, (xmax = 0)`,
			tenantID, academicYearID, termID, teacher.targetUserID, class.targetClassID, subjectID,
			lo.Code, mapping.MapAssessmentKind(lo.Type), mapping.CleanName(lo.Description), kktp, lo.Weight, toSequence(lo.SortOrder),
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d/%d", p.loID, p.classID), fmt.Sprintf("upsert assessment component: %v", err))
			continue
		}
		if created {
			stat.Created++
		} else {
			stat.Updated++
		}
		result[componentKey(p.loID, p.classID)] = id
	}
	return result, nil
}

// migrateGrades migrates grades to the target's grades table, keyed on
// (component_id, student_user_id). A row whose score is null in the source
// (score is nullable there, ungraded) is reported and skipped, since the
// target column is not null.
func (st *Store) migrateGrades(
	ctx context.Context, tenantID uuid.UUID, grades []SionGrade, components map[string]uuid.UUID,
	learningObjectives map[int64]SionLearningObjective, users map[int64]userMigrationResult, stat *TableStat,
) error {
	for _, g := range grades {
		stat.Read++
		componentID, ok := components[componentKey(g.LearningObjectiveID, g.ClassID)]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", g.ID), "assessment component not migrated (see assessment_components table failures)")
			continue
		}
		student, ok := users[g.StudentID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", g.ID), "student not migrated (see identity table failures)")
			continue
		}
		if !g.Score.Valid {
			stat.RecordFailure(fmt.Sprintf("%d", g.ID), "score is null in source (ungraded)")
			continue
		}
		recorderSourceID := g.TeacherID
		if !recorderSourceID.Valid {
			if lo, ok := learningObjectives[g.LearningObjectiveID]; ok {
				recorderSourceID = lo.TeacherID
			}
		}
		var recordedBy uuid.NullUUID
		if recorderSourceID.Valid {
			if recorder, ok := users[recorderSourceID.Int64]; ok {
				recordedBy = uuid.NullUUID{UUID: recorder.targetUserID, Valid: true}
			}
		}

		_, created, err := st.upsertOne(ctx,
			`insert into grades (tenant_id, component_id, student_user_id, score, recorded_by)
			 values ($1, $2, $3, $4, $5)
			 on conflict (component_id, student_user_id) do update set score = excluded.score, recorded_by = excluded.recorded_by
			 returning id, (xmax = 0)`,
			tenantID, componentID, student.targetUserID, g.Score.Float64, recordedBy,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", g.ID), fmt.Sprintf("upsert grade: %v", err))
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

// indexPreviousGrades builds a (class, subject, student) -> score lookup
// from previous_grades, keyed by source ids so migrateReportScores can look
// a student's carried-forward score up while it still has the source row
// on hand.
func indexPreviousGrades(rows []SionPreviousGrade) map[string]float64 {
	out := make(map[string]float64, len(rows))
	for _, r := range rows {
		out[fmt.Sprintf("%d|%d|%d", r.ClassID, r.SubjectID, r.StudentID)] = r.Score
	}
	return out
}

// migrateReportScores migrates report_scores to the target's report_scores,
// keyed on its own (academic_year_id, term_id, class_id, subject_id,
// student_user_id) unique constraint. The target's automatic_score has no
// direct source equivalent (the old app computed and stored only the
// manual override, report_scores.manual_final_score); this ETL recomputes
// it as the plain average of that student's already-migrated grades within
// the same class/subject/term, which is the same set of numbers the old
// report_scores.manual_final_score would have overridden. final_score
// prefers the manual override, falling back to that average, matching
// migration 0077's own automatic/manual split.
func (st *Store) migrateReportScores(
	ctx context.Context, tenantID, academicYearID, termID uuid.UUID, reportScores []SionReportScore,
	previousGrades map[string]float64, users map[int64]userMigrationResult,
	classes map[int64]classMigrationResult, subjects IDMap, stat *TableStat,
) error {
	for _, r := range reportScores {
		stat.Read++
		student, ok := users[r.StudentID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", r.ID), "student not migrated (see identity table failures)")
			continue
		}
		class, ok := classes[r.ClassID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", r.ID), "class not migrated (see classes table failures)")
			continue
		}
		subjectID, ok := subjects[r.SubjectID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", r.ID), "subject not migrated (see subjects table failures)")
			continue
		}

		var avgScore pgtype.Float8
		if err := st.tx.QueryRow(ctx,
			`select avg(g.score) from grades g
			 join assessment_components ac on ac.id = g.component_id
			 where ac.term_id = $1 and ac.class_id = $2 and ac.subject_id = $3 and g.student_user_id = $4`,
			termID, class.targetClassID, subjectID, student.targetUserID,
		).Scan(&avgScore); err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", r.ID), fmt.Sprintf("compute automatic score: %v", err))
			continue
		}
		automaticScore, hasAutomaticScore := avgScore.Float64, avgScore.Valid

		finalScore := automaticScore
		hasFinalScore := hasAutomaticScore
		if r.ManualFinalScore.Valid {
			finalScore = r.ManualFinalScore.Float64
			hasFinalScore = true
		}
		if !hasFinalScore {
			stat.RecordFailure(fmt.Sprintf("%d", r.ID), "no manual score and no migrated grade to compute an automatic score from")
			continue
		}

		key := fmt.Sprintf("%d|%d|%d", r.ClassID, r.SubjectID, r.StudentID)
		var previousScore any
		if v, ok := previousGrades[key]; ok {
			previousScore = v
		}
		var manualScore any
		if r.ManualFinalScore.Valid {
			manualScore = r.ManualFinalScore.Float64
		}
		var automaticScoreArg any
		if hasAutomaticScore {
			automaticScoreArg = automaticScore
		} else {
			automaticScoreArg = finalScore
		}

		_, created, err := st.upsertOne(ctx,
			`insert into report_scores (
			   tenant_id, academic_year_id, term_id, class_id, subject_id, student_user_id,
			   previous_score, manual_score, automatic_score, final_score
			 ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			 on conflict (academic_year_id, term_id, class_id, subject_id, student_user_id) do update set
			   previous_score = excluded.previous_score, manual_score = excluded.manual_score,
			   automatic_score = excluded.automatic_score, final_score = excluded.final_score
			 returning id, (xmax = 0)`,
			tenantID, academicYearID, termID, class.targetClassID, subjectID, student.targetUserID,
			previousScore, manualScore, automaticScoreArg, finalScore,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", r.ID), fmt.Sprintf("upsert report score: %v", err))
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

// migrateGradePublications migrates grade_publications, keyed on the
// target's own (academic_year_id, term_id, class_id, subject_id) unique
// constraint -- identical in shape to the source's own (year, group,
// subject) key.
func (st *Store) migrateGradePublications(
	ctx context.Context, tenantID, academicYearID, termID uuid.UUID, publications []SionGradePublication,
	users map[int64]userMigrationResult, classes map[int64]classMigrationResult, subjects IDMap, stat *TableStat,
) error {
	for _, p := range publications {
		stat.Read++
		class, ok := classes[p.ClassID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", p.ID), "class not migrated (see classes table failures)")
			continue
		}
		subjectID, ok := subjects[p.SubjectID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", p.ID), "subject not migrated (see subjects table failures)")
			continue
		}
		var publishedBy uuid.NullUUID
		if user, ok := users[p.PublishedBy]; ok {
			publishedBy = uuid.NullUUID{UUID: user.targetUserID, Valid: true}
		}
		var publishedAt any
		if p.PublishedAt.Valid {
			publishedAt = p.PublishedAt.Time
		}

		_, created, err := st.upsertOne(ctx,
			`insert into grade_publications (tenant_id, academic_year_id, term_id, class_id, subject_id, is_published, published_at, published_by)
			 values ($1, $2, $3, $4, $5, $6, $7, $8)
			 on conflict (academic_year_id, term_id, class_id, subject_id) do update set
			   is_published = excluded.is_published, published_at = excluded.published_at, published_by = excluded.published_by
			 returning id, (xmax = 0)`,
			tenantID, academicYearID, termID, class.targetClassID, subjectID, p.IsPublished, publishedAt, publishedBy,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", p.ID), fmt.Sprintf("upsert grade publication: %v", err))
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

// migrateStarAwards migrates classroom_star_awards to star_events. The
// target has no natural key (a teacher can legitimately give the same
// student the same star count on the same day more than once), so this is
// a plain insert per source row rather than an upsert -- idempotency on a
// re-run instead relies on the source row itself being immutable once
// created (the live app has no "edit a past star award" feature), checked
// by matching the migrated count against a select count(*) after the fact
// rather than an on-conflict clause.
func (st *Store) migrateStarAwards(
	ctx context.Context, tenantID, academicYearID uuid.UUID, awards []SionStarAward,
	users map[int64]userMigrationResult, classes map[int64]classMigrationResult, subjects IDMap, stat *TableStat,
) error {
	zeroStars := 0
	for _, a := range awards {
		stat.Read++
		if a.Stars == 0 {
			zeroStars++
			continue
		}
		student, ok := users[a.StudentID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), "student not migrated (see identity table failures)")
			continue
		}
		teacher, ok := users[a.TeacherID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), "teacher not migrated (see identity table failures)")
			continue
		}
		class, ok := classes[a.ClassID]
		if !ok {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), "class not migrated (see classes table failures)")
			continue
		}
		var subjectID uuid.NullUUID
		if a.SubjectID.Valid {
			if id, ok := subjects[a.SubjectID.Int64]; ok {
				subjectID = uuid.NullUUID{UUID: id, Valid: true}
			}
		}

		// A source row already migrated (matched on its stable source id
		// encoded into the note as a hidden marker would be intrusive);
		// instead this checks for an identical event already present,
		// which is what a second run of this ETL would otherwise
		// duplicate.
		_, found, err := st.selectID(ctx,
			`select id from star_events
			 where academic_year_id = $1 and class_id = $2 and student_user_id = $3 and teacher_user_id = $4
			   and created_at = $5 and delta = $6`,
			academicYearID, class.targetClassID, student.targetUserID, teacher.targetUserID, a.AwardedAt, a.Stars,
		)
		if err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), fmt.Sprintf("lookup star event: %v", err))
			continue
		}
		if found {
			stat.Skipped++
			continue
		}

		if err := st.execRow(ctx,
			`insert into star_events (tenant_id, academic_year_id, class_id, subject_id, student_user_id, teacher_user_id, delta, note, visible_to_student, created_at)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			tenantID, academicYearID, class.targetClassID, subjectID, student.targetUserID, teacher.targetUserID,
			a.Stars, mapping.Truncate(mapping.CleanName(a.Note.String), 300), a.VisibleToStudent, a.AwardedAt,
		); err != nil {
			stat.RecordFailure(fmt.Sprintf("%d", a.ID), fmt.Sprintf("create star event: %v", err))
			continue
		}
		stat.Created++
	}
	if zeroStars > 0 {
		stat.RecordGap(fmt.Sprintf("classroom_star_awards: %d row(s) had stars = 0, which star_events.delta rejects (must be non-zero); not migrated", zeroStars))
	}
	return nil
}
