package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

func newCirculationService(pool *pgxpool.Pool) *service.Service {
	return service.New(pool, repository.New(pool), nil, nil, clock.Real{})
}

// TestHeldCopyIsLentToTheReserverOnly covers the reservation hand-off at
// the desk: once a returned copy is set aside for a waiting reservation,
// the member who reserved it can borrow it (completing the reservation),
// and anyone else is told it is held for another member rather than the
// generic "not available".
func TestHeldCopyIsLentToTheReserverOnly(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLibraryRealtimeWorld(t, ctx, pg.AdminPool, "handoff-"+uuid.NewString())
	svc := newCirculationService(pg.AppPool)

	_, err := svc.Borrow(ctx, w.tenantID, service.BorrowInput{
		Barcode: w.copyBarcode, MemberUserID: w.borrowerID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)
	reservation, err := svc.Reserve(ctx, w.tenantID, w.titleID, w.reserverID)
	require.NoError(t, err)

	_, err = svc.Return(ctx, w.tenantID, service.ReturnInput{Barcode: w.copyBarcode, CheckedInBy: w.borrowerID})
	require.NoError(t, err)

	_, err = svc.Borrow(ctx, w.tenantID, service.BorrowInput{
		Barcode: w.copyBarcode, MemberUserID: w.borrowerID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
	})
	require.ErrorIs(t, err, domain.ErrCopyReservedForOther)

	batch, err := svc.BatchBorrow(ctx, w.tenantID, service.BatchBorrowInput{
		Barcodes: []string{w.copyBarcode}, MemberUserID: w.borrowerID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)
	require.Empty(t, batch.Loans)
	require.Len(t, batch.Rejected, 1)
	require.ErrorIs(t, batch.Rejected[0].Err, domain.ErrCopyReservedForOther)

	batch, err = svc.BatchBorrow(ctx, w.tenantID, service.BatchBorrowInput{
		Barcodes: []string{w.copyBarcode}, MemberUserID: w.reserverID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)
	require.Empty(t, batch.Rejected)
	require.Len(t, batch.Loans, 1)
	require.Equal(t, w.reserverID, batch.Loans[0].MemberUserID)

	var status string
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select status from library_reservations where id = $1`, reservation.ID).Scan(&status))
	require.Equal(t, "fulfilled", status, "lending the held copy to the reserver completes the reservation")
}

// TestReferenceCopiesAreNeverLent covers every borrow path for a copy whose
// access is reference or read-in-place: the desk, and a class loan whose
// preview must not pair it and whose commit refuses a forged pair.
func TestReferenceCopiesAreNeverLent(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLibraryRealtimeWorld(t, ctx, pg.AdminPool, "reference-"+uuid.NewString())
	svc := newCirculationService(pg.AppPool)

	for _, access := range []string{"reference", "read_in_place"} {
		_, err := pg.AdminPool.Exec(ctx, `update library_copies set access = $2 where id = $1`, w.copyID, access)
		require.NoError(t, err)

		_, err = svc.Borrow(ctx, w.tenantID, service.BorrowInput{
			Barcode: w.copyBarcode, MemberUserID: w.borrowerID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
		})
		require.ErrorIs(t, err, domain.ErrCopyNotLoanable, access)

		committed, err := svc.CommitClassLoans(ctx, w.tenantID, []service.ClassLoanPair{{
			StudentUserID: w.borrowerID, TitleID: w.titleID, CopyID: w.copyID, Barcode: w.copyBarcode,
		}}, w.borrowerID)
		require.NoError(t, err)
		require.Empty(t, committed.Loans, access)
		require.Len(t, committed.Rejected, 1)
		require.ErrorIs(t, committed.Rejected[0].Err, domain.ErrCopyNotLoanable)
	}

	var status string
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select status from library_copies where id = $1`, w.copyID).Scan(&status))
	require.Equal(t, "available", status)
}

// TestReferenceCopyOnTheShelfDoesNotBlockAReservation covers a title with a
// reference copy on the shelf and its only loanable copy out on loan: the
// reference copy can be read but never lent, so the title can be reserved
// and the catalogue counts no loanable copy. When the loaned copy comes
// back it is held for the reservation; a copy turned reference while out
// is never held, since the member could not take it home.
func TestReferenceCopyOnTheShelfDoesNotBlockAReservation(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLibraryRealtimeWorld(t, ctx, pg.AdminPool, "reference-hold-"+uuid.NewString())
	svc := newCirculationService(pg.AppPool)

	_, err := pg.AdminPool.Exec(ctx, `insert into library_copies (tenant_id, title_id, barcode, status, access)
		values ($1, $2, $3, 'available', 'reference')`, w.tenantID, w.titleID, "REF-"+w.copyBarcode)
	require.NoError(t, err)

	_, err = svc.Reserve(ctx, w.tenantID, w.titleID, w.reserverID)
	require.ErrorIs(t, err, domain.ErrCopyAvailableForLoan, "the loanable copy is still on the shelf")

	_, err = svc.Borrow(ctx, w.tenantID, service.BorrowInput{
		Barcode: w.copyBarcode, MemberUserID: w.borrowerID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)

	title, err := svc.GetTitle(ctx, w.tenantID, w.titleID)
	require.NoError(t, err)
	require.Equal(t, 1, title.AvailableCopies, "the reference copy is still on the shelf")
	require.Equal(t, 0, title.LoanableAvailableCopies)

	reservation, err := svc.Reserve(ctx, w.tenantID, w.titleID, w.reserverID)
	require.NoError(t, err, "a reference copy on the shelf cannot be borrowed, so it must not block a hold")

	// The loaned copy is turned reference while it is out: on return it goes
	// back on the shelf and the reservation keeps waiting.
	_, err = pg.AdminPool.Exec(ctx, `update library_copies set access = 'reference' where id = $1`, w.copyID)
	require.NoError(t, err)
	_, err = svc.Return(ctx, w.tenantID, service.ReturnInput{Barcode: w.copyBarcode, CheckedInBy: w.borrowerID})
	require.NoError(t, err)

	var copyStatus, reservationStatus string
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select status from library_copies where id = $1`, w.copyID).Scan(&copyStatus))
	require.Equal(t, "available", copyStatus)
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select status from library_reservations where id = $1`, reservation.ID).Scan(&reservationStatus))
	require.Equal(t, "waiting", reservationStatus, "a copy no one may borrow is never held for a reservation")
}

