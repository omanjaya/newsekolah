package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
)

// recomputeReportScores refreshes every student's report score for one
// class-subject from the current component grades, applying the school's
// grade ranges and never dropping below the previous term.
func (s *Service) recomputeReportScores(ctx context.Context, tenantID, yearID, termID, classID, subjectID uuid.UUID, scale domain.Scale) error {
	components, err := s.repo.ListComponents(ctx, tenantID, termID, classID, subjectID)
	if err != nil {
		return err
	}
	if len(components) == 0 {
		return nil
	}
	componentIDs := make([]uuid.UUID, len(components))
	for i, c := range components {
		componentIDs[i] = c.ID
	}
	grades, err := s.repo.ListGradesForComponents(ctx, tenantID, componentIDs)
	if err != nil {
		return err
	}
	byStudent := map[uuid.UUID]map[uuid.UUID]float64{}
	for _, g := range grades {
		row, ok := byStudent[g.StudentUserID]
		if !ok {
			row = map[uuid.UUID]float64{}
			byStudent[g.StudentUserID] = row
		}
		row[g.ComponentID] = g.Score
	}
	ranges, err := s.applicableRanges(ctx, tenantID, yearID, subjectID, components[0].TeacherUserID)
	if err != nil {
		return err
	}
	previous, err := s.previousScores(ctx, tenantID, yearID, termID, classID, subjectID)
	if err != nil {
		return err
	}
	for studentID, scores := range byStudent {
		raw, ok := domain.WeightedAverage(components, scores)
		if !ok {
			continue
		}
		prev := previous[studentID]
		final := domain.ReportScore(scale, scale.Round(raw), prev, ranges)
		if _, err := s.repo.UpsertReportScore(ctx, tenantID, yearID, termID, classID, subjectID, studentID, prev, nil, final); err != nil {
			return err
		}
	}
	return nil
}

// applicableRanges keeps the ranges that target this subject or teacher,
// plus the school-wide ones (both columns null).
func (s *Service) applicableRanges(ctx context.Context, tenantID, yearID, subjectID, teacherID uuid.UUID) ([]domain.GradeRange, error) {
	all, err := s.repo.ListGradeRanges(ctx, tenantID, yearID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.GradeRange, 0, len(all))
	for _, r := range all {
		if r.SubjectID.Valid && r.SubjectID.UUID != subjectID {
			continue
		}
		if r.TeacherUserID.Valid && r.TeacherUserID.UUID != teacherID {
			continue
		}
		out = append(out, r)
	}
	return out, nil
}

// previousScores reads the same subject's final scores from the term
// before this one, so a report never goes down between terms.
func (s *Service) previousScores(ctx context.Context, tenantID, yearID, termID, classID, subjectID uuid.UUID) (map[uuid.UUID]*float64, error) {
	out := map[uuid.UUID]*float64{}
	term, ok, err := s.repo.GetTerm(ctx, tenantID, termID)
	if err != nil || !ok {
		return out, err
	}
	prevID, err := s.repo.PreviousTermID(ctx, tenantID, yearID, term.Sequence)
	if err != nil || !prevID.Valid {
		return out, err
	}
	scores, err := s.repo.ListReportScores(ctx, tenantID, prevID.UUID, classID, subjectID)
	if err != nil {
		return out, err
	}
	for _, sc := range scores {
		value := sc.FinalScore
		out[sc.StudentUserID] = &value
	}
	return out, nil
}

// SetManualScore overrides one student's report score; the override wins
// over recomputation until it is cleared.
func (s *Service) SetManualScore(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, classID, subjectID, studentID uuid.UUID, termID uuid.NullUUID, manual *float64) (ReportScore, error) {
	var out ReportScore
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		term, err := s.resolveTerm(ctx, tenantID, yearID, termID)
		if err != nil {
			return err
		}
		if err := s.requireTeaches(ctx, tenantID, yearID, actorID, classID, subjectID, canManageAny); err != nil {
			return err
		}
		scale, err := s.loadScale(ctx, tenantID)
		if err != nil {
			return err
		}
		if manual != nil && !scale.InRange(*manual) {
			return domain.ErrScoreOutOfRange
		}
		out, err = s.repo.SetManualReportScore(ctx, tenantID, yearID, term.ID, classID, subjectID, studentID, manual)
		return err
	})
	return out, err
}

