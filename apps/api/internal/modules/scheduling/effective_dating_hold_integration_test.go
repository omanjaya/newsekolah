package scheduling_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	schedulehttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// What holds a change back, and how a schedule manager releases it, on
// effective_dating_integration_test.go's world (today is Wednesday 16
// September 2026).

// viewOnlyPermissions is a teacher without manage_schedules.
type viewOnlyPermissions struct{}

func (viewOnlyPermissions) EffectivePermissions(context.Context, uuid.UUID, uuid.UUID) (authz.Set, error) {
	return authz.NewSet(authz.PermViewSchedules), nil
}

// spyPublisher keeps every event the service publishes.
type spyPublisher struct{ events []service.Event }

func (p *spyPublisher) Publish(_ context.Context, evt service.Event) error {
	p.events = append(p.events, evt)
	return nil
}

// A pending substitution request weeks away used to push the earliest
// change date out with nothing on screen saying why, and only its
// requester could withdraw it. The policy and the refusal now name the
// request (kind, id, date, status); a teacher who did not make it still
// cannot cancel it, a schedule manager can, which is audited, tells both
// teachers, and frees the dates it held.
func TestPendingRequestHoldsTheChangeUntilAManagerCancelsIt(t *testing.T) {
	w := newEffectiveWorld(t, "effective-hold")
	monday := w.create(w.lesson(w.classA, w.t1, 1, w.p1))
	w.recordSession(monday, "2026-09-14")
	publisher := &spyPublisher{}
	request, err := w.svc.RequestSubstitution(w.ctx, w.tenant, monday.ID, mustParseDate(t, "2026-11-02"), w.t1, w.t3, "", publisher)
	require.NoError(t, err)

	held := &domain.Hold{
		Kind: domain.HoldSubstitution, ID: request.ID, Date: mustParseDate(t, "2026-11-02"), Status: domain.SubstitutionPending,
	}
	manager := service.Actor{CanManage: true, UserID: w.t2}
	policy := w.svc.MutationPolicyFor(w.ctx, w.tenant, monday, manager)
	require.Equal(t, mustParseDate(t, "2026-11-03"), *policy.MinEffectiveFrom)
	require.Equal(t, held, policy.HeldBy, "the request, not the session already past, holds the date")
	require.Equal(t, held, blockOn(w.classWeek(w.classA, "2026-09-16"), 1).Policy.HeldBy, "the grid says the same")

	swap := w.lesson(w.classA, w.t2, 1, w.p1)
	swap.EffectiveFrom = datePtr(t, "2026-09-21")
	_, err = w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, swap, manager)
	var tooEarly *domain.ChangeTooEarlyError
	require.ErrorAs(t, err, &tooEarly)
	require.Equal(t, held, tooEarly.HeldBy)
	_, err = w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, w.lesson(w.classA, w.t2, 1, w.p1), manager)
	var needsDate *domain.HistoryRequiresDateError
	require.ErrorAs(t, err, &needsDate)
	require.Equal(t, held, needsDate.HeldBy)

	// Through the API: the grid's policy carries held_by, a teacher who
	// is neither the requester nor a manager is refused, a manager is not.
	readCtx := httpx.WithUserID(w.ctx, w.t2)
	asManager := schedulehttp.New(w.svc, fullAccessPermissions{}, publisher)
	asTeacher := schedulehttp.New(w.svc, viewOnlyPermissions{}, publisher)
	asOf := openapi_types.Date{Time: mustParseDate(t, "2026-09-16")}
	listed, err := asManager.ListSchedules(readCtx, api.ListSchedulesRequestObject{
		Params: api.ListSchedulesParams{AcademicYearId: w.year, ClassId: &w.classA, AsOf: &asOf},
	})
	require.NoError(t, err)
	blocks := listed.(api.ListSchedules200JSONResponse).Data
	require.Len(t, blocks, 1)
	require.NotNil(t, blocks[0].MutationPolicy.HeldBy)
	require.Equal(t, api.ScheduleHoldKind("substitution"), blocks[0].MutationPolicy.HeldBy.Kind)
	require.Equal(t, request.ID, blocks[0].MutationPolicy.HeldBy.Id)
	require.Equal(t, "2026-11-02", blocks[0].MutationPolicy.HeldBy.Date.Format("2006-01-02"))
	require.Equal(t, api.ScheduleHoldStatus("pending"), *blocks[0].MutationPolicy.HeldBy.Status)

	_, err = asTeacher.CancelSubstitution(httpx.WithUserID(w.ctx, w.t3), api.CancelSubstitutionRequestObject{SubstitutionId: request.ID})
	require.ErrorIs(t, err, httpx.ErrForbidden, "the substitute answers the request, never withdraws it")
	resp, err := asManager.CancelSubstitution(readCtx, api.CancelSubstitutionRequestObject{SubstitutionId: request.ID})
	require.NoError(t, err)
	require.Equal(t, api.SubstitutionStatus("cancelled"), resp.(api.CancelSubstitution200JSONResponse).Status)

	require.Equal(t, 1, w.count(
		`select count(*) from audit_logs where tenant_id=$1 and action='substitution_request.cancel' and entity_type='substitution_request' and entity_id=$2 and actor_user_id=$3 and before->>'status'='pending' and after->>'status'='cancelled'`,
		w.tenant, request.ID, w.t2))
	cancelled, ok := publisher.events[len(publisher.events)-1].(service.SubstitutionCancelled)
	require.True(t, ok, "the bridge tells both teachers")
	require.Equal(t, w.t2, cancelled.CancelledBy)
	require.True(t, cancelled.ByManager)
	require.Equal(t, w.t1, cancelled.RequesterUserID)
	require.Equal(t, w.t3, cancelled.SubstituteUserID)

	policy = w.svc.MutationPolicyFor(w.ctx, w.tenant, monday, manager)
	require.Equal(t, w.today, *policy.MinEffectiveFrom, "the request no longer holds the date")
	require.Nil(t, policy.HeldBy)
	next, err := w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, swap, manager)
	require.NoError(t, err)
	require.Equal(t, mustParseDate(t, "2026-09-21"), next.EffectiveFrom)
}

