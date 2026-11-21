package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
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

// circulationServiceAt is the circulation service on a real clock frozen
// at rfc3339: a request without a simulated time runs at that instant.
func circulationServiceAt(t *testing.T, pool *pgxpool.Pool, rfc3339 string) *service.Service {
	t.Helper()
	instant, err := time.Parse(time.RFC3339, rfc3339)
	require.NoError(t, err)
	return service.New(pool, repository.New(pool), nil, nil, clock.Frozen{At: instant})
}

// storedSuspension is the member's library_members row as stored, read
// past the service so a derived status cannot hide what a call wrote.
func storedSuspension(t *testing.T, ctx context.Context, pool *pgxpool.Pool, w witaWorld) (string, string) {
	t.Helper()
	var status string
	var until *time.Time
	require.NoError(t, pool.QueryRow(ctx,
		`select status, suspended_until from library_members where tenant_id = $1 and user_id = $2`,
		w.tenantID, w.memberID).Scan(&status, &until))
	if until == nil {
		return status, ""
	}
	return status, until.Format(time.DateOnly)
}

// TestSettlingARunningSuspensionDoesNotLiftIt marks a suspension done while
// it still runs, in real time: the member stays suspended through its last
// day, so the settle dialog may not promise a reactivation. The day after,
// every read shows the member active without anyone settling anything
// again and without storing it, and the desk lends to them; that loan, an
// explicit real-time write, stores the end of the suspension.
func TestSettlingARunningSuspensionDoesNotLiftIt(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 1)
	violation := suspendForThreeDays(t, ctx, newCirculationService(pg.AppPool), w)

	settled, err := circulationServiceAt(t, pg.AppPool, "2026-12-15T01:00:00Z").
		SettleViolation(ctx, w.tenantID, violation.ID, domain.ViolationPaid, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.ViolationPaid, settled.Status)

	lastDay := circulationServiceAt(t, pg.AppPool, "2026-12-17T08:00:00Z") // 16:00 WITA on Thursday 17 Dec
	member, err := lastDay.GetMember(ctx, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.MemberSuspended, member.Status, "settling does not lift a suspension still running")
	require.Equal(t, "2026-12-17", member.SuspendedUntil.Format(time.DateOnly))
	_, err = lastDay.Borrow(ctx, w.tenantID, service.BorrowInput{
		Barcode: w.barcodes[0], MemberUserID: w.memberID, CheckedOutBy: w.memberID, Channel: domain.ChannelDesk,
	})
	require.ErrorIs(t, err, domain.ErrMemberSuspended)

	// 07:30 WITA on Friday 18 Dec, still Thursday in UTC: the school's day
	// decides, so the suspension is over.
	dayAfter := circulationServiceAt(t, pg.AppPool, "2026-12-17T23:30:00Z")
	member, err = dayAfter.GetMember(ctx, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.MemberActive, member.Status)
	require.Nil(t, member.SuspendedUntil)
	status, until := storedSuspension(t, ctx, pg.AdminPool, w)
	require.Equal(t, "suspended", status, "a read shows the end of the suspension without storing it")
	require.Equal(t, "2026-12-17", until)

	w.borrow(t, ctx, dayAfter, w.barcodes[0])
	status, until = storedSuspension(t, ctx, pg.AdminPool, w)
	require.Equal(t, "active", status, "a real-time loan stores the end of the suspension it lends on")
	require.Empty(t, until)
}

