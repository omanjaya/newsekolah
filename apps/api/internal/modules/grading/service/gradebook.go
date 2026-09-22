package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
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
	FinalKKTP     *float64
	ReportScore   *float64
}

type GradebookQuery struct {
	ClassID   uuid.UUID
	SubjectID uuid.UUID
	TermID    uuid.NullUUID
}

func (s *Service) Gradebook(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, q GradebookQuery) (Gradebook, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return Gradebook{}, err
	}
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
		if err := s.requireTeaches(ctx, tenantID, yearID, actorID, q.ClassID, q.SubjectID, canManageAny); err != nil {
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

// normalize applies the same trimming and casing the old app did before
// validating (grading.go:154-158), so ValidateComponent sees the final
// values and the caller does not have to remember to do it twice.
func (in ComponentInput) normalize() (code, description string) {
	return strings.ToUpper(strings.TrimSpace(in.Code)), strings.TrimSpace(in.Description)
}

func (s *Service) CreateComponent(ctx context.Context, tenantID, actorID uuid.UUID, canManageAny bool, in ComponentInput) (domain.Component, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Component{}, err
	}
	code, description := in.normalize()
	if err := domain.ValidateComponent(code, description, in.Kind, in.Weight, in.KKTP); err != nil {
		return domain.Component{}, err
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
			ClassID: in.ClassID, SubjectID: in.SubjectID, Code: code, Kind: in.Kind,
			Description: description, KKTP: in.KKTP, Weight: in.Weight, Sequence: in.Sequence,
		})
		return err
	})
	return out, err
}

func (s *Service) UpdateComponent(ctx context.Context, tenantID, componentID, actorID uuid.UUID, canManageAny bool, in ComponentInput) (domain.Component, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Component{}, err
	}
	code, description := in.normalize()
	if err := domain.ValidateComponent(code, description, in.Kind, in.Weight, in.KKTP); err != nil {
		return domain.Component{}, err
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
		current.Code = code
		current.Kind, current.Description, current.KKTP, current.Weight, current.Sequence = in.Kind, description, in.KKTP, in.Weight, in.Sequence
		out, err = s.repo.UpdateComponent(ctx, current)
		return err
	})
	return out, err
}

// DeleteComponent refuses with ErrComponentHasGrades once any student has
// a score on the component (grading.go:229-252): the old app checked this
// before deleting rather than letting the foreign key cascade the scores
// away, and this restores that check as the actual enforcement point --
// the cascade on `grades.component_id` never fires through this path.
func (s *Service) DeleteComponent(ctx context.Context, tenantID, componentID, actorID uuid.UUID, canManageAny bool) error {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return err
	}
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
		hasGrades, err := s.repo.ComponentHasGrades(ctx, tenantID, componentID)
		if err != nil {
			return err
		}
		if hasGrades {
			return domain.ErrComponentHasGrades
		}
		return s.repo.DeleteComponent(ctx, tenantID, componentID)
	})
}

// ScoreEntry is one student's new score for a component; Score nil deletes
// the grade (grading.go:341-342's "e.Score == nil" clears the row rather
// than treating it as zero).
type ScoreEntry struct {
	StudentUserID uuid.UUID
	Score         *float64
}

// SaveScores writes one component's column and recomputes every affected
// student's report score in the same transaction, so the sheet and the
// report never disagree. Every entry's student must be an active member
// of the component's class (grading.go:325,337-338's classStudentSet
// check).
func (s *Service) SaveScores(ctx context.Context, tenantID, componentID, actorID uuid.UUID, canManageAny bool, entries []ScoreEntry) (Gradebook, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return Gradebook{}, err
	}
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
		members, err := s.classMemberSet(ctx, tenantID, component.AcademicYearID, component.ClassID)
		if err != nil {
			return err
		}
		saved := make([]map[string]any, 0, len(entries))
		for _, e := range entries {
			if !members[e.StudentUserID] {
				return domain.ErrStudentNotInClass
			}
			if e.Score == nil {
				if err := s.repo.DeleteGrade(ctx, tenantID, componentID, e.StudentUserID); err != nil {
					return err
				}
				saved = append(saved, map[string]any{"student_user_id": e.StudentUserID, "score": nil})
				continue
			}
			if !scale.InRange(*e.Score) {
				return domain.ErrScoreOutOfRange
			}
			if _, err := s.repo.UpsertGrade(ctx, tenantID, componentID, e.StudentUserID, scale.Round(*e.Score), actorID); err != nil {
				return err
			}
			saved = append(saved, map[string]any{"student_user_id": e.StudentUserID, "score": scale.Round(*e.Score)})
		}
		if err := audit.Record(ctx, tenantID, "grading.score_save", "assessment_component", componentID, nil, map[string]any{"entries": saved}); err != nil {
			return err
		}
		if err := s.recomputeReportScores(ctx, tenantID, component.AcademicYearID, component.TermID, component.ClassID, component.SubjectID, scale); err != nil {
			return err
		}
		out, err = s.gradebookInTx(ctx, tenantID, component.AcademicYearID, component.TermID, component.ClassID, component.SubjectID, scale)
		return err
	})
	return out, err
}

// classMemberSet is the active-enrollment lookup SaveScores and GiveStar
// both need before trusting a student ID from the request body.
func (s *Service) classMemberSet(ctx context.Context, tenantID, yearID, classID uuid.UUID) (map[uuid.UUID]bool, error) {
	ids, err := s.repo.ClassStudentIDs(ctx, tenantID, yearID, classID)
	if err != nil {
		return nil, err
	}
	set := make(map[uuid.UUID]bool, len(ids))
	for _, id := range ids {
		set[id] = true
	}
	return set, nil
}

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
		if kktp, ok := domain.WeightedKKTPAverage(components, row); ok {
			rounded := scale.Round(kktp)
			student.FinalKKTP = &rounded
		}
		if final, ok := finals[id]; ok {
			value := final
			student.ReportScore = &value
		}
		out = append(out, student)
	}
	return out, nil
}
