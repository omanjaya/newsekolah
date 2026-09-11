package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
)

// fakeHomeroomDutyRepo embeds the (nil) Repository interface so it
// satisfies every method endActiveHomeroomAssignment's tests do not call.
// It records every UpdateDutyAssignmentRecord call so a test can assert
// whether the previous active assignment was ended.
type fakeHomeroomDutyRepo struct {
	Repository
	activeID  uuid.UUID
	hasActive bool

	updatedID       uuid.UUID
	updatedIsActive bool
	updatedEndsOn   *time.Time
	updateCalls     int
}

func (f *fakeHomeroomDutyRepo) FindActiveAssignmentForClass(_ context.Context, _, _, _, _ uuid.UUID) (uuid.UUID, bool, error) {
	return f.activeID, f.hasActive, nil
}

func (f *fakeHomeroomDutyRepo) UpdateDutyAssignmentRecord(_ context.Context, _, id uuid.UUID, isActive bool, endsOn *time.Time) error {
	f.updateCalls++
	f.updatedID, f.updatedIsActive, f.updatedEndsOn = id, isActive, endsOn
	return nil
}

// TestEndActiveHomeroomAssignmentEndsThePrevious proves CreateDutyAssignment's
// helper ends a class's existing active "homeroom" duty before a new one is
// created, so classes.homeroom_teacher_id (kept in sync by syncClassHomeroom
// from the newly created row) never has two active duty rows behind it --
// mirroring academic/service.syncHomeroomDuty for the direct class-form edit
// path.
func TestEndActiveHomeroomAssignmentEndsThePrevious(t *testing.T) {
	tenantID, yearID, classID := uuid.New(), uuid.New(), uuid.New()
	existingID := uuid.New()
	dutyType := DutyTypeRecord{ID: uuid.New(), Slug: homeroomDutySlug}
	startsOn := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	in := DutyAssignmentRecord{
		AcademicYearID: yearID,
		ScopeClassID:   uuid.NullUUID{UUID: classID, Valid: true},
		StartsOn:       startsOn,
	}

	repo := &fakeHomeroomDutyRepo{activeID: existingID, hasActive: true}
	svc := &Service{repo: repo}

	require.NoError(t, svc.endActiveHomeroomAssignment(context.Background(), tenantID, dutyType, in))
	require.Equal(t, 1, repo.updateCalls)
	require.Equal(t, existingID, repo.updatedID)
	require.False(t, repo.updatedIsActive)
	require.NotNil(t, repo.updatedEndsOn)
	require.True(t, startsOn.Equal(*repo.updatedEndsOn))
}

// TestEndActiveHomeroomAssignmentSkipsNonHomeroomDuty proves the helper is
// a no-op for any duty type other than "homeroom" -- only the homeroom
// duty backs classes.homeroom_teacher_id, so nothing needs to be ended for
// e.g. counselor or picket duties, even when the same class is scoped.
func TestEndActiveHomeroomAssignmentSkipsNonHomeroomDuty(t *testing.T) {
	tenantID, yearID, classID := uuid.New(), uuid.New(), uuid.New()
	dutyType := DutyTypeRecord{ID: uuid.New(), Slug: "counselor"}
	in := DutyAssignmentRecord{
		AcademicYearID: yearID,
		ScopeClassID:   uuid.NullUUID{UUID: classID, Valid: true},
		StartsOn:       time.Now(),
	}

	repo := &fakeHomeroomDutyRepo{activeID: uuid.New(), hasActive: true}
	svc := &Service{repo: repo}

	require.NoError(t, svc.endActiveHomeroomAssignment(context.Background(), tenantID, dutyType, in))
	require.Zero(t, repo.updateCalls, "a non-homeroom duty type must never end an existing assignment")
}

// TestEndActiveHomeroomAssignmentNoOpWhenNoneActive proves the helper
// leaves nothing to do when the class has no active homeroom duty yet --
// the ordinary case of assigning a class's first homeroom teacher.
func TestEndActiveHomeroomAssignmentNoOpWhenNoneActive(t *testing.T) {
	tenantID, yearID, classID := uuid.New(), uuid.New(), uuid.New()
	dutyType := DutyTypeRecord{ID: uuid.New(), Slug: homeroomDutySlug}
	in := DutyAssignmentRecord{
		AcademicYearID: yearID,
		ScopeClassID:   uuid.NullUUID{UUID: classID, Valid: true},
		StartsOn:       time.Now(),
	}

	repo := &fakeHomeroomDutyRepo{hasActive: false}
	svc := &Service{repo: repo}

	require.NoError(t, svc.endActiveHomeroomAssignment(context.Background(), tenantID, dutyType, in))
	require.Zero(t, repo.updateCalls)
}

// fakeScopeTargetRepo embeds the (nil) Repository interface so it
// satisfies every method checkScopeTargetsExist's tests do not call.
type fakeScopeTargetRepo struct {
	Repository
	classInYear   bool
	activeStudent bool
}

func (f fakeScopeTargetRepo) ClassExistsInYear(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) (bool, error) {
	return f.classInYear, nil
}

func (f fakeScopeTargetRepo) IsActiveStudent(context.Context, uuid.UUID, uuid.UUID) (bool, error) {
	return f.activeStudent, nil
}

// TestCheckScopeTargetsExistRejectsInactiveStudent proves a student-scope
// duty assignment (e.g. a permit exemption scoped to one student) is
// refused when the target id is not an active user with a student
// profile -- UserExistsInTenant used to accept any user row at all,
// unlike the strict IsActiveTeacherOrStaff check already applied to the
// assignee.
func TestCheckScopeTargetsExistRejectsInactiveStudent(t *testing.T) {
	tenantID := uuid.New()
	in := DutyAssignmentRecord{ScopeStudentID: uuid.NullUUID{UUID: uuid.New(), Valid: true}}

	svc := &Service{repo: fakeScopeTargetRepo{activeStudent: false}}
	err := svc.checkScopeTargetsExist(context.Background(), tenantID, in)
	require.ErrorIs(t, err, domain.ErrScopeTargetNotFound)

	svc = &Service{repo: fakeScopeTargetRepo{activeStudent: true}}
	require.NoError(t, svc.checkScopeTargetsExist(context.Background(), tenantID, in))
}
