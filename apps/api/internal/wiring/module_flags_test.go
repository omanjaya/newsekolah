package wiring

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	reportsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
)

// fakeFlags turns off the modules listed for any tenant, or fails every
// lookup when err is set.
type fakeFlags struct {
	off   map[string]bool
	err   error
	calls int
}

func (f *fakeFlags) IsModuleEnabled(_ context.Context, _ uuid.UUID, module string) (bool, error) {
	f.calls++
	if f.err != nil {
		return false, f.err
	}
	return !f.off[module], nil
}

func TestLateBoundFlagsReadsEnabledUntilBound(t *testing.T) {
	ctx := context.Background()
	var late LateBoundFlags
	on, err := late.IsModuleEnabled(ctx, uuid.New(), "library")
	require.NoError(t, err)
	require.True(t, on, "unbound: opt-out default")

	late.Bind(&fakeFlags{off: map[string]bool{"library": true}})
	on, err = late.IsModuleEnabled(ctx, uuid.New(), "library")
	require.NoError(t, err)
	require.False(t, on)

	var nilLate *LateBoundFlags
	on, err = nilLate.IsModuleEnabled(ctx, uuid.New(), "library")
	require.NoError(t, err)
	require.True(t, on)
}

func TestModuleFlagFixesTheModule(t *testing.T) {
	ctx := context.Background()
	flags := &fakeFlags{off: map[string]bool{"permits": true}}

	on, err := ModuleFlag{Flags: flags, Module: platformdomain.ModulePermits}.IsModuleEnabled(ctx, uuid.New())
	require.NoError(t, err)
	require.False(t, on)
	on, err = ModuleFlag{Flags: flags, Module: platformdomain.ModuleLibrary}.IsModuleEnabled(ctx, uuid.New())
	require.NoError(t, err)
	require.True(t, on)
	on, err = ModuleFlag{Module: platformdomain.ModulePermits}.IsModuleEnabled(ctx, uuid.New())
	require.NoError(t, err)
	require.True(t, on, "no reader wired: on")
}

type recordingViolations struct{ calls int }

func (r *recordingViolations) ReplaceSessionViolations(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, []uuid.UUID, time.Time, uuid.UUID) error {
	r.calls++
	return nil
}

func TestDisciplineSessionViolationsSkipsWhileDisciplineIsOff(t *testing.T) {
	ctx := context.Background()
	call := func(d DisciplineSessionViolations) error {
		return d.ReplaceSessionViolations(ctx, uuid.New(), uuid.New(), uuid.New(), []uuid.UUID{uuid.New()}, time.Now(), uuid.New())
	}

	recorder := &recordingViolations{}
	require.NoError(t, call(DisciplineSessionViolations{Recorder: recorder, Flags: &fakeFlags{off: map[string]bool{"discipline": true}}}))
	require.Zero(t, recorder.calls, "discipline off: not even an empty replace reaches discipline")

	require.NoError(t, call(DisciplineSessionViolations{Recorder: recorder, Flags: &fakeFlags{}}))
	require.Equal(t, 1, recorder.calls)

	require.NoError(t, call(DisciplineSessionViolations{Recorder: recorder}))
	require.Equal(t, 2, recorder.calls, "no reader wired: forwarded")

	boom := errors.New("flag store down")
	require.ErrorIs(t, call(DisciplineSessionViolations{Recorder: recorder, Flags: &fakeFlags{err: boom}}), boom)
	require.Equal(t, 2, recorder.calls)
}

type fakePermitsQueues struct{ calls int }

func (f *fakePermitsQueues) CountLeaveRequestsForReview(context.Context, uuid.UUID, uuid.UUID) (int, error) {
	f.calls++
	return 3, nil
}

func (f *fakePermitsQueues) CountExitPermitsForApproval(context.Context, uuid.UUID, uuid.UUID) (int, error) {
	f.calls++
	return 2, nil
}

func (f *fakePermitsQueues) CountLateArrivalsForReview(context.Context, uuid.UUID, uuid.UUID) (int, error) {
	f.calls++
	return 1, nil
}

func TestInboxPermitsCountsZeroWhilePermitsIsOff(t *testing.T) {
	ctx := context.Background()
	tenantID, userID := uuid.New(), uuid.New()
	counts := func(p InboxPermits) [3]int {
		leave, err := p.CountLeaveRequestsForReview(ctx, tenantID, userID)
		require.NoError(t, err)
		exit, err := p.CountExitPermitsForApproval(ctx, tenantID, userID)
		require.NoError(t, err)
		late, err := p.CountLateArrivalsForReview(ctx, tenantID, userID)
		require.NoError(t, err)
		return [3]int{leave, exit, late}
	}

	queues := &fakePermitsQueues{}
	require.Equal(t, [3]int{}, counts(InboxPermits{Queues: queues, Flags: &fakeFlags{off: map[string]bool{"permits": true}}}))
	require.Zero(t, queues.calls, "permits off: its queues are never queried")
	require.Equal(t, [3]int{3, 2, 1}, counts(InboxPermits{Queues: queues, Flags: &fakeFlags{}}))
	require.Equal(t, [3]int{3, 2, 1}, counts(InboxPermits{Queues: queues}))

	boom := errors.New("flag store down")
	_, err := InboxPermits{Queues: queues, Flags: &fakeFlags{err: boom}}.CountLeaveRequestsForReview(ctx, tenantID, userID)
	require.ErrorIs(t, err, boom)
}

func TestInboxWarningLettersCountsZeroWhileDisciplineIsOff(t *testing.T) {
	// Svc is nil: reaching it would panic, proving discipline is never
	// queried while it is off.
	n, err := InboxWarningLetters{Flags: &fakeFlags{off: map[string]bool{"discipline": true}}}.CountDueSPCandidates(context.Background(), uuid.New())
	require.NoError(t, err)
	require.Zero(t, n)
}

// TestReportsModuleNamesAreRealModules guards the module names the reports
// module hard-codes (it cannot import the platform module) against drifting
// from the platform's own list.
func TestReportsModuleNamesAreRealModules(t *testing.T) {
	require.True(t, platformdomain.Module(reportsservice.ModuleKey).Valid())
	for _, def := range reportsservice.Catalog() {
		source := reportsservice.SourceModule(def.Kind)
		if source == "" {
			continue
		}
		require.True(t, platformdomain.Module(source).Valid(), "%s reads unknown module %q", def.Kind, source)
	}
}