// TestSimulatedReadLeavesTheSuspensionInPlace is the time simulation
// regression: a superadmin reading the library at a simulated date after a
// suspension's last day sees the member active on every screen (the member
// page, the list and its filter, the reader's own page, the dashboard and
// members report counts, the desk's borrowing status), but nothing is
// stored, so in real time the member is still suspended and the desk still
// refuses them. A real-time read once the window has passed shows them
// active, again without storing it.
func TestSimulatedReadLeavesTheSuspensionInPlace(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 1)
	suspendForThreeDays(t, ctx, newCirculationService(pg.AppPool), w)

	// Real time is Tuesday 15 Dec; the simulation shows Friday 18 Dec.
	realTime := circulationServiceAt(t, pg.AppPool, "2026-12-15T01:00:00Z")
	simulated := at(t, ctx, "2026-12-18T01:30:00Z")

	member, err := realTime.GetMember(simulated, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.MemberActive, member.Status)
	require.Nil(t, member.SuspendedUntil)
	suspended, err := realTime.ListMembers(simulated, w.tenantID, service.ListMembersInput{Status: string(domain.MemberSuspended)})
	require.NoError(t, err)
	require.Empty(t, suspended)
	active, err := realTime.ListMembers(simulated, w.tenantID, service.ListMembersInput{Status: string(domain.MemberActive)})
	require.NoError(t, err)
	require.Len(t, active, 1)
	require.Equal(t, domain.MemberActive, active[0].Status)
	all, err := realTime.ListMembers(simulated, w.tenantID, service.ListMembersInput{})
	require.NoError(t, err)
	require.Len(t, all, 1)
	require.Equal(t, domain.MemberActive, all[0].Status, "the unfiltered list shows the status of the day as well")
	profile, err := realTime.MyProfile(simulated, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.MemberActive, profile.Member.Status)
	dashboard, err := realTime.Dashboard(simulated, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 1, dashboard.Summary.ActiveMembers)
	report, err := realTime.MembersReport(simulated, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 1, report.Active)
	_, err = realTime.GetMemberBorrowingStatus(simulated, w.tenantID, w.memberID)
	require.NoError(t, err)

	status, until := storedSuspension(t, ctx, pg.AdminPool, w)
	require.Equal(t, "suspended", status, "a simulated read stores nothing")
	require.Equal(t, "2026-12-17", until)

	member, err = realTime.GetMember(ctx, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.MemberSuspended, member.Status, "in real time the suspension still runs")
	require.Equal(t, "2026-12-17", member.SuspendedUntil.Format(time.DateOnly))
	suspended, err = realTime.ListMembers(ctx, w.tenantID, service.ListMembersInput{Status: string(domain.MemberSuspended)})
	require.NoError(t, err)
	require.Len(t, suspended, 1)
	profile, err = realTime.MyProfile(ctx, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.MemberSuspended, profile.Member.Status)
	dashboard, err = realTime.Dashboard(ctx, w.tenantID)
	require.NoError(t, err)
	require.Zero(t, dashboard.Summary.ActiveMembers)
	report, err = realTime.MembersReport(ctx, w.tenantID)
	require.NoError(t, err)
	require.Zero(t, report.Active)
	_, err = realTime.Borrow(ctx, w.tenantID, service.BorrowInput{
		Barcode: w.barcodes[0], MemberUserID: w.memberID, CheckedOutBy: w.memberID, Channel: domain.ChannelDesk,
	})
	require.ErrorIs(t, err, domain.ErrMemberSuspended, "the desk still refuses a member suspended in real time")

	later := circulationServiceAt(t, pg.AppPool, "2026-12-18T01:00:00Z")
	member, err = later.GetMember(ctx, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.MemberActive, member.Status, "a real-time read after the window shows the member active")
	require.Nil(t, member.SuspendedUntil)
	active, err = later.ListMembers(ctx, w.tenantID, service.ListMembersInput{Status: string(domain.MemberActive)})
	require.NoError(t, err)
	require.Len(t, active, 1)
	status, _ = storedSuspension(t, ctx, pg.AdminPool, w)
	require.Equal(t, "suspended", status, "a real-time read stores nothing either")
}

