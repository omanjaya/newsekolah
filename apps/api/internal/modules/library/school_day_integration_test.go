package library

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// witaWorld is a library world in a UTC+8 school (Asia/Makassar).
func witaWorld(t *testing.T, ctx context.Context, pg dbtest.Postgres, prefix string) simulatedLibraryWorld {
	t.Helper()
	w := seedSimulatedLibraryWorld(t, ctx, pg.AdminPool, prefix+"-"+uuid.NewString()[:8])
	_, err := pg.AdminPool.Exec(ctx, `update tenants set timezone = 'Asia/Makassar' where id = $1`, w.tenantID)
	require.NoError(t, err)
	return w
}

func newUser(t *testing.T, ctx context.Context, pg dbtest.Postgres, tenantID uuid.UUID, name string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `insert into users (tenant_id,username,password_hash,name,status,locale)
		values ($1,$2,'x',$2,'active','id') returning id`, tenantID, name+"-"+uuid.NewString()[:8]).Scan(&id))
	return id
}

// TestMemberRegistrationUsesTheSchoolsDay proves a registration before
// 08:00 WITA (still the previous evening in UTC) is dated on the school's
// day: the registration date, the validity end and the member number's
// year all used the UTC date, so a member registered at 07:30 on 4 Jan got
// 3 Jan, and one registered at 07:30 on 1 Jan got the previous year's number.
func TestMemberRegistrationUsesTheSchoolsDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := witaWorld(t, ctx, pg, "reg")
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, clock.Frozen{At: time.Date(2020, 6, 15, 12, 0, 0, 0, time.UTC)})

	var memberTypeID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `insert into library_member_types (tenant_id, name, validity_months)
		values ($1, 'Guru', 12) returning id`, w.tenantID).Scan(&memberTypeID))

	// Mon 4 Jan 2027 07:30 WITA.
	member, err := svc.RegisterMember(clock.WithTime(ctx, time.Date(2027, 1, 3, 23, 30, 0, 0, time.UTC)), w.tenantID,
		service.RegisterMemberInput{UserID: newUser(t, ctx, pg, w.tenantID, "early"), MemberTypeID: memberTypeID})
	require.NoError(t, err)
	require.Equal(t, "2027-01-04", member.RegisteredOn.Format(time.DateOnly))
	require.NotNil(t, member.ValidUntil)
	require.Equal(t, "2028-01-04", member.ValidUntil.Format(time.DateOnly))

	// Fri 1 Jan 2027 07:30 WITA: the number carries 2027, not 2026.
	member, err = svc.RegisterMember(clock.WithTime(ctx, time.Date(2026, 12, 31, 23, 30, 0, 0, time.UTC)), w.tenantID,
		service.RegisterMemberInput{UserID: newUser(t, ctx, pg, w.tenantID, "newyear"), MemberTypeID: memberTypeID})
	require.NoError(t, err)
	require.Equal(t, "2027-01-01", member.RegisteredOn.Format(time.DateOnly))
	require.Contains(t, member.MemberNo, "-2027-")

	// A typed member number is dated the same way.
	member, err = svc.RegisterMember(clock.WithTime(ctx, time.Date(2027, 1, 3, 23, 30, 0, 0, time.UTC)), w.tenantID,
		service.RegisterMemberInput{UserID: newUser(t, ctx, pg, w.tenantID, "typed"), MemberTypeID: memberTypeID, MemberNo: "TYPED-1"})
	require.NoError(t, err)
	require.Equal(t, "2027-01-04", member.RegisteredOn.Format(time.DateOnly))
}

// TestLateAndOverdueCountTheSchoolsDay proves a return or an overdue check
// before 08:00 WITA reads the school's day: a book due on Thu 19 Nov
// returned at 07:00 WITA on Fri 20 Nov (still 19 Nov in UTC) is a late
// return, and at that moment an unreturned one due on 19 Nov is overdue by
// one working day. (A Friday due date would put the dawn on a Saturday,
// which the default policy closes, so no working day would be late yet.)
func TestLateAndOverdueCountTheSchoolsDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := witaWorld(t, ctx, pg, "late")
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, clock.Frozen{At: time.Date(2026, 11, 19, 23, 0, 0, 0, time.UTC)})

	_, err := pg.AdminPool.Exec(ctx, `insert into library_loans
		(tenant_id, copy_id, title_id, member_user_id, checked_out_by, borrowed_at, due_on, returned_at, status)
		values ($1, $2, $3, $4, $4, '2026-11-12T02:00:00Z', '2026-11-19', '2026-11-19T23:00:00Z', 'returned')`,
		w.tenantID, w.copyID, w.titleID, w.memberUserID)
	require.NoError(t, err)

	monthly, err := svc.MonthlyReport(ctx, w.tenantID, "2026-11")
	require.NoError(t, err)
	require.Equal(t, 1, monthly.LateReturns, "returned at 07:00 WITA the day after it was due")

	var copy2 uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `insert into library_copies (tenant_id, title_id, barcode, status)
		values ($1, $2, $3, 'on_loan') returning id`, w.tenantID, w.titleID, "OVD-"+uuid.NewString()[:8]).Scan(&copy2))
	_, err = pg.AdminPool.Exec(ctx, `insert into library_loans
		(tenant_id, copy_id, title_id, member_user_id, checked_out_by, borrowed_at, due_on, status)
		values ($1, $2, $3, $4, $4, '2026-11-12T02:00:00Z', '2026-11-19', 'active')`,
		w.tenantID, copy2, w.titleID, w.memberUserID)
	require.NoError(t, err)

	// The report shows the fine Return would really charge, and the
	// default policy keeps currency fines off (a late return then suspends
	// or warns), so turn them on to see the day counted in the fine.
	policy, err := svc.Policy(ctx, w.tenantID)
	require.NoError(t, err)
	policy.FineCurrencyEnabled = true
	_, err = svc.UpdatePolicy(ctx, w.tenantID, w.memberUserID, policy)
	require.NoError(t, err)

	overdue, err := svc.OverdueMembers(ctx, w.tenantID)
	require.NoError(t, err)
	require.Len(t, overdue, 1, "at 07:00 WITA on 20 Nov a loan due on 19 Nov is overdue")
	// The member's type charges 1000 per working day late
	// (seedSimulatedLibraryWorld), the same fine Return would charge now.
	require.Equal(t, 1000, overdue[0].TotalFine, "one working day late")
}

