package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// witaWorld is a UTC+8 (Asia/Makassar) school with Saturday and Sunday
// closed and a holiday on Thursday 17 Dec 2026, so a 7 working day loan
// from Monday 14 Dec falls due on Thursday 24 Dec.
type witaWorld struct {
	tenantID     uuid.UUID
	memberTypeID uuid.UUID
	memberID     uuid.UUID
	barcodes     []string
}

func seedWitaWorld(t *testing.T, ctx context.Context, pool *pgxpool.Pool, copies int) witaWorld {
	t.Helper()
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}
	slug := "wita-" + uuid.NewString()[:8]
	var w witaWorld
	w.tenantID = insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ($1,$1,'sma','Asia/Makassar','id','active','default')`, slug)
	yearID := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-07-01','2027-06-30')`, w.tenantID)
	insertID(`insert into academic_calendar_events (tenant_id,academic_year_id,date,end_date,kind,name)
		values ($1,$2,'2026-12-17','2026-12-17','holiday','Libur')`, w.tenantID, yearID)

	titleID := insertID(`insert into library_titles (tenant_id, title) values ($1, 'Judul Test')`, w.tenantID)
	for i := 0; i < copies; i++ {
		barcode := slug + "-" + uuid.NewString()[:6]
		insertID(`insert into library_copies (tenant_id, title_id, barcode, status) values ($1, $2, $3, 'available')`, w.tenantID, titleID, barcode)
		w.barcodes = append(w.barcodes, barcode)
	}
	w.memberTypeID = insertID(`insert into library_member_types
		(tenant_id, name, max_loan_items, max_loan_days, renewal_days, max_renewals, fine_type, fine_per_tenor, tenor_days, suspend_days)
		values ($1, 'Siswa', 5, 7, 7, 1, 'per_tenor', 500, 1, 0)`, w.tenantID)
	w.memberID = insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,$2,'x',$2,'active','id')`,
		w.tenantID, "siswa-"+slug)
	_, err := pool.Exec(ctx, `insert into library_members (user_id, tenant_id, member_no, member_type_id, registered_on, status)
		values ($1, $2, $3, $4, '2026-07-01', 'active')`, w.memberID, w.tenantID, "M-"+slug, w.memberTypeID)
	require.NoError(t, err)
	return w
}

func at(t *testing.T, ctx context.Context, rfc3339 string) context.Context {
	t.Helper()
	instant, err := time.Parse(time.RFC3339, rfc3339)
	require.NoError(t, err)
	return clock.WithTime(ctx, instant)
}

func (w witaWorld) borrow(t *testing.T, ctx context.Context, svc *service.Service, barcode string) domain.Loan {
	t.Helper()
	loan, err := svc.Borrow(ctx, w.tenantID, service.BorrowInput{
		Barcode: barcode, MemberUserID: w.memberID, CheckedOutBy: w.memberID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)
	return loan
}

func enableFines(t *testing.T, ctx context.Context, svc *service.Service, w witaWorld) {
	t.Helper()
	policy, err := svc.Policy(ctx, w.tenantID)
	require.NoError(t, err)
	policy.FineCurrencyEnabled = true
	_, err = svc.UpdatePolicy(ctx, w.tenantID, w.memberID, policy)
	require.NoError(t, err)
}

// TestLoanBeforeEightWitaIsDueOnTheSchoolDay is a loan at 07:30 WITA on
// Monday (23:30Z on Sunday): its due date counts from the school's Monday,
// exactly like a loan at 09:00 the same morning, not from the UTC Sunday.
func TestLoanBeforeEightWitaIsDueOnTheSchoolDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 2)
	svc := newCirculationService(pg.AppPool)

	early := w.borrow(t, at(t, ctx, "2026-12-13T23:30:00Z"), svc, w.barcodes[0])
	late := w.borrow(t, at(t, ctx, "2026-12-14T01:00:00Z"), svc, w.barcodes[1])

	require.Equal(t, "2026-12-24", early.DueOn.Format(time.DateOnly))
	require.Equal(t, "2026-12-24", late.DueOn.Format(time.DateOnly))
}

// TestRenewOnTheDueDateDuringSchoolHours renews a loan at 09:00 WITA on its
// due date (01:00Z, past the due date's UTC midnight): it is not overdue
// on the school's calendar, so the renewal goes through from the due date.
// At 07:30 WITA the next morning (still the due date in UTC) it is overdue.
func TestRenewOnTheDueDateDuringSchoolHours(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 2)
	svc := newCirculationService(pg.AppPool)

	first := w.borrow(t, at(t, ctx, "2026-12-14T01:00:00Z"), svc, w.barcodes[0])
	second := w.borrow(t, at(t, ctx, "2026-12-14T01:00:00Z"), svc, w.barcodes[1])

	renewed, err := svc.Renew(at(t, ctx, "2026-12-24T01:00:00Z"), w.tenantID,
		service.RenewInput{LoanID: uuid.NullUUID{UUID: first.ID, Valid: true}}, w.memberID)
	require.NoError(t, err, "09:00 WITA on the due date is not overdue")
	// 7 working days after Thu 24 Dec: 25, 28, 29, 30, 31 Dec, 1, 4 Jan.
	require.Equal(t, "2027-01-04", renewed.DueOn.Format(time.DateOnly))

	_, err = svc.Renew(at(t, ctx, "2026-12-24T23:30:00Z"), w.tenantID,
		service.RenewInput{Barcode: w.barcodes[1]}, w.memberID)
	require.ErrorIs(t, err, domain.ErrRenewalBlockedOverdue, "07:30 WITA on 25 Dec is the day after %s", second.DueOn.Format(time.DateOnly))
}

// TestRenewalLimitFollowsTheMemberType gives the member's type two
// renewals while the tenant policy allows one: the second renewal goes
// through, the third is refused. A type set to 0 refuses the first.
func TestRenewalLimitFollowsTheMemberType(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 1)
	svc := newCirculationService(pg.AppPool)
	_, err := pg.AdminPool.Exec(ctx, `update library_member_types set max_renewals = 2, renewal_days = 14 where id = $1`, w.memberTypeID)
	require.NoError(t, err)
	policy, err := svc.Policy(ctx, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 1, policy.MaxRenewals)

	day := at(t, ctx, "2026-12-14T01:00:00Z")
	loan := w.borrow(t, day, svc, w.barcodes[0])
	byID := service.RenewInput{LoanID: uuid.NullUUID{UUID: loan.ID, Valid: true}}

	_, err = svc.Renew(day, w.tenantID, byID, w.memberID)
	require.NoError(t, err)
	renewed, err := svc.Renew(day, w.tenantID, byID, w.memberID)
	require.NoError(t, err, "the type allows a second renewal")
	require.Equal(t, 2, renewed.RenewalCount)
	_, err = svc.Renew(day, w.tenantID, byID, w.memberID)
	require.ErrorIs(t, err, domain.ErrRenewalLimitReached)

	_, err = pg.AdminPool.Exec(ctx, `update library_member_types set max_renewals = 0 where id = $1`, w.memberTypeID)
	require.NoError(t, err)
	_, err = svc.Return(day, w.tenantID, service.ReturnInput{LoanID: byID.LoanID, CheckedInBy: w.memberID})
	require.NoError(t, err)
	again := w.borrow(t, day, svc, w.barcodes[0])
	_, err = svc.Renew(day, w.tenantID, service.RenewInput{LoanID: uuid.NullUUID{UUID: again.ID, Valid: true}}, w.memberID)
	require.ErrorIs(t, err, domain.ErrRenewalLimitReached, "a type with 0 renewals refuses even though the policy allows 1")
}

// TestLateReturnBeforeEightWitaChargesTheFineOnTheLoan returns a loan due
// Thursday 24 Dec at 07:30 WITA on Friday 25 Dec (23:30Z on the 24th): one
// working day late on the school's calendar. The fine the member type
// gives is recorded as a violation and carried on the returned loan, so
// the desk shows what was charged.
func TestLateReturnBeforeEightWitaChargesTheFineOnTheLoan(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 1)
	svc := newCirculationService(pg.AppPool)
	enableFines(t, ctx, svc, w)

	loan := w.borrow(t, at(t, ctx, "2026-12-14T01:00:00Z"), svc, w.barcodes[0])
	require.Equal(t, "2026-12-24", loan.DueOn.Format(time.DateOnly))

	returned, err := svc.Return(at(t, ctx, "2026-12-24T23:30:00Z"), w.tenantID,
		service.ReturnInput{Barcode: w.barcodes[0], CheckedInBy: w.memberID})
	require.NoError(t, err)
	require.Equal(t, 500, returned.FineAmount, "one working day late at Rp 500 per day")

	violations, err := svc.ListViolationsForMember(ctx, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Len(t, violations, 1)
	require.Equal(t, domain.PenaltyFine, violations[0].Penalty)
	require.Equal(t, returned.FineAmount, violations[0].Amount, "the loan and its violation carry the same fine")
}

// TestLateReturnSuspendsFromTheSchoolDay returns a loan late with currency
// fines off and a type that suspends for 3 days: the suspension runs from
// the school's day of the return, not the UTC day before it.
func TestLateReturnSuspendsFromTheSchoolDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 1)
	svc := newCirculationService(pg.AppPool)
	_, err := pg.AdminPool.Exec(ctx, `update library_member_types set suspend_days = 3 where id = $1`, w.memberTypeID)
	require.NoError(t, err)

	w.borrow(t, at(t, ctx, "2026-12-14T01:00:00Z"), svc, w.barcodes[0])
	returned, err := svc.Return(at(t, ctx, "2026-12-27T23:30:00Z"), w.tenantID,
		service.ReturnInput{Barcode: w.barcodes[0], CheckedInBy: w.memberID})
	require.NoError(t, err)
	require.Zero(t, returned.FineAmount, "a suspension charges no money")

	member, err := svc.GetMember(ctx, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Equal(t, domain.MemberSuspended, member.Status)
	require.NotNil(t, member.SuspendedUntil)
	require.Equal(t, "2026-12-31", member.SuspendedUntil.Format(time.DateOnly), "3 days from Monday 28 Dec, the school's day")
}

// TestOverdueMembersReportProjectsTheReturnFine checks the report's fine
// column against what a return would charge: nothing while currency fines
// are off, then the member type's per-day fine for working days only (a
// weekend between the due date and today is not counted), and a constant
// type's single flat charge.
func TestOverdueMembersReportProjectsTheReturnFine(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 1)
	svc := newCirculationService(pg.AppPool)

	w.borrow(t, at(t, ctx, "2026-12-14T01:00:00Z"), svc, w.barcodes[0]) // due Thu 24 Dec
	// 07:30 WITA on Monday 28 Dec: Fri 25 and Mon 28 are working days late,
	// the weekend is not; in UTC it is still Sunday 27 Dec.
	monday := at(t, ctx, "2026-12-27T23:30:00Z")

	report, err := svc.OverdueMembers(monday, w.tenantID)
	require.NoError(t, err)
	require.Len(t, report, 1)
	require.Equal(t, 1, report[0].LoanCount)
	require.Zero(t, report[0].TotalFine, "no money fine while currency fines are off")

	enableFines(t, ctx, svc, w)
	report, err = svc.OverdueMembers(monday, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 1000, report[0].TotalFine, "2 working days at Rp 500 per day")

	_, err = pg.AdminPool.Exec(ctx, `update library_member_types set fine_type = 'constant' where id = $1`, w.memberTypeID)
	require.NoError(t, err)
	report, err = svc.OverdueMembers(monday, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 500, report[0].TotalFine, "a constant fine is charged once per late return")

	returned, err := svc.Return(monday, w.tenantID, service.ReturnInput{Barcode: w.barcodes[0], CheckedInBy: w.memberID})
	require.NoError(t, err)
	require.Equal(t, report[0].TotalFine, returned.FineAmount, "the report projected what the return charged")
}

// TestOverdueListCountsTheSchoolDay lists overdue loans at 07:30 WITA the
// day after the due date: the loan is overdue on the school's calendar
// even though the UTC date is still its due date.
func TestOverdueListCountsTheSchoolDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 1)
	svc := newCirculationService(pg.AppPool)

	loan := w.borrow(t, at(t, ctx, "2026-12-14T01:00:00Z"), svc, w.barcodes[0])

	onDueDate, err := svc.OverdueLoans(at(t, ctx, "2026-12-24T09:00:00Z"), w.tenantID)
	require.NoError(t, err)
	require.Empty(t, onDueDate, "17:00 WITA on the due date is not overdue")

	nextMorning, err := svc.OverdueLoans(at(t, ctx, "2026-12-24T23:30:00Z"), w.tenantID)
	require.NoError(t, err)
	require.Len(t, nextMorning, 1)
	require.Equal(t, loan.ID, nextMorning[0].ID)
}
