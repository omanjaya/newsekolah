package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

// fakeImportRepo embeds the (nil) Repository interface so it satisfies
// every method evaluate's tests do not call. students is keyed by NIS or
// username (whichever the test row supplies); active controls what
// IsActiveStudent reports for that student's id.
type fakeImportRepo struct {
	Repository
	students map[string]StudentSummary
	active   map[uuid.UUID]bool
	classes  map[string]uuid.UUID
}

func (f fakeImportRepo) FindStudentByNIS(_ context.Context, _ uuid.UUID, nis string) (StudentSummary, error) {
	if s, ok := f.students[nis]; ok {
		return s, nil
	}
	return StudentSummary{}, domain.ErrImportRowInvalid
}

func (f fakeImportRepo) FindStudentByUsername(_ context.Context, _ uuid.UUID, username string) (StudentSummary, error) {
	if s, ok := f.students[username]; ok {
		return s, nil
	}
	return StudentSummary{}, domain.ErrImportRowInvalid
}

func (f fakeImportRepo) IsActiveStudent(_ context.Context, _ uuid.UUID, userID uuid.UUID) (bool, error) {
	return f.active[userID], nil
}

func (f fakeImportRepo) ListClasses(_ context.Context, _, _ uuid.UUID, search string, _ *uuid.UUID, _ Page) ([]domain.Class, int64, error) {
	id, ok := f.classes[search]
	if !ok {
		return nil, 0, nil
	}
	return []domain.Class{{ID: id, Name: search}}, 1, nil
}

func (f fakeImportRepo) GetActiveEnrollment(_ context.Context, _, _, _ uuid.UUID) (domain.Enrollment, error) {
	return domain.Enrollment{}, domain.ErrEnrollmentNotOpen
}

// TestEvaluateImportRowRejectsInactiveStudent proves that an import row
// matching a suspended or inactive student is reported as an error row
// instead of being assigned -- the same rule AssignStudent and
// BulkAssignStudents already enforce via requireActiveStudent.
func TestEvaluateImportRowRejectsInactiveStudent(t *testing.T) {
	tenantID, yearID := uuid.New(), uuid.New()
	classID := uuid.New()
	suspendedID := uuid.New()

	repo := fakeImportRepo{
		students: map[string]StudentSummary{"S001": {ID: suspendedID, Name: "Suspended Student", Username: "suspended"}},
		active:   map[uuid.UUID]bool{suspendedID: false},
		classes:  map[string]uuid.UUID{"X IPA 1": classID},
	}
	svc := &Service{repo: repo}

	row := importRawRow{rowNumber: 2, nis: "S001", className: "X IPA 1"}
	result := svc.evaluate(context.Background(), tenantID, yearID, row)

	require.Equal(t, ImportRowError, result.Action)
	require.NotEmpty(t, result.Message)
	require.Equal(t, uuid.Nil, result.matchedID, "a rejected row must not carry an id to act on")
}

// TestEvaluateImportRowAssignsActiveStudent proves an active student with
// no current enrollment still resolves to an assign action, so the
// active-student check above does not also reject the valid case.
func TestEvaluateImportRowAssignsActiveStudent(t *testing.T) {
	tenantID, yearID := uuid.New(), uuid.New()
	classID := uuid.New()
	activeID := uuid.New()

	repo := fakeImportRepo{
		students: map[string]StudentSummary{"S002": {ID: activeID, Name: "Active Student", Username: "active"}},
		active:   map[uuid.UUID]bool{activeID: true},
		classes:  map[string]uuid.UUID{"X IPA 1": classID},
	}
	svc := &Service{repo: repo}

	row := importRawRow{rowNumber: 2, nis: "S002", className: "X IPA 1"}
	result := svc.evaluate(context.Background(), tenantID, yearID, row)

	require.Equal(t, ImportRowAssign, result.Action)
	require.Equal(t, activeID, result.matchedID)
	require.Equal(t, classID, result.matchedClassID)
}