// TestSimulatedWritesLeaveTheSuspensionInPlace settles, lends and renews at
// a simulated date after a suspension's last day. Those writes go ahead
// (they are what the tester asked for), but none of them stores the end of
// the suspension, which in real time has not come yet. A renewal in real
// time after the window stores it.
func TestSimulatedWritesLeaveTheSuspensionInPlace(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 3)
	monday := circulationServiceAt(t, pg.AppPool, "2026-12-14T00:30:00Z") // 08:30 WITA, before the suspension
	first := w.borrow(t, ctx, monday, w.barcodes[0])
	second := w.borrow(t, ctx, monday, w.barcodes[1])
	violation := suspendForThreeDays(t, ctx, newCirculationService(pg.AppPool), w)

	realTime := circulationServiceAt(t, pg.AppPool, "2026-12-15T01:00:00Z")
	simulated := at(t, ctx, "2026-12-18T01:30:00Z")
	_, err := realTime.SettleViolation(simulated, w.tenantID, violation.ID, domain.ViolationPaid, w.memberID)
	require.NoError(t, err)
	w.borrow(t, simulated, realTime, w.barcodes[2])
	_, err = realTime.Renew(simulated, w.tenantID, service.RenewInput{LoanID: uuid.NullUUID{UUID: first.ID, Valid: true}}, w.memberID)
	require.NoError(t, err)

	status, until := storedSuspension(t, ctx, pg.AdminPool, w)
	require.Equal(t, "suspended", status, "simulated writes do not end a suspension for real time")
	require.Equal(t, "2026-12-17", until)
	member, err := realTime.GetMember(ctx, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.MemberSuspended, member.Status)

	later := circulationServiceAt(t, pg.AppPool, "2026-12-18T01:00:00Z")
	_, err = later.Renew(ctx, w.tenantID, service.RenewInput{LoanID: uuid.NullUUID{UUID: second.ID, Valid: true}}, w.memberID)
	require.NoError(t, err)
	status, until = storedSuspension(t, ctx, pg.AdminPool, w)
	require.Equal(t, "active", status, "a real-time renewal after the window stores the end of the suspension")
	require.Empty(t, until)
}

// TestRealTimeSettleAfterTheWindowStoresTheEnd settles a suspension's
// violation in real time once its last day has passed: the member is
// stored active again, as the old app reactivated them on such a settle.
func TestRealTimeSettleAfterTheWindowStoresTheEnd(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 0)
	violation := suspendForThreeDays(t, ctx, newCirculationService(pg.AppPool), w)

	_, err := circulationServiceAt(t, pg.AppPool, "2026-12-18T01:00:00Z").
		SettleViolation(ctx, w.tenantID, violation.ID, domain.ViolationWaived, w.memberID)
	require.NoError(t, err)
	status, until := storedSuspension(t, ctx, pg.AdminPool, w)
	require.Equal(t, "active", status)
	require.Empty(t, until)
}

// TestClassLoanPreviewPairsALapsedSuspensionWithoutStoringIt previews a
// class loan at a simulated date after a student's suspension: the student
// is paired, as a desk borrow that day would lend to them, and the stored
// suspension is left as it is.
func TestClassLoanPreviewPairsALapsedSuspensionWithoutStoringIt(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 1)
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}
	var yearID, titleID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select id from academic_years where tenant_id = $1`, w.tenantID).Scan(&yearID))
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select id from library_titles where tenant_id = $1`, w.tenantID).Scan(&titleID))
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','Kelas X',1)`, w.tenantID)
	classID := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, w.tenantID, yearID, grade)
	_, err := pg.AdminPool.Exec(ctx, `insert into enrollments (tenant_id,academic_year_id,student_user_id,class_id,status,joined_on)
		values ($1,$2,$3,$4,'active','2026-07-01')`, w.tenantID, yearID, w.memberID, classID)
	require.NoError(t, err)
	suspendForThreeDays(t, ctx, newCirculationService(pg.AppPool), w)

	realTime := circulationServiceAt(t, pg.AppPool, "2026-12-15T01:00:00Z")
	preview, err := realTime.PreviewClassLoans(at(t, ctx, "2026-12-18T01:30:00Z"), w.tenantID, classID, titleID)
	require.NoError(t, err)
	require.Len(t, preview.Pairs, 1, "paired once the suspension is over")
	require.Empty(t, preview.Rejected)
	status, _ := storedSuspension(t, ctx, pg.AdminPool, w)
	require.Equal(t, "suspended", status, "a preview stores nothing")

	running, err := realTime.PreviewClassLoans(ctx, w.tenantID, classID, titleID)
	require.NoError(t, err)
	require.Empty(t, running.Pairs)
	require.Len(t, running.Rejected, 1)
	require.ErrorIs(t, running.Rejected[0].Err, domain.ErrMemberSuspended, "still suspended in real time")
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
