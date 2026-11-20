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
// satisfies every method the homeroom helpers' tests do not call. It
// records every EndActiveAssignmentsForClass call and answers
// HoldsDutyForOtherClass from a fixed flag.
type fakeHomeroomDutyRepo struct {
	Repository
	holdsOther bool

	endCalls  int
	endClass  uuid.UUID
	endKeep   uuid.NullUUID
	endsOnArg time.Time
}

func (f *fakeHomeroomDutyRepo) EndActiveAssignmentsForClass(_ context.Context, _, _, _, classID uuid.UUID, keepID uuid.NullUUID, endsOn time.Time) error {
	f.endCalls++
	f.endClass, f.endKeep, f.endsOnArg = classID, keepID, endsOn
	return nil
}

func (f *fakeHomeroomDutyRepo) HoldsDutyForOtherClass(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID, uuid.UUID) (bool, error) {
	return f.holdsOther, nil
}

// TestEndActiveHomeroomAssignmentEndsEveryPreviousHolder proves
// CreateDutyAssignment's helper ends the class's active "homeroom" duty
// rows -- all of them, so duplicates heal -- as of the new holder's start
// date, mirroring academic/service.syncHomeroomDuty for the class form.
func TestEndActiveHomeroomAssignmentEndsEveryPreviousHolder(t *testing.T) {
	tenantID, yearID, classID := uuid.New(), uuid.New(), uuid.New()
	dutyType := DutyTypeRecord{ID: uuid.New(), Slug: homeroomDutySlug}
	startsOn := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	in := DutyAssignmentRecord{
		AcademicYearID: yearID,
		ScopeClassID:   uuid.NullUUID{UUID: classID, Valid: true},
		StartsOn:       startsOn,
	}

	repo := &fakeHomeroomDutyRepo{}
	svc := &Service{repo: repo}

	require.NoError(t, svc.endActiveHomeroomAssignment(context.Background(), tenantID, dutyType, in))
	require.Equal(t, 1, repo.endCalls)
	require.Equal(t, classID, repo.endClass)
	require.False(t, repo.endKeep.Valid, "a new assignment has no row of its own to keep yet")
	require.True(t, startsOn.Equal(repo.endsOnArg))

	// Reactivating a row keeps that row and ends the others.
	in.ID = uuid.New()
	require.NoError(t, svc.endActiveHomeroomAssignment(context.Background(), tenantID, dutyType, in))
	require.Equal(t, uuid.NullUUID{UUID: in.ID, Valid: true}, repo.endKeep)
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

	repo := &fakeHomeroomDutyRepo{}
	svc := &Service{repo: repo}

	require.NoError(t, svc.endActiveHomeroomAssignment(context.Background(), tenantID, dutyType, in))
	require.Zero(t, repo.endCalls, "a non-homeroom duty type must never end an existing assignment")
}

// TestRequireSingleHomeroom refuses a second class for a teacher who is
// already homeroom teacher elsewhere this year, and ignores other duties.
func TestRequireSingleHomeroom(t *testing.T) {
	in := DutyAssignmentRecord{
		AcademicYearID: uuid.New(), UserID: uuid.New(),
		ScopeClassID: uuid.NullUUID{UUID: uuid.New(), Valid: true},
	}
	svc := &Service{repo: &fakeHomeroomDutyRepo{holdsOther: true}}
	require.ErrorIs(t, svc.requireSingleHomeroom(context.Background(), uuid.New(), homeroomDutySlug, uuid.New(), in), domain.ErrTeacherAlreadyHomeroom)
	require.NoError(t, svc.requireSingleHomeroom(context.Background(), uuid.New(), "counselor", uuid.New(), in))

	svc = &Service{repo: &fakeHomeroomDutyRepo{holdsOther: false}}
	require.NoError(t, svc.requireSingleHomeroom(context.Background(), uuid.New(), homeroomDutySlug, uuid.New(), in))
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