// Publish flips one class-subject's publication flag; students only see
// grades of published subjects.
func (s *Service) Publish(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, classID, subjectID uuid.UUID, termID uuid.NullUUID, published bool) (Publication, error) {
	var out Publication
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		term, err := s.resolveTerm(ctx, tenantID, yearID, termID)
		if err != nil {
			return err
		}
		if err := s.requireTeaches(ctx, tenantID, yearID, actorID, classID, subjectID, canManageAny); err != nil {
			return err
		}
		scale, err := s.loadScale(ctx, tenantID)
		if err != nil {
			return err
		}
		if published {
			if err := s.recomputeReportScores(ctx, tenantID, yearID, term.ID, classID, subjectID, scale); err != nil {
				return err
			}
		}
		out, err = s.repo.SetPublication(ctx, tenantID, yearID, term.ID, classID, subjectID, published, actorID)
		return err
	})
	return out, err
}

// MySubjectGrade is what a student (or their parent) sees per subject.
type MySubjectGrade struct {
	SubjectID   uuid.UUID
	Components  []MyComponentScore
	Average     *float64
	ReportScore *float64
}

type MyComponentScore struct {
	Code  string
	Kind  domain.ComponentKind
	KKTP  *float64
	Score float64
}

type MyGrades struct {
	Term     Term
	Scale    domain.Scale
	Subjects []MySubjectGrade
	Stars    int
}

// MyGrades returns the student's own grades, hiding subjects whose
// publication is still off.
func (s *Service) MyGrades(ctx context.Context, tenantID, studentID uuid.UUID, termID uuid.NullUUID) (MyGrades, error) {
	var out MyGrades
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		term, err := s.resolveTerm(ctx, tenantID, yearID, termID)
		if err != nil {
			return err
		}
		scale, err := s.loadScale(ctx, tenantID)
		if err != nil {
			return err
		}
		published, err := s.publishedSubjects(ctx, tenantID, yearID, term.ID, studentID)
		if err != nil {
			return err
		}
		rows, err := s.repo.ListGradesForStudent(ctx, tenantID, studentID, term.ID)
		if err != nil {
			return err
		}
		finals, err := s.studentFinals(ctx, tenantID, term.ID, studentID)
		if err != nil {
			return err
		}
		out = MyGrades{Term: term, Scale: scale, Subjects: groupStudentGrades(rows, published, finals, scale)}
		out.Stars, err = s.repo.StarBalance(ctx, tenantID, yearID, studentID)
		return err
	})
	return out, err
}

// publishedSubjects is the set of subjects whose grades this student's
// class may already see.
func (s *Service) publishedSubjects(ctx context.Context, tenantID, yearID, termID, studentID uuid.UUID) (map[uuid.UUID]bool, error) {
	out := map[uuid.UUID]bool{}
	classID, err := s.repo.StudentClassID(ctx, tenantID, yearID, studentID)
	if err != nil || !classID.Valid {
		return out, err
	}
	ids, err := s.repo.ListPublishedSubjects(ctx, tenantID, termID, classID.UUID)
	if err != nil {
		return nil, err
	}
	for _, id := range ids {
		out[id] = true
	}
	return out, nil
}

func (s *Service) studentFinals(ctx context.Context, tenantID, termID, studentID uuid.UUID) (map[uuid.UUID]float64, error) {
	reports, err := s.repo.ListReportScoresForStudent(ctx, tenantID, termID, studentID)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]float64, len(reports))
	for _, r := range reports {
		out[r.SubjectID] = r.FinalScore
	}
	return out, nil
}

