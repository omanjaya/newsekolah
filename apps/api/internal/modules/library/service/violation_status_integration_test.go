package service_test

import (
	"context"
	"io/fs"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/migrations"
)

// TestLateReturnWarningIsStoredSettled returns a loan one working day late
// with currency fines off and a member type that does not suspend: the
// warning it records is stored settled as done (paid) by the lender, not
// as an unpaid Rp 0 fine nor as waived (let off), and the member can be
// granted clearance.
func TestLateReturnWarningIsStoredSettled(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 1)
	svc := newCirculationService(pg.AppPool)

	w.borrow(t, at(t, ctx, "2026-12-14T01:00:00Z"), svc, w.barcodes[0])
	returned, err := svc.Return(at(t, ctx, "2026-12-25T01:00:00Z"), w.tenantID,
		service.ReturnInput{Barcode: w.barcodes[0], CheckedInBy: w.memberID})
	require.NoError(t, err)
	require.Zero(t, returned.FineAmount)

	violations, err := svc.ListViolationsForMember(ctx, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Len(t, violations, 1)
	warning := violations[0]
	require.Equal(t, domain.PenaltyWarning, warning.Penalty)
	require.Zero(t, warning.Amount)
	require.Equal(t, domain.ViolationPaid, warning.Status, "a warning leaves nothing to pay and was not let off")
	require.NotNil(t, warning.SettledAt)
	require.Equal(t, uuid.NullUUID{UUID: w.memberID, Valid: true}, warning.SettledBy)

	unpaid, err := svc.ListViolations(ctx, w.tenantID, string(domain.ViolationUnpaid), "", 50, 0)
	require.NoError(t, err)
	require.Empty(t, unpaid, "the warning is not listed among unpaid violations")

	member, err := svc.Clearance(ctx, w.tenantID, w.memberID)
	require.NoError(t, err, "a warning does not hold back clearance")
	require.Equal(t, domain.MemberCleared, member.Status)
}

// TestManualWarningIsStoredSettled records a warning by hand: like a
// late-return warning it is stored settled as done, while a manual fine
// starts unpaid and blocks clearance until it is settled.
func TestManualWarningIsStoredSettled(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 0)
	svc := newCirculationService(pg.AppPool)

	warning, err := svc.CreateViolation(ctx, w.tenantID, service.CreateViolationInput{
		MemberUserID: w.memberID, Kind: domain.ViolationOther, Penalty: domain.PenaltyWarning, CreatedBy: w.memberID,
	})
	require.NoError(t, err)
	require.Equal(t, domain.ViolationPaid, warning.Status)

	fine, err := svc.CreateViolation(ctx, w.tenantID, service.CreateViolationInput{
		MemberUserID: w.memberID, Kind: domain.ViolationDamaged, Penalty: domain.PenaltyFine, Amount: 5000, CreatedBy: w.memberID,
	})
	require.NoError(t, err)
	require.Equal(t, domain.ViolationUnpaid, fine.Status)
	require.Nil(t, fine.SettledAt)

	_, err = svc.Clearance(ctx, w.tenantID, w.memberID)
	require.ErrorIs(t, err, domain.ErrMemberNotClearable, "an unpaid fine with an amount blocks clearance")

	_, err = svc.SettleViolation(ctx, w.tenantID, fine.ID, domain.ViolationPaid, w.memberID)
	require.NoError(t, err)
	_, err = svc.Clearance(ctx, w.tenantID, w.memberID)
	require.NoError(t, err)
}

