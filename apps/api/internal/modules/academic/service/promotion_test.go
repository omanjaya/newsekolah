package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

// fakeEnrollment models one enrollments row for fakePromotionRepo: enough
// state to make ListPromotionCandidates and CloseEnrollment behave like
// the real query, without a database.
type fakeEnrollment struct {
	status  string
	classID uuid.UUID
	student uuid.UUID
}

// fakePromotionRepo is an in-memory promotionRepository: a fixed grade and
// class catalog, plus a mutable set of enrollments so commitPromotionPlan
// can be run twice and observed to only act the first time.
type fakePromotionRepo struct {
	enrollments map[uuid.UUID]*fakeEnrollment
	byYear      map[uuid.UUID][]uuid.UUID
	classInfo   map[uuid.UUID]domain.PromotionCandidate // by classID: grade level/sequence/track carried by that class
	targets     map[uuid.UUID][]domain.TargetClass
	levels      []domain.GradeLevel
}

func (f *fakePromotionRepo) ListPromotionCandidates(_ context.Context, _, yearID uuid.UUID) ([]domain.PromotionCandidate, error) {
	var out []domain.PromotionCandidate
	for _, id := range f.byYear[yearID] {
		e := f.enrollments[id]
		if e.status != domain.EnrollmentStatusActive {
			continue
		}
		info := f.classInfo[e.classID]
		out = append(out, domain.PromotionCandidate{
			StudentUserID: e.student, EnrollmentID: id, FromClassID: e.classID,
			GradeLevelID: info.GradeLevelID, GradeSequence: info.GradeSequence, TrackID: info.TrackID,
		})
	}
	return out, nil
}

func (f *fakePromotionRepo) ListClassesForYear(_ context.Context, _, yearID uuid.UUID) ([]domain.TargetClass, error) {
	return f.targets[yearID], nil
}

func (f *fakePromotionRepo) ListGradeLevels(context.Context, uuid.UUID) ([]domain.GradeLevel, error) {
	return f.levels, nil
}

func (f *fakePromotionRepo) CloseEnrollment(_ context.Context, _ uuid.UUID, id uuid.UUID, status string, _ time.Time) (domain.Enrollment, error) {
	e := f.enrollments[id]
	e.status = status
	return domain.Enrollment{ID: id, Status: status}, nil
}

func (f *fakePromotionRepo) CreateEnrollment(_ context.Context, _, yearID, studentID, classID uuid.UUID, joinedOn time.Time) (domain.Enrollment, error) {
	id := uuid.New()
	f.enrollments[id] = &fakeEnrollment{status: domain.EnrollmentStatusActive, classID: classID, student: studentID}
	f.byYear[yearID] = append(f.byYear[yearID], id)
	return domain.Enrollment{ID: id, AcademicYearID: yearID, StudentUserID: studentID, ClassID: classID, Status: domain.EnrollmentStatusActive, JoinedOn: joinedOn}, nil
}

// TestCommitPromotionIsIdempotent proves that committing the same
// (fromYear, toYear) promotion twice only acts once: the second commit
// finds no active candidates left in the source year (the first commit
// already closed them) and applies nothing.
func TestCommitPromotionIsIdempotent(t *testing.T) {
	tenantID := uuid.New()
	fromYear, toYear := uuid.New(), uuid.New()
	gradeX, gradeXI := uuid.New(), uuid.New()
	fromClass, toClass := uuid.New(), uuid.New()
	student := uuid.New()
	enrollmentID := uuid.New()

	repo := &fakePromotionRepo{
		enrollments: map[uuid.UUID]*fakeEnrollment{
			enrollmentID: {status: domain.EnrollmentStatusActive, classID: fromClass, student: student},
		},
		byYear: map[uuid.UUID][]uuid.UUID{fromYear: {enrollmentID}},
		classInfo: map[uuid.UUID]domain.PromotionCandidate{
			fromClass: {GradeLevelID: gradeX, GradeSequence: 1},
		},
		targets: map[uuid.UUID][]domain.TargetClass{
			toYear: {{ClassID: toClass, GradeLevelID: gradeXI}},
		},
		levels: []domain.GradeLevel{
			{ID: gradeX, Sequence: 1}, {ID: gradeXI, Sequence: 2},
		},
	}

	effectiveOn := date("2026-07-01")

	first, err := commitPromotionPlan(context.Background(), repo, tenantID, fromYear, toYear, nil, effectiveOn)
	require.NoError(t, err)
	require.Len(t, first.Applied, 1)
	require.Empty(t, first.Skipped)
	require.Equal(t, domain.PromotionActionPromote, first.Applied[0].Action)

	second, err := commitPromotionPlan(context.Background(), repo, tenantID, fromYear, toYear, nil, effectiveOn)
	require.NoError(t, err)
	require.Empty(t, second.Applied, "re-running a committed promotion must not act again")
	require.Empty(t, second.Skipped)

	require.Equal(t, domain.EnrollmentStatusMoved, repo.enrollments[enrollmentID].status)
	require.Len(t, repo.byYear[toYear], 1, "the student must have exactly one enrollment in the destination year")
}

func date(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}
