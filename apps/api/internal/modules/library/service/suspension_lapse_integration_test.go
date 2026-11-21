package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// suspendForThreeDays records a manual damage violation with a 3-day
// suspension at 09:00 WITA on Monday 14 Dec 2026: the member is suspended
// through Thursday 17 Dec and may borrow again on Friday 18 Dec.
func suspendForThreeDays(t *testing.T, ctx context.Context, svc *service.Service, w witaWorld) domain.Violation {
	t.Helper()
	violation, err := svc.CreateViolation(at(t, ctx, "2026-12-14T01:00:00Z"), w.tenantID, service.CreateViolationInput{
		MemberUserID: w.memberID, Kind: domain.ViolationDamaged, Penalty: domain.PenaltySuspend, SuspendDays: 3, CreatedBy: w.memberID,
	})
	require.NoError(t, err)
	member, err := svc.GetMember(at(t, ctx, "2026-12-14T01:00:00Z"), w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.MemberSuspended, member.Status)
	require.NotNil(t, member.SuspendedUntil)
	require.Equal(t, "2026-12-17", member.SuspendedUntil.Format(time.DateOnly))
	return violation
}

// TestSettlingARunningSuspensionDoesNotLiftIt marks a suspension done while
// it still runs: the member stays suspended through its last day, so the
// settle dialog may not promise a reactivation. The day after, every read
// shows the member active, without anyone settling anything again, and the
// change is stored, as the desk would already lend to them.
func TestSettlingARunningSuspensionDoesNotLiftIt(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 1)
	svc := newCirculationService(pg.AppPool)
	violation := suspendForThreeDays(t, ctx, svc, w)

	settled, err := svc.SettleViolation(at(t, ctx, "2026-12-15T01:00:00Z"), w.tenantID, violation.ID, domain.ViolationPaid, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.ViolationPaid, settled.Status)

	lastDay := at(t, ctx, "2026-12-17T08:00:00Z") // 16:00 WITA on Thursday 17 Dec
	member, err := svc.GetMember(lastDay, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.MemberSuspended, member.Status, "settling does not lift a suspension still running")
	require.Equal(t, "2026-12-17", member.SuspendedUntil.Format(time.DateOnly))
	_, err = svc.Borrow(lastDay, w.tenantID, service.BorrowInput{
		Barcode: w.barcodes[0], MemberUserID: w.memberID, CheckedOutBy: w.memberID, Channel: domain.ChannelDesk,
	})
	require.ErrorIs(t, err, domain.ErrMemberSuspended)

	// 07:30 WITA on Friday 18 Dec, still Thursday in UTC: the school's day
	// decides, so the suspension is over.
	dayAfter := at(t, ctx, "2026-12-17T23:30:00Z")
	member, err = svc.GetMember(dayAfter, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.MemberActive, member.Status)
	require.Nil(t, member.SuspendedUntil)

	var stored string
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select status from library_members where tenant_id = $1 and user_id = $2`, w.tenantID, w.memberID).Scan(&stored))
	require.Equal(t, "active", stored, "the end of the suspension is stored, not only shown")

	w.borrow(t, dayAfter, svc, w.barcodes[0])
}

// TestLapsedSuspensionReadsActiveEverywhere leaves a suspension's violation
// unsettled: once its window has passed the member is active on every
// screen that shows the status -- the member list (and its status filter),
// the reader's own page, the dashboard and the members report -- exactly
// when EligibleToBorrow lends again.
func TestLapsedSuspensionReadsActiveEverywhere(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 0)
	svc := newCirculationService(pg.AppPool)
	suspendForThreeDays(t, ctx, svc, w)

	lastDay := at(t, ctx, "2026-12-17T01:00:00Z")
	suspended, err := svc.ListMembers(lastDay, w.tenantID, service.ListMembersInput{Status: string(domain.MemberSuspended)})
	require.NoError(t, err)
	require.Len(t, suspended, 1, "still suspended on its last day")

	dayAfter := at(t, ctx, "2026-12-18T01:00:00Z")
	suspended, err = svc.ListMembers(dayAfter, w.tenantID, service.ListMembersInput{Status: string(domain.MemberSuspended)})
	require.NoError(t, err)
	require.Empty(t, suspended, "the status filter no longer lists a finished suspension")
	active, err := svc.ListMembers(dayAfter, w.tenantID, service.ListMembersInput{Status: string(domain.MemberActive)})
	require.NoError(t, err)
	require.Len(t, active, 1)
	require.Nil(t, active[0].SuspendedUntil)

	profile, err := svc.MyProfile(dayAfter, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.NotNil(t, profile.Member)
	require.Equal(t, domain.MemberActive, profile.Member.Status)

	dashboard, err := svc.Dashboard(dayAfter, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 1, dashboard.Summary.ActiveMembers)
	report, err := svc.MembersReport(dayAfter, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 1, report.Active)

	violations, err := svc.ListViolationsForMember(ctx, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Len(t, violations, 1)
	require.Equal(t, domain.ViolationUnpaid, violations[0].Status, "the violation itself is left for staff to settle")
}

// TestOpenEndedSuspensionIsNeverEndedByDate keeps a suspension with no end
// date (staff suspended the member by hand) in place however much time
// passes: only staff lift it.
func TestOpenEndedSuspensionIsNeverEndedByDate(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 0)
	svc := newCirculationService(pg.AppPool)

	_, err := svc.UpdateMemberStatus(ctx, w.tenantID, w.memberID, domain.MemberSuspended)
	require.NoError(t, err)

	member, err := svc.GetMember(at(t, ctx, "2027-06-01T01:00:00Z"), w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.MemberSuspended, member.Status)
	require.Nil(t, member.SuspendedUntil)
}
