package library

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

// simulatedLibraryWorld is one tenant with a UTC timezone, a title with one
// available copy, and one active member ready to borrow it -- enough to
// drive Borrow/Return under the business-time simulation header's
// clock.WithTime, the same mechanism apps/api/cmd/api/simulation_time_middleware.go
// attaches to the request context for an authorized superadmin (see
// docs/testing-time-simulation.md).
type simulatedLibraryWorld struct {
	tenantID, titleID, copyID uuid.UUID
	copyBarcode               string
	memberUserID              uuid.UUID
}

func seedSimulatedLibraryWorld(t *testing.T, ctx context.Context, pool *pgxpool.Pool, slug string) simulatedLibraryWorld {
	t.Helper()
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	var w simulatedLibraryWorld
	w.tenantID = insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ($1,$1,'sma','UTC','id','active','default')`, slug)

	w.titleID = insertID(`insert into library_titles (tenant_id, title) values ($1, 'Judul Simulasi')`, w.tenantID)
	w.copyBarcode = "SIM-" + slug
	w.copyID = insertID(`insert into library_copies (tenant_id, title_id, barcode, status) values ($1, $2, $3, 'available')`,
		w.tenantID, w.titleID, w.copyBarcode)

	// A "per_tenor" fine type at 1000/day ties the violation's recorded
	// amount directly to how many working days late the simulated return
	// date lands, so the fine assertion below is provably reading the
	// simulated clock rather than a fixed constant. max_loan_days matches
	// domain.DefaultPolicy's LoanDays (7) so the due-date assertion below
	// can use the tenant's default policy directly.
	memberType := insertID(`insert into library_member_types
		(tenant_id, name, max_loan_items, max_loan_days, renewal_days, max_renewals, fine_type, fine_per_tenor, tenor_days, suspend_days, validity_months)
		values ($1, 'Siswa', 5, 7, 7, 1, 'per_tenor', 1000, 1, 0, 12)`, w.tenantID)

	w.memberUserID = insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,$2,'x',$2,'active','id')`,
		w.tenantID, "member-"+slug)
	_, err := pool.Exec(ctx, `insert into library_members (user_id, tenant_id, member_no, member_type_id, registered_on, status)
		values ($1, $2, $3, $4, current_date, 'active')`, w.memberUserID, w.tenantID, "M-"+slug, memberType)
	require.NoError(t, err)

	return w
}

// TestSimulatedLibraryBorrowReturnAndDashboard is the library module's
// counterpart to attendance's TestSimulatedAttendanceDayAndSaveWindow: it
// proves a loan's borrowed_at/due_on, a return's overdue/fine outcome, and
// the dashboard's "today" counters all follow clock.WithTime's simulated
// instant rather than the process clock.
func TestSimulatedLibraryBorrowReturnAndDashboard(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedSimulatedLibraryWorld(t, ctx, pg.AdminPool, "sim-"+uuid.NewString()[:8])

	// The service's own fallback clock is deliberately a year away from
	// every simulated instant used below, so an assertion that would pass
	// merely because it reused the fallback clock's "today" is exposed
	// immediately (dashboard case).
	fallback := clock.Frozen{At: time.Date(2020, 6, 15, 12, 0, 0, 0, time.UTC)}
	repo := repository.New(pg.AppPool)
	svc := service.New(pg.AppPool, repo, nil, nil, fallback)

	// Enable currency fines so a late return records a violation with a
	// numeric amount instead of a suspension/warning -- CreateViolation's
	// switch on domain.ComputeLateOutcome's Penalty (service/loans.go
	// recordLateOutcome).
	policy, err := svc.Policy(ctx, w.tenantID)
	require.NoError(t, err)
	policy.FineCurrencyEnabled = true
	_, err = svc.UpdatePolicy(ctx, w.tenantID, w.memberUserID, policy)
	require.NoError(t, err)

	// 1. Borrow under a simulated date: due_on must be computed relative to
	// that simulated date (working days after it), not the fallback clock.
	borrowAt := time.Date(2026, 3, 2, 9, 0, 0, 0, time.UTC) // a Monday
	borrowCtx := clock.WithTime(ctx, borrowAt)

	loan, err := svc.Borrow(borrowCtx, w.tenantID, service.BorrowInput{
		Barcode: w.copyBarcode, MemberUserID: w.memberUserID, CheckedOutBy: w.memberUserID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)
	require.True(t, borrowAt.Equal(loan.BorrowedAt), "borrowed_at must be the simulated instant, got %s", loan.BorrowedAt)

	wdr := domain.WorkingDayRule{SaturdayClosed: policy.SaturdayClosed, SundayClosed: policy.SundayClosed}
	wantDueOn := wdr.AddWorkingDays(borrowAt, policy.LoanDays)
	require.True(t, wantDueOn.Equal(loan.DueOn), "due_on must be %d working days after the simulated borrow date, got %s want %s", policy.LoanDays, loan.DueOn, wantDueOn)

	// 2. Return under a later simulated date: overdue/fine must be computed
	// from that simulated return date, not the fallback clock or the real
	// process clock.
	returnAt := wantDueOn.AddDate(0, 0, 10) // ten calendar days after due_on
	returnCtx := clock.WithTime(ctx, returnAt)
	wantLateDays := wdr.WorkingDaysLate(wantDueOn, returnAt)
	require.Positive(t, wantLateDays, "sanity: the simulated return date must actually be late")

	_, err = svc.Return(returnCtx, w.tenantID, service.ReturnInput{
		LoanID: uuid.NullUUID{UUID: loan.ID, Valid: true}, CheckedInBy: w.memberUserID,
	})
	require.NoError(t, err)

	violations, err := svc.ListViolationsForMember(ctx, w.tenantID, w.memberUserID)
	require.NoError(t, err)
	require.Len(t, violations, 1)
	require.Equal(t, domain.PenaltyFine, violations[0].Penalty)
	require.Equal(t, wantLateDays*1000, violations[0].Amount, "the fine must scale with the simulated late days, not a fixed constant")

	// 3. The dashboard's "today" counters must follow whichever now the
	// request's context carries: under the simulated borrow instant,
	// today's loan count must include the loan just made; under the
	// fallback clock's unrelated year, it must not.
	dashSimulated, err := svc.Dashboard(borrowCtx, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 1, dashSimulated.Summary.LoansToday, "the loan made on the simulated day must count toward that day's total")

	dashFallback, err := svc.Dashboard(ctx, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 0, dashFallback.Summary.LoansToday, "the fallback clock's unrelated day must not see the simulated day's loan")
}
