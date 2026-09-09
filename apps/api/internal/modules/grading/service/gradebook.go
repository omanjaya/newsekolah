package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
)

// Gradebook is one class-subject sheet: the components across the top,
// the enrolled students down the side, and every score already recorded.
type Gradebook struct {
	Term        Term
	ClassID     uuid.UUID
	SubjectID   uuid.UUID
	Scale       domain.Scale
	Components  []domain.Component
	Students    []GradebookStudent
	IsPublished bool
}

type GradebookStudent struct {
	StudentUserID uuid.UUID
	Name          string
	Scores        map[uuid.UUID]float64
	Average       *float64
	ReportScore   *float64
}

type GradebookQuery struct {
	ClassID   uuid.UUID
	SubjectID uuid.UUID
	TermID    uuid.NullUUID
}

func (s *Service) Gradebook(ctx context.Context, tenantID uuid.UUID, q GradebookQuery) (Gradebook, error) {
	var out Gradebook
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		term, err := s.resolveTerm(ctx, tenantID, yearID, q.TermID)
		if err != nil {
			return err
		}
		scale, err := s.loadScale(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.gradebookInTx(ctx, tenantID, yearID, term.ID, q.ClassID, q.SubjectID, scale)
		return err
	})
	return out, err
}

type ComponentInput struct {
	ClassID     uuid.UUID
	SubjectID   uuid.UUID
	TermID      uuid.NullUUID
	Code        string
	Kind        domain.ComponentKind
	Description string
	KKTP        *float64
	Weight      float64
	Sequence    int
}

func (s *Service) CreateComponent(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, in ComponentInput) (domain.Component, error) {
	if strings.TrimSpace(in.Code) == "" || !in.Kind.Valid() || in.Weight <= 0 {
		return domain.Component{}, domain.ErrInvalidInput
	}
	var out domain.Component
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		term, err := s.resolveTerm(ctx, tenantID, yearID, in.TermID)
		if err != nil {
			return err
		}
		if err := s.requireTeaches(ctx, tenantID, yearID, actorID, in.ClassID, in.SubjectID, canManageAny); err != nil {
			return err
		}
		out, err = s.repo.CreateComponent(ctx, domain.Component{
			TenantID: tenantID, AcademicYearID: yearID, TermID: term.ID, TeacherUserID: actorID,
			ClassID: in.ClassID, SubjectID: in.SubjectID, Code: strings.ToUpper(strings.TrimSpace(in.Code)), Kind: in.Kind,
			Description: strings.TrimSpace(in.Description), KKTP: in.KKTP, Weight: in.Weight, Sequence: in.Sequence,
		})
		return err
	})
	return out, err
}

func (s *Service) UpdateComponent(ctx context.Context, tenantID, componentID, actorID uuid.UUID, canManageAny bool, in ComponentInput) (domain.Component, error) {
	if strings.TrimSpace(in.Code) == "" || !in.Kind.Valid() || in.Weight <= 0 {
		return domain.Component{}, domain.ErrInvalidInput
	}
	var out domain.Component
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetComponent(ctx, tenantID, componentID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrComponentNotFound
		}
		if err := s.requireTeaches(ctx, tenantID, current.AcademicYearID, actorID, current.ClassID, current.SubjectID, canManageAny); err != nil {
			return err
		}
		current.Code = strings.ToUpper(strings.TrimSpace(in.Code))
		current.Kind, current.Description, current.KKTP, current.Weight, current.Sequence = in.Kind, strings.TrimSpace(in.Description), in.KKTP, in.Weight, in.Sequence
		out, err = s.repo.UpdateComponent(ctx, current)
		return err
	})
	return out, err
}

func (s *Service) DeleteComponent(ctx context.Context, tenantID, componentID, actorID uuid.UUID, canManageAny bool) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetComponent(ctx, tenantID, componentID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrComponentNotFound
		}
		if err := s.requireTeaches(ctx, tenantID, current.AcademicYearID, actorID, current.ClassID, current.SubjectID, canManageAny); err != nil {
			return err
		}
		return s.repo.DeleteComponent(ctx, tenantID, componentID)
	})
}

type ScoreEntry struct {
	StudentUserID uuid.UUID
	Score         float64
}

