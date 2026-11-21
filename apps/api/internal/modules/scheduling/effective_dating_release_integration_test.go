package scheduling_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	schedulehttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// The school-wide list says what a manager's cancel would free, and only
// when it frees something: the confirmation used to promise an earlier
// change date for every request, even one on the lesson's first date, one
// behind a later session or request, or one on a lesson that ends before
// any date it could free. The date it names is the one the editor offers
// once the request is cancelled.
func TestSubstitutionListSaysWhatCancellingFrees(t *testing.T) {
	w := newEffectiveWorld(t, "effective-hold-frees")
	publisher := &spyPublisher{}
	request := func(sched domain.Schedule, date string) domain.Substitution {
		t.Helper()
		created, err := w.svc.RequestSubstitution(w.ctx, w.tenant, sched.ID, mustParseDate(t, date), sched.TeacherUserID, w.t3, "", publisher)
		require.NoError(t, err)
		return created
	}
	startingOn := func(in service.ScheduleInput, date string) domain.Schedule {
		in.EffectiveFrom = datePtr(t, date)
		return w.create(in)
	}

	// The only hold on a lesson taught since the year began.
	monday := w.create(w.lesson(w.classA, w.t1, 1, w.p1))
	holds := request(monday, "2026-11-02")
	// Behind a session recorded on a later date.
	tuesday := w.create(w.lesson(w.classA, w.t1, 2, w.p1))
	behindSession := request(tuesday, "2026-10-06")
	w.recordSession(tuesday, "2026-10-13")
	// A two-period block: the later request on the other row holds it.
	wedFirst := w.create(w.lesson(w.classA, w.t1, 3, w.p1))
	wedSecond := w.create(w.lesson(w.classA, w.t1, 3, w.p2))
	behindOtherRow := request(wedFirst, "2026-10-07")
	holdsBlock := request(wedSecond, "2026-10-14")
	// On the lesson's first date, which binds that date anyway.
	thursday := startingOn(w.lesson(w.classA, w.t1, 4, w.p1), "2026-09-24")
	firstDate := request(thursday, "2026-09-24")
	// On a lesson removed from the day after it: locked either way.
	friday := startingOn(w.lesson(w.classA, w.t1, 5, w.p1), "2026-09-25")
	lastDate := request(friday, "2026-09-25")
	require.NoError(t, w.svc.DeleteScheduleBlock(w.ctx, w.tenant, friday.ID, []uuid.UUID{friday.ID}, datePtr(t, "2026-09-26"), w.actor))
	// The same on a lesson taught since the year began: cancelling
	// unlocks it.
	unlocks := w.create(w.lesson(w.classB, w.t2, 5, w.p1))
	unlocking := request(unlocks, "2026-10-02")
	require.NoError(t, w.svc.DeleteScheduleBlock(w.ctx, w.tenant, unlocks.ID, []uuid.UUID{unlocks.ID}, datePtr(t, "2026-10-03"), w.actor))
	manager := service.Actor{CanManage: true, UserID: w.t2}
	require.ErrorIs(t, w.svc.MutationPolicyFor(w.ctx, w.tenant, w.get(unlocks.ID), manager).Reason, domain.ErrScheduleChangeBeforeHistory)
	// A request a manager cannot cancel frees nothing either.
	rejected := request(w.create(w.lesson(w.classB, w.t2, 1, w.p1)), "2026-09-21")
	_, err := w.svc.RespondSubstitution(w.ctx, w.tenant, rejected.ID, w.t3, false, "", publisher)
	require.NoError(t, err)

	listed, err := w.svc.ListSubstitutionsAll(w.ctx, w.tenant, nil)
	require.NoError(t, err)
	frees := map[uuid.UUID]*time.Time{}
	for _, row := range listed {
		frees[row.ID] = row.ReleaseFrom
	}
	require.Len(t, frees, 8)
	require.Equal(t, &w.today, frees[holds.ID])
	require.Nil(t, frees[behindSession.ID], "the session on 13 October still holds the date")
	require.Nil(t, frees[behindOtherRow.ID], "the block's other row is held later")
	require.Equal(t, datePtr(t, "2026-10-08"), frees[holdsBlock.ID], "the block is then held by the 7 October request")
	require.Nil(t, frees[firstDate.ID], "the lesson's first date binds the date by itself")
	require.Nil(t, frees[lastDate.ID], "the lesson ends before any date it could free")
	require.Equal(t, &w.today, frees[unlocking.ID])
	require.Nil(t, frees[rejected.ID])

	// Through the API, and the promise holds once the request is cancelled.
	asManager := schedulehttp.New(w.svc, fullAccessPermissions{}, publisher)
	resp, err := asManager.ListSubstitutions(httpx.WithUserID(w.ctx, w.t2), api.ListSubstitutionsRequestObject{
		Params: api.ListSubstitutionsParams{Direction: api.ListSubstitutionsParamsDirectionAll},
	})
	require.NoError(t, err)
	seen := 0
	for _, row := range resp.(api.ListSubstitutions200JSONResponse).Data {
		switch row.Id {
		case holdsBlock.ID:
			require.NotNil(t, row.ReleaseFreesFrom)
			require.Equal(t, "2026-10-08", row.ReleaseFreesFrom.Format("2006-01-02"))
			seen++
		case behindSession.ID:
			require.Nil(t, row.ReleaseFreesFrom)
			seen++
		}
	}
	require.Equal(t, 2, seen)

	_, err = w.svc.CancelSubstitution(w.ctx, w.tenant, holdsBlock.ID, manager, publisher)
	require.NoError(t, err)
	block := blockOn(w.classWeek(w.classA, "2026-09-16"), 3)
	require.Len(t, block.ScheduleIDs, 2)
	require.Equal(t, mustParseDate(t, "2026-10-08"), *block.Policy.MinEffectiveFrom)
	_, err = w.svc.CancelSubstitution(w.ctx, w.tenant, unlocking.ID, manager, publisher)
	require.NoError(t, err)
	policy := w.svc.MutationPolicyFor(w.ctx, w.tenant, w.get(unlocks.ID), manager)
	require.True(t, policy.CanEdit)
	require.Equal(t, w.today, *policy.MinEffectiveFrom)
}
