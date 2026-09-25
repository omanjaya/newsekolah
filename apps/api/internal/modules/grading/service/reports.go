package service

import (
	"context"
	"errors"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// PreviousTerm returns the term immediately before currentTermID in
// sequence within the same academic year, if one exists. It exposes
// Repository.PreviousTermID (already used internally by previousScores)
// as a public read for cross-module callers -- the analytics module's
// wiring adapter uses it to compare two terms' report-score averages,
// the same way discipline exposes StudentSummary and attendance exposes
// GetMonthlySummary for their own cross-module readers.
func (s *Service) PreviousTerm(ctx context.Context, tenantID, currentTermID uuid.UUID) (Term, bool, error) {
	var (
		term  Term
		found bool
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetTerm(ctx, tenantID, currentTermID)
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}
		prevID, err := s.repo.PreviousTermID(ctx, tenantID, current.AcademicYearID, current.Sequence)
		if err != nil || !prevID.Valid {
			return err
		}
		term, found, err = s.repo.GetTerm(ctx, tenantID, prevID.UUID)
		return err
	})
	return term, found, err
}

// recomputeReportScores refreshes every student's automatic report score
// for one class-subject from the current component grades, applying the
// school's grade ranges. A manual override, if one is already set, keeps
// winning as final_score -- UpsertReportScore only replaces final_score
// with the automatic value when no override exists (domain.
// ComputeReportScore's doc comment has the full rule).
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
		result := domain.ComputeReportScore(scale, scale.Round(raw), previous[studentID], nil, ranges)
		if _, err := s.repo.UpsertReportScore(ctx, tenantID, yearID, termID, classID, subjectID, studentID, previous[studentID], nil, result.Automatic); err != nil {
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
// over recomputation until it is cleared (UpsertReportScore and
// SetManualReportScore's SQL both restore the automatic value once it is).
//
// report_scores rows normally come from recomputeReportScores, which only
// visits students who already have at least one component grade -- a
// student with none yet (a transfer student) has no row for
// SetManualReportScore to UPDATE. When that happens this falls back to
// inserting the row with the automatic value the student would otherwise
// have (studentAutomaticScore), then applying the override on top, so the
// override always succeeds and clearing it later still restores the same
// automatic baseline.
func (s *Service) SetManualScore(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, classID, subjectID, studentID uuid.UUID, termID uuid.NullUUID, manual *float64) (ReportScore, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return ReportScore{}, err
	}
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
		if err == nil {
			return nil
		}
		if !errors.Is(err, domain.ErrComponentNotFound) {
			return err
		}
		automatic, previous, err := s.studentAutomaticScore(ctx, tenantID, yearID, term.ID, classID, subjectID, studentID, scale)
		if err != nil {
			return err
		}
		out, err = s.repo.UpsertReportScore(ctx, tenantID, yearID, term.ID, classID, subjectID, studentID, previous, manual, automatic)
		return err
	})
	return out, err
}

// studentAutomaticScore computes the automatic report score one student
// would have from their current component grades, the same rule
// recomputeReportScores applies when it visits every graded student. A
// student with no grades at all has no weighted average to work from, so
// this falls back to the scale's minimum as the baseline.
func (s *Service) studentAutomaticScore(ctx context.Context, tenantID, yearID, termID, classID, subjectID, studentID uuid.UUID, scale domain.Scale) (automatic float64, previous *float64, err error) {
	components, err := s.repo.ListComponents(ctx, tenantID, termID, classID, subjectID)
	if err != nil {
		return 0, nil, err
	}
	prevByStudent, err := s.previousScores(ctx, tenantID, yearID, termID, classID, subjectID)
	if err != nil {
		return 0, nil, err
	}
	previous = prevByStudent[studentID]

	raw := scale.Min
	var ranges []domain.GradeRange
	if len(components) > 0 {
		componentIDs := make([]uuid.UUID, len(components))
		for i, c := range components {
			componentIDs[i] = c.ID
		}
		grades, err := s.repo.ListGradesForComponents(ctx, tenantID, componentIDs)
		if err != nil {
			return 0, nil, err
		}
		scores := make(map[uuid.UUID]float64, len(grades))
		for _, g := range grades {
			if g.StudentUserID == studentID {
				scores[g.ComponentID] = g.Score
			}
		}
		if avg, ok := domain.WeightedAverage(components, scores); ok {
			raw = avg
		}
		ranges, err = s.applicableRanges(ctx, tenantID, yearID, subjectID, components[0].TeacherUserID)
		if err != nil {
			return 0, nil, err
		}
	}
	result := domain.ComputeReportScore(scale, scale.Round(raw), previous, nil, ranges)
	return result.Automatic, previous, nil
}