// TestBatchBorrowKeepsTheMembersOwnReason covers a member blocked by an
// unpaid fine at the desk: every barcode is rejected, and the batch must
// say why (LIBRARY_UNPAID_FINE) instead of failing the whole request with
// "copy not available" for a copy that is on the shelf.
func TestBatchBorrowKeepsTheMembersOwnReason(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLibraryRealtimeWorld(t, ctx, pg.AdminPool, "fine-block-"+uuid.NewString())
	svc := newCirculationService(pg.AppPool)

	_, err := pg.AdminPool.Exec(ctx, `insert into library_violations (tenant_id, member_user_id, kind, penalty, amount, status, created_by)
		values ($1, $2, 'other', 'fine', 75000, 'unpaid', $2)`, w.tenantID, w.borrowerID)
	require.NoError(t, err)

	result, err := svc.BatchBorrow(ctx, w.tenantID, service.BatchBorrowInput{
		Barcodes: []string{w.copyBarcode}, MemberUserID: w.borrowerID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err, "an all-rejected batch reports each row's reason, not one generic error")
	require.Empty(t, result.Loans)
	require.Len(t, result.Rejected, 1)
	require.ErrorIs(t, result.Rejected[0].Err, domain.ErrUnpaidFine)

	status, err := svc.GetMemberBorrowingStatus(ctx, w.tenantID, w.borrowerID)
	require.NoError(t, err)
	require.True(t, status.HasUnpaidFine)
	require.True(t, status.FineBlocksLoans, "the default policy refuses loans while a fine is unpaid")
}

// TestDashboardUnpaidFinesFollowSettlement covers the dashboard's unpaid
// fines figure: it reads the violations a librarian settles, so marking a
// fine paid or waived brings it down, and a manual fine without a loan
// counts too.
func TestDashboardUnpaidFinesFollowSettlement(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLibraryRealtimeWorld(t, ctx, pg.AdminPool, "fines-"+uuid.NewString())
	svc := newCirculationService(pg.AppPool)

	loan, err := svc.Borrow(ctx, w.tenantID, service.BorrowInput{
		Barcode: w.copyBarcode, MemberUserID: w.borrowerID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)
	_, err = svc.MarkLost(ctx, w.tenantID, loan.ID, w.borrowerID, domain.PenaltyFine, 50000, "")
	require.NoError(t, err)

	dash, err := svc.Dashboard(ctx, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 50000, dash.Summary.UnpaidFinesTotal)

	violations, err := svc.ListViolationsForMember(ctx, w.tenantID, w.borrowerID)
	require.NoError(t, err)
	require.Len(t, violations, 1)
	_, err = svc.SettleViolation(ctx, w.tenantID, violations[0].ID, domain.ViolationPaid, w.borrowerID)
	require.NoError(t, err)

	dash, err = svc.Dashboard(ctx, w.tenantID)
	require.NoError(t, err)
	require.Zero(t, dash.Summary.UnpaidFinesTotal, "a paid fine is no longer unpaid")

	var manualID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `insert into library_violations (tenant_id, member_user_id, kind, penalty, amount, status, created_by)
		values ($1, $2, 'damaged', 'fine', 7000, 'unpaid', $2) returning id`, w.tenantID, w.reserverID).Scan(&manualID))
	dash, err = svc.Dashboard(ctx, w.tenantID)
	require.NoError(t, err)
	require.Equal(t, 7000, dash.Summary.UnpaidFinesTotal, "a fine recorded without a loan counts too")

	_, err = svc.SettleViolation(ctx, w.tenantID, manualID, domain.ViolationWaived, w.borrowerID)
	require.NoError(t, err)
	dash, err = svc.Dashboard(ctx, w.tenantID)
	require.NoError(t, err)
	require.Zero(t, dash.Summary.UnpaidFinesTotal, "a waived fine is no longer unpaid")
}