// TestSuspensionDoesNotBlockClearance returns a loan late for a member type
// that suspends: the suspension row stays unpaid until staff mark it served,
// but carries nothing to pay, so clearance is not held back.
func TestSuspensionDoesNotBlockClearance(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 1)
	svc := newCirculationService(pg.AppPool)
	_, err := pg.AdminPool.Exec(ctx, `update library_member_types set suspend_days = 3 where id = $1`, w.memberTypeID)
	require.NoError(t, err)

	w.borrow(t, at(t, ctx, "2026-12-14T01:00:00Z"), svc, w.barcodes[0])
	_, err = svc.Return(at(t, ctx, "2026-12-28T01:00:00Z"), w.tenantID,
		service.ReturnInput{Barcode: w.barcodes[0], CheckedInBy: w.memberID})
	require.NoError(t, err)

	violations, err := svc.ListViolationsForMember(ctx, w.tenantID, w.memberID)
	require.NoError(t, err)
	require.Len(t, violations, 1)
	require.Equal(t, domain.PenaltySuspend, violations[0].Penalty)
	require.Equal(t, domain.ViolationUnpaid, violations[0].Status)

	_, err = svc.Clearance(ctx, w.tenantID, w.memberID)
	require.NoError(t, err)
}

// TestMigrationSettlesStoredWarnings replays migration 0149 over a warning
// stored unpaid by the old insert: it becomes waived, settled by its
// author at its creation time, and an unpaid fine is left alone.
func TestMigrationSettlesStoredWarnings(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 0)

	insert := func(penalty string, amount int) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, `insert into library_violations
			(tenant_id, member_user_id, kind, penalty, amount, created_by)
			values ($1, $2, 'late', $3, $4, $2) returning id`, w.tenantID, w.memberID, penalty, amount).Scan(&id))
		return id
	}
	warningID := insert("warning", 0)
	fineID := insert("fine", 1000)

	up, err := migrations.FS.ReadFile("0149_library_warning_violations_settled.up.sql")
	require.NoError(t, err)
	_, err = pg.AdminPool.Exec(ctx, string(up))
	require.NoError(t, err)

	var status string
	var settledAtIsCreatedAt bool
	var settledBy uuid.NullUUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select status, settled_at = created_at, settled_by from library_violations where id = $1`, warningID).
		Scan(&status, &settledAtIsCreatedAt, &settledBy))
	require.Equal(t, "waived", status)
	require.True(t, settledAtIsCreatedAt)
	require.Equal(t, uuid.NullUUID{UUID: w.memberID, Valid: true}, settledBy)

	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select status from library_violations where id = $1`, fineID).Scan(&status))
	require.Equal(t, "unpaid", status)
}

// TestMigrationMarksStoredWarningsDone replays the migration that moves a
// warning stored waived to done (paid): the waived warning reads as done
// with its settlement kept, while a waived fine and a waived suspension --
// a real waiver by staff -- are left alone.
func TestMigrationMarksStoredWarningsDone(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWitaWorld(t, ctx, pg.AdminPool, 0)

	insert := func(penalty string, amount int) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, `insert into library_violations
			(tenant_id, member_user_id, kind, penalty, amount, created_by, status, settled_at, settled_by)
			values ($1, $2, 'late', $3, $4, $2, 'waived', now() - interval '1 day', $2) returning id`,
			w.tenantID, w.memberID, penalty, amount).Scan(&id))
		return id
	}
	warningID := insert("warning", 0)
	fineID := insert("fine", 1000)
	suspensionID := insert("suspend", 0)

	// Found by name, not number, so a renumbered migration still runs here.
	names, err := fs.Glob(migrations.FS, "*_library_warning_violations_done.up.sql")
	require.NoError(t, err)
	require.Len(t, names, 1)
	up, err := migrations.FS.ReadFile(names[0])
	require.NoError(t, err)
	_, err = pg.AdminPool.Exec(ctx, string(up))
	require.NoError(t, err)

	status := func(id uuid.UUID) string {
		t.Helper()
		var s string
		require.NoError(t, pg.AdminPool.QueryRow(ctx, `select status from library_violations where id = $1`, id).Scan(&s))
		return s
	}
	require.Equal(t, "paid", status(warningID))
	require.Equal(t, "waived", status(fineID))
	require.Equal(t, "waived", status(suspensionID))

	var settledBy uuid.NullUUID
	var settledYesterday bool
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select settled_by, settled_at < now() - interval '12 hours' from library_violations where id = $1`, warningID).
		Scan(&settledBy, &settledYesterday))
	require.Equal(t, uuid.NullUUID{UUID: w.memberID, Valid: true}, settledBy)
	require.True(t, settledYesterday, "the warning keeps when it was settled")
}