// groupStudentGrades folds the flat grade rows into one entry per
// published subject, with the weighted average and report score.
func groupStudentGrades(rows []StudentGradeRow, published map[uuid.UUID]bool, finals map[uuid.UUID]float64, scale domain.Scale) []MySubjectGrade {
	bySubject := map[uuid.UUID]*MySubjectGrade{}
	weighted := map[uuid.UUID][2]float64{}
	order := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		if !published[row.SubjectID] {
			continue
		}
		subject, ok := bySubject[row.SubjectID]
		if !ok {
			subject = &MySubjectGrade{SubjectID: row.SubjectID}
			bySubject[row.SubjectID] = subject
			order = append(order, row.SubjectID)
		}
		subject.Components = append(subject.Components, MyComponentScore{Code: row.Code, Kind: row.Kind, KKTP: row.KKTP, Score: row.Score})
		acc := weighted[row.SubjectID]
		weighted[row.SubjectID] = [2]float64{acc[0] + row.Score*row.Weight, acc[1] + row.Weight}
	}
	out := make([]MySubjectGrade, 0, len(order))
	for _, id := range order {
		subject := bySubject[id]
		if acc := weighted[id]; acc[1] > 0 {
			avg := scale.Round(acc[0] / acc[1])
			subject.Average = &avg
		}
		if final, ok := finals[id]; ok {
			value := final
			subject.ReportScore = &value
		}
		out = append(out, *subject)
	}
	return out
}

// Grade ranges (the "kenaikan nilai rapor" table).

func (s *Service) ListGradeRanges(ctx context.Context, tenantID uuid.UUID) ([]domain.GradeRange, error) {
	var out []domain.GradeRange
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListGradeRanges(ctx, tenantID, yearID)
		return err
	})
	return out, err
}

func (s *Service) CreateGradeRange(ctx context.Context, tenantID uuid.UUID, r domain.GradeRange) (domain.GradeRange, error) {
	if r.MinScore > r.MaxScore || r.IncreaseAmount < 0 {
		return domain.GradeRange{}, domain.ErrInvalidInput
	}
	var out domain.GradeRange
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.CreateGradeRange(ctx, tenantID, yearID, r)
		return err
	})
	return out, err
}

func (s *Service) DeleteGradeRange(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteGradeRange(ctx, tenantID, id)
	})
}

// Stars.

type StarInput struct {
	StudentUserID    uuid.UUID
	ClassID          uuid.UUID
	SubjectID        uuid.NullUUID
	Delta            int
	Note             string
	VisibleToStudent bool
}

func (s *Service) GiveStar(ctx context.Context, tenantID, teacherID uuid.UUID, in StarInput) (domain.StarEvent, int, error) {
	var (
		event   domain.StarEvent
		balance int
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		current, err := s.repo.StarBalance(ctx, tenantID, yearID, in.StudentUserID)
		if err != nil {
			return err
		}
		balance, err = domain.ApplyStar(current, in.Delta)
		if err != nil {
			return err
		}
		event, err = s.repo.InsertStarEvent(ctx, domain.StarEvent{
			TenantID: tenantID, AcademicYearID: yearID, ClassID: in.ClassID, SubjectID: in.SubjectID,
			StudentUserID: in.StudentUserID, TeacherUserID: teacherID, Delta: in.Delta, Note: in.Note, VisibleToStudent: in.VisibleToStudent,
		})
		return err
	})
	return event, balance, err
}

func (s *Service) StarLedger(ctx context.Context, tenantID, studentID uuid.UUID, includeHidden bool, limit int) ([]domain.StarEvent, int, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var (
		events  []domain.StarEvent
		balance int
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		if events, err = s.repo.ListStarEvents(ctx, tenantID, yearID, studentID, includeHidden, limit); err != nil {
			return err
		}
		balance, err = s.repo.StarBalance(ctx, tenantID, yearID, studentID)
		return err
	})
	return events, balance, err
}

func (s *Service) ClassStarBalances(ctx context.Context, tenantID, classID uuid.UUID) ([]StarBalance, error) {
	var out []StarBalance
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListStarBalances(ctx, tenantID, yearID, classID)
		return err
	})
	return out, err
}