// SaveScores writes one component's column and recomputes every affected
// student's report score in the same transaction, so the sheet and the
// report never disagree.
func (s *Service) SaveScores(ctx context.Context, tenantID, componentID, actorID uuid.UUID, canManageAny bool, entries []ScoreEntry) (Gradebook, error) {
	var out Gradebook
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		component, ok, err := s.repo.GetComponent(ctx, tenantID, componentID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrComponentNotFound
		}
		if err := s.requireTeaches(ctx, tenantID, component.AcademicYearID, actorID, component.ClassID, component.SubjectID, canManageAny); err != nil {
			return err
		}
		scale, err := s.loadScale(ctx, tenantID)
		if err != nil {
			return err
		}
		for _, e := range entries {
			if !scale.InRange(e.Score) {
				return domain.ErrScoreOutOfRange
			}
			if _, err := s.repo.UpsertGrade(ctx, tenantID, componentID, e.StudentUserID, scale.Round(e.Score), actorID); err != nil {
				return err
			}
		}
		if err := s.recomputeReportScores(ctx, tenantID, component.AcademicYearID, component.TermID, component.ClassID, component.SubjectID, scale); err != nil {
			return err
		}
		out, err = s.gradebookInTx(ctx, tenantID, component.AcademicYearID, component.TermID, component.ClassID, component.SubjectID, scale)
		return err
	})
	return out, err
}

// gradebookInTx rebuilds the sheet without reopening a transaction, for
// callers that already hold one.
// gradebookInTx rebuilds the sheet without reopening a transaction, for
// callers that already hold one.
func (s *Service) gradebookInTx(ctx context.Context, tenantID, yearID, termID, classID, subjectID uuid.UUID, scale domain.Scale) (Gradebook, error) {
	term, ok, err := s.repo.GetTerm(ctx, tenantID, termID)
	if err != nil {
		return Gradebook{}, err
	}
	if !ok {
		return Gradebook{}, domain.ErrNoActiveTerm
	}
	components, err := s.repo.ListComponents(ctx, tenantID, termID, classID, subjectID)
	if err != nil {
		return Gradebook{}, err
	}
	scores, err := s.scoresByStudent(ctx, tenantID, components)
	if err != nil {
		return Gradebook{}, err
	}
	finals, err := s.finalScores(ctx, tenantID, termID, classID, subjectID)
	if err != nil {
		return Gradebook{}, err
	}
	pub, _, err := s.repo.GetPublication(ctx, tenantID, termID, classID, subjectID)
	if err != nil {
		return Gradebook{}, err
	}
	students, err := s.gradebookStudents(ctx, tenantID, yearID, classID, components, scores, finals, scale)
	if err != nil {
		return Gradebook{}, err
	}
	return Gradebook{Term: term, ClassID: classID, SubjectID: subjectID, Scale: scale, Components: components, Students: students, IsPublished: pub.IsPublished}, nil
}

// scoresByStudent indexes every recorded grade of these components.
func (s *Service) scoresByStudent(ctx context.Context, tenantID uuid.UUID, components []domain.Component) (map[uuid.UUID]map[uuid.UUID]float64, error) {
	componentIDs := make([]uuid.UUID, len(components))
	for i, c := range components {
		componentIDs[i] = c.ID
	}
	grades, err := s.repo.ListGradesForComponents(ctx, tenantID, componentIDs)
	if err != nil {
		return nil, err
	}
	out := map[uuid.UUID]map[uuid.UUID]float64{}
	for _, g := range grades {
		row, ok := out[g.StudentUserID]
		if !ok {
			row = map[uuid.UUID]float64{}
			out[g.StudentUserID] = row
		}
		row[g.ComponentID] = g.Score
	}
	return out, nil
}

func (s *Service) finalScores(ctx context.Context, tenantID, termID, classID, subjectID uuid.UUID) (map[uuid.UUID]float64, error) {
	reports, err := s.repo.ListReportScores(ctx, tenantID, termID, classID, subjectID)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]float64, len(reports))
	for _, r := range reports {
		out[r.StudentUserID] = r.FinalScore
	}
	return out, nil
}

func (s *Service) gradebookStudents(ctx context.Context, tenantID, yearID, classID uuid.UUID, components []domain.Component, scores map[uuid.UUID]map[uuid.UUID]float64, finals map[uuid.UUID]float64, scale domain.Scale) ([]GradebookStudent, error) {
	studentIDs, err := s.repo.ClassStudentIDs(ctx, tenantID, yearID, classID)
	if err != nil {
		return nil, err
	}
	names, err := s.repo.StudentNames(ctx, tenantID, studentIDs)
	if err != nil {
		return nil, err
	}
	out := make([]GradebookStudent, 0, len(studentIDs))
	for _, id := range studentIDs {
		row := scores[id]
		if row == nil {
			row = map[uuid.UUID]float64{}
		}
		student := GradebookStudent{StudentUserID: id, Name: names[id], Scores: row}
		if avg, ok := domain.WeightedAverage(components, row); ok {
			rounded := scale.Round(avg)
			student.Average = &rounded
		}
		if final, ok := finals[id]; ok {
			value := final
			student.ReportScore = &value
		}
		out = append(out, student)
	}
	return out, nil
}