// TestLostLoanIsNotCountedAsAReturn covers the dashboard's returns today,
// its 30-day series, and the monthly report: a loan marked lost is closed
// with returned_at, but the book never came back.
func TestLostLoanIsNotCountedAsAReturn(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLibraryRealtimeWorld(t, ctx, pg.AdminPool, "lost-"+uuid.NewString())
	svc := newCirculationService(pg.AppPool)

	loan, err := svc.Borrow(ctx, w.tenantID, service.BorrowInput{
		Barcode: w.copyBarcode, MemberUserID: w.borrowerID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)
	_, err = svc.MarkLost(ctx, w.tenantID, loan.ID, w.borrowerID, domain.PenaltyFine, 50000, "")
	require.NoError(t, err)

	dash, err := svc.Dashboard(ctx, w.tenantID)
	require.NoError(t, err)
	require.Zero(t, dash.Summary.ReturnsToday)
	for _, p := range dash.Series {
		require.Zero(t, p.Returns, "day %s", p.Day)
	}

	report, err := svc.MonthlyReport(ctx, w.tenantID, "")
	require.NoError(t, err)
	require.Zero(t, report.Returns)
	require.Zero(t, report.LateReturns)
}

// TestBorrowingStatusShowsTheMemberTypeLimit covers the kiosk's quota
// counter: the member type's limit (2) applies, not the tenant policy's
// default (3), exactly as a borrow enforces it.
func TestBorrowingStatusShowsTheMemberTypeLimit(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLibraryRealtimeWorld(t, ctx, pg.AdminPool, "limits-"+uuid.NewString())
	svc := newCirculationService(pg.AppPool)

	_, err := pg.AdminPool.Exec(ctx, `update library_member_types set max_loan_items = 2 where tenant_id = $1`, w.tenantID)
	require.NoError(t, err)
	_, err = svc.Borrow(ctx, w.tenantID, service.BorrowInput{
		Barcode: w.copyBarcode, MemberUserID: w.borrowerID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)

	status, err := svc.GetMemberBorrowingStatus(ctx, w.tenantID, w.borrowerID)
	require.NoError(t, err)
	require.True(t, status.Limits.AllowLoans)
	require.Equal(t, 2, status.Limits.MaxLoanItems)
	require.Equal(t, 1, status.ActiveLoanCount)
	require.False(t, status.HasUnpaidFine)
	require.False(t, status.FineBlocksLoans)

	_, err = svc.GetMemberBorrowingStatus(ctx, w.tenantID, uuid.New())
	require.ErrorIs(t, err, domain.ErrMemberNotFound)
}
