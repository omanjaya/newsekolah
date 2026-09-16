package main

import (
	"database/sql"
	"time"
)

// SionLearningObjective is one live-schema learning_objectives row: a
// gradable item ("Tujuan Pembelajaran"/TP, or a summative/practical
// assessment) a teacher defines for one subject in one year. It carries no
// class -- the same learning objective is reused across every class a
// teacher teaches that subject to -- so migrate_grading.go derives one
// target assessment_component per (learning_objective, class) pair actually
// graded, using the class named on each grades row instead.
type SionLearningObjective struct {
	ID          int64
	SubjectID   int64
	TeacherID   sql.NullInt64
	Code        string
	Type        string
	Description string
	Weight      float64
	KKTP        sql.NullInt64
	SortOrder   int
}

func (s *Source) FetchLearningObjectives(yearID int64) (map[int64]SionLearningObjective, error) {
	rows, err := s.db.Query(
		`select id, subject_id, teacher_id, code, type, description, weight, kktp, sort_order
		 from learning_objectives where year_id = ?`,
		yearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := make(map[int64]SionLearningObjective)
	for rows.Next() {
		var lo SionLearningObjective
		if err := rows.Scan(&lo.ID, &lo.SubjectID, &lo.TeacherID, &lo.Code, &lo.Type, &lo.Description, &lo.Weight, &lo.KKTP, &lo.SortOrder); err != nil {
			return nil, err
		}
		out[lo.ID] = lo
	}
	return out, rows.Err()
}

// SionGrade is one live-schema grades row: one student's score on one
// learning objective, within one class.
type SionGrade struct {
	ID                  int64
	ClassID             int64
	SubjectID           int64
	LearningObjectiveID int64
	StudentID           int64
	TeacherID           sql.NullInt64
	Score               sql.NullFloat64
}

func (s *Source) FetchGrades(yearID int64) ([]SionGrade, error) {
	rows, err := s.db.Query(
		`select id, group_id, subject_id, learning_objective_id, user_id, teacher_id, score
		 from grades where year_id = ? order by id`,
		yearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionGrade
	for rows.Next() {
		var g SionGrade
		if err := rows.Scan(&g.ID, &g.ClassID, &g.SubjectID, &g.LearningObjectiveID, &g.StudentID, &g.TeacherID, &g.Score); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// SionReportScore is one live-schema report_scores row: an optional manual
// override of a student's computed final score for one class/subject.
type SionReportScore struct {
	ID               int64
	ClassID          int64
	SubjectID        int64
	StudentID        int64
	ManualFinalScore sql.NullFloat64
}

func (s *Source) FetchReportScores(yearID int64) ([]SionReportScore, error) {
	rows, err := s.db.Query(
		`select id, group_id, subject_id, user_id, manual_final_score from report_scores where year_id = ? order by id`,
		yearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionReportScore
	for rows.Next() {
		var r SionReportScore
		if err := rows.Scan(&r.ID, &r.ClassID, &r.SubjectID, &r.StudentID, &r.ManualFinalScore); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SionPreviousGrade is one live-schema previous_grades row: the prior
// term's final score for a student, carried forward for trend display --
// maps to report_scores.previous_score in the target.
type SionPreviousGrade struct {
	ClassID   int64
	SubjectID int64
	StudentID int64
	Score     float64
}

func (s *Source) FetchPreviousGrades(yearID int64) ([]SionPreviousGrade, error) {
	rows, err := s.db.Query(
		`select group_id, subject_id, user_id, score from previous_grades where year_id = ?`,
		yearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionPreviousGrade
	for rows.Next() {
		var p SionPreviousGrade
		if err := rows.Scan(&p.ClassID, &p.SubjectID, &p.StudentID, &p.Score); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SionGradePublication is one live-schema grade_publications row: whether a
// class/subject's grades have been published to students/guardians.
type SionGradePublication struct {
	ID          int64
	ClassID     int64
	SubjectID   int64
	PublishedBy int64
	IsPublished bool
	PublishedAt sql.NullTime
}

func (s *Source) FetchGradePublications(yearID int64) ([]SionGradePublication, error) {
	rows, err := s.db.Query(
		`select id, group_id, subject_id, user_id, is_published, published_at from grade_publications where year_id = ?`,
		yearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionGradePublication
	for rows.Next() {
		var p SionGradePublication
		if err := rows.Scan(&p.ID, &p.ClassID, &p.SubjectID, &p.PublishedBy, &p.IsPublished, &p.PublishedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SionStarAward is one live-schema classroom_star_awards row: a teacher's
// positive-behaviour star given to a student in one class, optionally tied
// to one subject.
type SionStarAward struct {
	ID               int64
	TeacherID        int64
	ClassID          int64
	SubjectID        sql.NullInt64
	StudentID        int64
	Stars            int
	Note             sql.NullString
	VisibleToStudent bool
	AwardedAt        time.Time
}

func (s *Source) FetchClassroomStarAwards(yearID int64) ([]SionStarAward, error) {
	rows, err := s.db.Query(
		`select id, teacher_id, group_id, subject_id, student_id, stars, note, visible_to_student, awarded_at
		 from classroom_star_awards where year_id = ? order by id`,
		yearID,
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var out []SionStarAward
	for rows.Next() {
		var a SionStarAward
		if err := rows.Scan(&a.ID, &a.TeacherID, &a.ClassID, &a.SubjectID, &a.StudentID, &a.Stars, &a.Note, &a.VisibleToStudent, &a.AwardedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