// Publish flips one class-subject's publication flag; students only see
// grades of published subjects.
func (s *Service) Publish(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, classID, subjectID uuid.UUID, termID uuid.NullUUID, published bool) (Publication, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return Publication{}, err
	}
	var out Publication
	var studentIDs []uuid.UUID
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
		if err != nil {
			return err
		}
		if err := audit.Record(ctx, tenantID, "grading.report_publish", "report_publication", classID, nil, map[string]any{
			"term_id": term.ID, "subject_id": subjectID, "published": published,
		}); err != nil {
			return err
		}
		if published {
			// Resolved inside the same tenant transaction (docs/analysis/
			// realtime-plan-2026-09-25.md section 4, C4's brief: "resolving
			// the class roster inside the same tenant transaction") so the
			// roster this publishes to is exactly the one the publication
			// just committed against, not a second, possibly-stale read
			// after the transaction closes.
			studentIDs, err = s.repo.ClassStudentIDs(ctx, tenantID, yearID, classID)
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return Publication{}, err
	}
	if published {
		payload := gradingPublishedPayload{ClassID: classID, SubjectID: subjectID, TermID: out.TermID}
		for _, studentID := range studentIDs {
			s.publishToStudent(ctx, tenantID, studentID, payload)
		}
	}
	return out, nil
}

// gradingPublishedPayload is the minimal payload pushed to each student
// once a class-subject's grades are published -- ids only; the client
// re-fetches through its already-authorized MyGrades endpoint.
type gradingPublishedPayload struct {
	ClassID   uuid.UUID `json:"class_id"`
	SubjectID uuid.UUID `json:"subject_id"`
	TermID    uuid.UUID `json:"term_id"`
}

// publishToStudent is a nil-safe wrapper over RealtimePublisher.
// PublishToUser, so Publish does not repeat the nil-check (no Hub wired
// must not fail publication itself).
func (s *Service) publishToStudent(ctx context.Context, tenantID, studentID uuid.UUID, payload gradingPublishedPayload) {
	if s.realtime == nil {
		return
	}
	_ = s.realtime.PublishToUser(ctx, tenantID, studentID, "grading.published", payload)
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
// publication is still off. Stars counts only visible_to_student events
// (grading_extended.go:653's "AND e.visible_to_student=TRUE"), matching
// the /v1/me/stars breakdown.
func (s *Service) MyGrades(ctx context.Context, tenantID, studentID uuid.UUID, termID uuid.NullUUID) (MyGrades, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return MyGrades{}, err
	}
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
		out.Stars, err = s.repo.VisibleStarBalance(ctx, tenantID, yearID, studentID)
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

// ListGradeRanges scopes to the caller's own teacher-specific ranges plus
// every school-wide or subject-only range (teacher_user_id null); a
// curriculum lead or admin (canManageAny) sees every range in the school.
// Without this, any teacher holding manage_grades could read every other
// teacher's ranges.
func (s *Service) ListGradeRanges(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool) ([]domain.GradeRange, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []domain.GradeRange
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		all, err := s.repo.ListGradeRanges(ctx, tenantID, yearID)
		if err != nil {
			return err
		}
		if canManageAny {
			out = all
			return nil
		}
		out = make([]domain.GradeRange, 0, len(all))
		for _, r := range all {
			if !r.TeacherUserID.Valid || r.TeacherUserID.UUID == actorID {
				out = append(out, r)
			}
		}
		return nil
	})
	return out, err
}

func (s *Service) CreateGradeRange(ctx context.Context, tenantID uuid.UUID, r domain.GradeRange) (domain.GradeRange, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.GradeRange{}, err
	}
	var out domain.GradeRange
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		scale, err := s.loadScale(ctx, tenantID)
		if err != nil {
			return err
		}
		if err := domain.ValidateGradeRanges(scale, []domain.GradeRange{r}); err != nil {
			return err
		}
		out, err = s.repo.CreateGradeRange(ctx, tenantID, yearID, r)
		return err
	})
	return out, err
}

func (s *Service) DeleteGradeRange(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteGradeRange(ctx, tenantID, id)
	})
}

// ReplaceGradeRanges is the "aturan nilai rapor" screen's save action
// (grading_extended.go:111-152): the full set of ranges for one
// subject-teacher pair is validated together (so overlap can be checked)
// and replaces whatever was saved before. A plain teacher (manage_grades,
// !canManageAny) may only replace their own ranges; a curriculum lead or
// admin may target another teacher or leave the scope teacher-less for a
// school-wide range.
func (s *Service) ReplaceGradeRanges(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, subjectID uuid.UUID, teacherUserID uuid.NullUUID, inputs []GradeRangeInput) ([]domain.GradeRange, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	if !canManageAny && (!teacherUserID.Valid || teacherUserID.UUID != actorID) {
		return nil, domain.ErrNotTeachingThisClass
	}
	ranges := make([]domain.GradeRange, len(inputs))
	for i, in := range inputs {
		ranges[i] = domain.GradeRange{SubjectID: uuid.NullUUID{UUID: subjectID, Valid: true}, TeacherUserID: teacherUserID, MinScore: in.MinScore, MaxScore: in.MaxScore, IncreaseAmount: in.IncreaseAmount}
	}
	var out []domain.GradeRange
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		scale, err := s.loadScale(ctx, tenantID)
		if err != nil {
			return err
		}
		if err := domain.ValidateGradeRanges(scale, ranges); err != nil {
			return err
		}
		out, err = s.repo.ReplaceGradeRanges(ctx, tenantID, yearID, subjectID, teacherUserID, ranges)
		return err
	})
	return out, err
}

type GradeRangeInput struct {
	MinScore       float64
	MaxScore       float64
	IncreaseAmount float64
}
