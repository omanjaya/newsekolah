package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

type fakePerms struct {
	set authz.Set
	err error
}

func (f fakePerms) EffectivePermissions(context.Context, uuid.UUID, uuid.UUID) (authz.Set, error) {
	return f.set, f.err
}

// fakeCounter records whether it was asked, so gating can be asserted as
// "the owning module is never queried" and not only "the number is 0".
type fakeCounter struct {
	n      int
	err    error
	called bool
}

func (f *fakeCounter) hit() (int, error) { f.called = true; return f.n, f.err }

type leaveFake struct{ *fakeCounter }

func (f leaveFake) CountLeaveRequestsForReview(context.Context, uuid.UUID, uuid.UUID) (int, error) {
	return f.hit()
}

type exitFake struct{ *fakeCounter }

func (f exitFake) CountExitPermitsForApproval(context.Context, uuid.UUID, uuid.UUID) (int, error) {
	return f.hit()
}

type lateFake struct{ *fakeCounter }

func (f lateFake) CountLateArrivalsForReview(context.Context, uuid.UUID, uuid.UUID) (int, error) {
	return f.hit()
}

type warningFake struct{ *fakeCounter }

func (f warningFake) CountDueSPCandidates(context.Context, uuid.UUID) (int, error) { return f.hit() }

type rig struct {
	svc                         *Service
	leave, exit, late, warnings *fakeCounter
}

func newRig(perms fakePerms) rig {
	r := rig{
		leave: &fakeCounter{n: 3}, exit: &fakeCounter{n: 2}, late: &fakeCounter{n: 4}, warnings: &fakeCounter{n: 5},
	}
	r.svc = New(perms, leaveFake{r.leave}, exitFake{r.exit}, lateFake{r.late}, warningFake{r.warnings})
	return r
}

func caller() Caller { return Caller{TenantID: uuid.New(), UserID: uuid.New()} }

func TestCountsSumsEveryQueueTheCallerHoldsThePermissionFor(t *testing.T) {
	r := newRig(fakePerms{set: authz.NewSet(authz.PermReviewLeaveRequests, authz.PermIssueWarningLetters)})

	got, err := r.svc.Counts(context.Background(), caller())

	require.NoError(t, err)
	require.Equal(t, Counts{Leave: 3, Exit: 2, Late: 4, WarningLetters: 5}, got)
	require.Equal(t, 14, got.Total())
}

func TestCountsGatedQueuesAreZeroAndNeverQueried(t *testing.T) {
	r := newRig(fakePerms{set: authz.NewSet()})

	got, err := r.svc.Counts(context.Background(), caller())

	require.NoError(t, err)
	require.Equal(t, 0, got.Leave, "no review_leave_requests")
	require.Equal(t, 0, got.WarningLetters, "no issue_warning_letters")
	require.False(t, r.leave.called)
	require.False(t, r.warnings.called)
	// Exit and late queues are open to any authenticated caller and scoped
	// inside their own queries, exactly like their list endpoints.
	require.True(t, r.exit.called)
	require.True(t, r.late.called)
	require.Equal(t, 6, got.Total())
}

func TestCountsEachPermissionGatesOnlyItsOwnQueue(t *testing.T) {
	t.Run("leave only", func(t *testing.T) {
		r := newRig(fakePerms{set: authz.NewSet(authz.PermReviewLeaveRequests)})
		got, err := r.svc.Counts(context.Background(), caller())
		require.NoError(t, err)
		require.Equal(t, 3, got.Leave)
		require.Equal(t, 0, got.WarningLetters)
	})
	t.Run("warning letters only", func(t *testing.T) {
		r := newRig(fakePerms{set: authz.NewSet(authz.PermIssueWarningLetters)})
		got, err := r.svc.Counts(context.Background(), caller())
		require.NoError(t, err)
		require.Equal(t, 0, got.Leave)
		require.Equal(t, 5, got.WarningLetters)
	})
}

func TestCountsAPIKeyCapNarrowsOwnerPermissions(t *testing.T) {
	r := newRig(fakePerms{set: authz.NewSet(authz.PermReviewLeaveRequests, authz.PermIssueWarningLetters)})
	capped := authz.NewSet(authz.PermReviewLeaveRequests)
	c := caller()
	c.KeyPermissions = &capped

	got, err := r.svc.Counts(context.Background(), c)

	require.NoError(t, err)
	require.Equal(t, 3, got.Leave)
	require.Equal(t, 0, got.WarningLetters, "the key was not granted issue_warning_letters")
	require.False(t, r.warnings.called)
}

func TestCountsPropagatesErrorsInsteadOfPartialNumbers(t *testing.T) {
	boom := errors.New("db down")

	t.Run("permissions", func(t *testing.T) {
		r := newRig(fakePerms{err: boom})
		_, err := r.svc.Counts(context.Background(), caller())
		require.ErrorIs(t, err, boom)
	})
	t.Run("a queue", func(t *testing.T) {
		r := newRig(fakePerms{set: authz.NewSet(authz.PermReviewLeaveRequests, authz.PermIssueWarningLetters)})
		r.late.err = boom
		_, err := r.svc.Counts(context.Background(), caller())
		require.ErrorIs(t, err, boom)
	})
}