// A teacher's own withdrawal is not an admin action: no audit entry, and
// only the substitute is told (CancelledBy is the requester).
func TestRequesterCancelIsNotAudited(t *testing.T) {
	w := newEffectiveWorld(t, "effective-hold-own")
	monday := w.create(w.lesson(w.classA, w.t1, 1, w.p1))
	publisher := &spyPublisher{}
	request, err := w.svc.RequestSubstitution(w.ctx, w.tenant, monday.ID, mustParseDate(t, "2026-09-21"), w.t1, w.t3, "", publisher)
	require.NoError(t, err)

	_, err = w.svc.CancelSubstitution(w.ctx, w.tenant, request.ID, service.Actor{UserID: w.t2}, publisher)
	require.ErrorIs(t, err, domain.ErrSubstitutionNotRequester)
	_, err = w.svc.CancelSubstitution(w.ctx, w.tenant, request.ID, service.Actor{UserID: w.t1}, publisher)
	require.NoError(t, err)
	require.Zero(t, w.count(`select count(*) from audit_logs where tenant_id=$1 and entity_id=$2`, w.tenant, request.ID))
	cancelled, ok := publisher.events[len(publisher.events)-1].(service.SubstitutionCancelled)
	require.True(t, ok)
	require.False(t, cancelled.ByManager)
	require.Equal(t, w.t1, cancelled.CancelledBy)
}

// A schedule manager releases a request still to come, never one already
// past: that one holds no change back (the earliest change date is never
// before today), and cancelling an accepted one would rewrite who taught a
// lesson that is over and take the substitute's access to its session.
// The requester's own withdrawal keeps its rule.
func TestManagerCannotCancelARequestAlreadyPast(t *testing.T) {
	w := newEffectiveWorld(t, "effective-hold-past")
	monday := w.create(w.lesson(w.classA, w.t1, 1, w.p1))
	publisher := &spyPublisher{}
	request := func(date string) domain.Substitution {
		t.Helper()
		created, err := w.svc.RequestSubstitution(w.ctx, w.tenant, monday.ID, mustParseDate(t, date), w.t1, w.t3, "", publisher)
		require.NoError(t, err)
		return created
	}
	accepted := request("2026-09-21")
	_, err := w.svc.RespondSubstitution(w.ctx, w.tenant, accepted.ID, w.t3, true, "", publisher)
	require.NoError(t, err)
	pending := request("2026-09-28")

	// Tuesday 22 September: the accepted substitution on Monday is over.
	tuesday := clock.WithTime(w.ctx, time.Date(2026, 9, 22, 3, 0, 0, 0, time.UTC))
	manager := service.Actor{CanManage: true, UserID: w.t2}
	_, err = w.svc.CancelSubstitution(tuesday, w.tenant, accepted.ID, manager, publisher)
	require.ErrorIs(t, err, domain.ErrSubstitutionCancelPast)
	asManager := schedulehttp.New(w.svc, fullAccessPermissions{}, publisher)
	_, err = asManager.CancelSubstitution(httpx.WithUserID(tuesday, w.t2), api.CancelSubstitutionRequestObject{SubstitutionId: accepted.ID})
	var appErr *httpx.Error
	require.ErrorAs(t, err, &appErr)
	require.Equal(t, 409, appErr.Status)
	require.Equal(t, "SUBSTITUTION_CANCEL_PAST", appErr.Code)
	require.Equal(t, 1, w.count(`select count(*) from substitution_requests where id=$1 and status='accepted'`, accepted.ID),
		"the lesson that took place keeps its substitute")
	require.Zero(t, w.count(`select count(*) from audit_logs where tenant_id=$1 and entity_id=$2`, w.tenant, accepted.ID))

	// A request still ahead, and one on the day itself, the manager may.
	resp, err := asManager.CancelSubstitution(httpx.WithUserID(tuesday, w.t2), api.CancelSubstitutionRequestObject{SubstitutionId: pending.ID})
	require.NoError(t, err)
	require.Equal(t, api.SubstitutionStatus("cancelled"), resp.(api.CancelSubstitution200JSONResponse).Status)
	sameDay := request("2026-10-05")
	onTheDay := clock.WithTime(w.ctx, time.Date(2026, 10, 5, 3, 0, 0, 0, time.UTC))
	_, err = w.svc.CancelSubstitution(onTheDay, w.tenant, sameDay.ID, manager, publisher)
	require.NoError(t, err)

	// The requester still withdraws their own past request.
	_, err = w.svc.CancelSubstitution(tuesday, w.tenant, accepted.ID, service.Actor{UserID: w.t1}, publisher)
	require.NoError(t, err)
}