// TestReturnAtDawnAfterTheDueDateIsLate proves Return itself reads the
// school's day: a book due on Thu 19 Nov returned at 07:00 WITA on Fri 20
// Nov (still 19 Nov in UTC) records the late outcome and counts on the
// member, so the monthly report's late-return figure agrees with the
// violations behind it. Return used the UTC date and recorded nothing.
func TestReturnAtDawnAfterTheDueDateIsLate(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := witaWorld(t, ctx, pg, "dawn")
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, clock.Frozen{At: time.Date(2020, 6, 15, 12, 0, 0, 0, time.UTC)})

	_, err := pg.AdminPool.Exec(ctx, `update library_copies set status = 'on_loan' where id = $1`, w.copyID)
	require.NoError(t, err)
	var loanID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `insert into library_loans
		(tenant_id, copy_id, title_id, member_user_id, checked_out_by, borrowed_at, due_on, status)
		values ($1, $2, $3, $4, $4, '2026-11-12T02:00:00Z', '2026-11-19', 'active') returning id`,
		w.tenantID, w.copyID, w.titleID, w.memberUserID).Scan(&loanID))

	// Fri 20 Nov 2026 07:00 WITA.
	_, err = svc.Return(clock.WithTime(ctx, time.Date(2026, 11, 19, 23, 0, 0, 0, time.UTC)), w.tenantID,
		service.ReturnInput{Barcode: w.copyBarcode, CheckedInBy: w.memberUserID})
	require.NoError(t, err)

	var violations, lateCount int
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select count(*) from library_violations
		where loan_id = $1 and kind = 'late'`, loanID).Scan(&violations))
	require.Equal(t, 1, violations, "returned one school day late")
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select late_return_count from library_members
		where user_id = $1`, w.memberUserID).Scan(&lateCount))
	require.Equal(t, 1, lateCount)

	monthly, err := svc.MonthlyReport(ctx, w.tenantID, "2026-11")
	require.NoError(t, err)
	require.Equal(t, 1, monthly.LateReturns)
}

// TestReadyHoldLastsToTheEndOfItsOpenDays proves a hold readied on a Friday
// afternoon with the library closed at the weekend lasts to the end of the
// second open day (Tuesday) on the school's calendar, rather than lapsing
// on Sunday afternoon 48 hours later while the library is shut.
func TestReadyHoldLastsToTheEndOfItsOpenDays(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := witaWorld(t, ctx, pg, "hold")
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, clock.Frozen{At: time.Date(2020, 6, 15, 12, 0, 0, 0, time.UTC)})

	borrowAt := clock.WithTime(ctx, time.Date(2026, 11, 16, 2, 0, 0, 0, time.UTC))
	_, err := svc.Borrow(borrowAt, w.tenantID, service.BorrowInput{
		Barcode: w.copyBarcode, MemberUserID: w.memberUserID, CheckedOutBy: w.memberUserID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)

	reserver := newUser(t, ctx, pg, w.tenantID, "reserver")
	_, err = pg.AdminPool.Exec(ctx, `insert into library_members (user_id, tenant_id, member_no, member_type_id, registered_on, status)
		select $1, tenant_id, $2, member_type_id, registered_on, 'active' from library_members where user_id = $3`,
		reserver, "R-"+uuid.NewString()[:8], w.memberUserID)
	require.NoError(t, err)
	_, err = svc.Reserve(borrowAt, w.tenantID, w.titleID, reserver)
	require.NoError(t, err)

	// Returned Fri 20 Nov 15:40 WITA.
	_, err = svc.Return(clock.WithTime(ctx, time.Date(2026, 11, 20, 7, 40, 0, 0, time.UTC)), w.tenantID,
		service.ReturnInput{Barcode: w.copyBarcode, CheckedInBy: w.memberUserID})
	require.NoError(t, err)

	reservations, err := svc.MemberReservations(ctx, w.tenantID, reserver)
	require.NoError(t, err)
	require.Len(t, reservations, 1)
	require.Equal(t, domain.ReservationReady, reservations[0].Status)
	require.NotNil(t, reservations[0].ExpiresAt)
	wita, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	require.Equal(t, "2026-11-24 23:59:59", reservations[0].ExpiresAt.In(wita).Format(time.DateTime))
}
