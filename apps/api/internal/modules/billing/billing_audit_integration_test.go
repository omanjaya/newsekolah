package billing

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// billingFixture is one tenant with an active academic year, one class,
// one enrolled student and a paid-in-full bill against them, built
// through the service itself (fee type + GenerateBills) so the fixture
// exercises the same idempotent generation path the real app uses.
type billingFixture struct {
	tenantID uuid.UUID
	billID   uuid.UUID
	staffID  uuid.UUID
}

// seedBillingFixture seeds raw fixture rows (tenant, year, class,
// enrollment, staff) through adminPool, bypassing RLS the way a migration
// or a one-off admin script would; mod's own service calls
// (CreateFeeType, GenerateBills) run through whatever pool mod was
// constructed with, so the caller must pass a mod already wired against
// AppPool for this to exercise row level security the way production
// does.
func seedBillingFixture(t *testing.T, adminPool *pgxpool.Pool, mod *Module) billingFixture {
	t.Helper()
	ctx := context.Background()
	q := db.New(adminPool)

	tenantRow, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "billing-test-" + uuid.NewString(), Name: "Billing Test", EducationLevel: "sma",
		Timezone: "Asia/Jakarta", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)

	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tenantRow.ID, Label: "2026/2027",
		StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2027, 6, 30, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)

	grade, err := q.CreateGradeLevel(ctx, db.CreateGradeLevelParams{
		TenantID: tenantRow.ID, Code: "X", Name: "Kelas X", Sequence: 1,
	})
	require.NoError(t, err)

	class, err := q.CreateClass(ctx, db.CreateClassParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, GradeLevelID: grade.ID, Name: "X-A",
		Capacity: pgtype.Int4{Int32: 32, Valid: true},
	})
	require.NoError(t, err)

	student, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "siswa-" + uuid.NewString(), PasswordHash: "x",
		Name: "Siswa Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	_, err = q.AcademicCreateEnrollment(ctx, db.AcademicCreateEnrollmentParams{
		TenantID: tenantRow.ID, AcademicYearID: year.ID, StudentUserID: student.ID, ClassID: class.ID,
		JoinedOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
	})
	require.NoError(t, err)

	staff, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: tenantRow.ID, Username: "bendahara-" + uuid.NewString(), PasswordHash: "x",
		Name: "Bendahara Test", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	feeType, err := mod.Service.CreateFeeType(ctx, domain.FeeType{
		TenantID: tenantRow.ID, Name: "SPP", AmountMinor: 150000, Recurrence: domain.RecurrenceMonthly,
	}, staff.ID)
	require.NoError(t, err)
	_ = feeType

	summary, err := mod.Service.GenerateBills(ctx, tenantRow.ID, staff.ID, "2026-07")
	require.NoError(t, err)
	require.Len(t, summary.Created, 1, "one active enrollment and one active monthly fee type must generate exactly one bill")

	return billingFixture{tenantID: tenantRow.ID, billID: summary.Created[0].ID, staffID: staff.ID}
}

// newTestBillingModule wires the billing module against appPool -- the
// least-privilege app_rw role, so row level security applies exactly like
// production -- never the admin pool used for fixture seeding.
func newTestBillingModule(appPool *pgxpool.Pool) *Module {
	schoolModule := school.Register(appPool, tenant.ModeSingle, nil)
	return Register(Dependencies{Pool: appPool, Years: schoolModule.Service, Clock: clock.Real{}})
}

func auditLogsFor(t *testing.T, pool *pgxpool.Pool, tenantID, entityID uuid.UUID) []db.AuditLog {
	t.Helper()
	rows, err := db.New(pool).ListAuditLogs(context.Background(), db.ListAuditLogsParams{
		TenantID:  pgtype.UUID{Bytes: tenantID, Valid: true},
		EntityID:  pgtype.UUID{Bytes: entityID, Valid: true},
		PageLimit: 50,
	})
	require.NoError(t, err)
	return rows
}

// TestRecordPaymentWritesAuditRecord covers billing's payment recording:
// RecordPayment must write an audit_logs row inside the same transaction
// that inserts the payment.
func TestRecordPaymentWritesAuditRecord(t *testing.T) {
	pg := dbtest.Start(t)
	mod := newTestBillingModule(pg.AppPool)
	fx := seedBillingFixture(t, pg.AdminPool, mod)
	ctx := context.Background()

	payment, err := mod.Service.RecordPayment(ctx, fx.tenantID, service.PaymentInput{
		BillID: fx.billID, AmountMinor: 150000, Method: domain.PaymentCash, PaidOn: time.Now(),
	}, fx.staffID)
	require.NoError(t, err)

	logs := auditLogsFor(t, pg.AdminPool, fx.tenantID, payment.ID)
	require.Len(t, logs, 1, "RecordPayment must write exactly one audit_logs row")
	require.Equal(t, "payment.record", logs[0].Action)
	require.Equal(t, "payment", logs[0].EntityType)
}

// TestVoidPaymentWritesAuditRecord covers billing's payment void:
// VoidPayment must write an audit_logs row inside the same transaction
// that flips the payment's voided_at and recomputes the bill.
func TestVoidPaymentWritesAuditRecord(t *testing.T) {
	pg := dbtest.Start(t)
	mod := newTestBillingModule(pg.AppPool)
	fx := seedBillingFixture(t, pg.AdminPool, mod)
	ctx := context.Background()

	payment, err := mod.Service.RecordPayment(ctx, fx.tenantID, service.PaymentInput{
		BillID: fx.billID, AmountMinor: 150000, Method: domain.PaymentCash, PaidOn: time.Now(),
	}, fx.staffID)
	require.NoError(t, err)

	_, err = mod.Service.VoidPayment(ctx, fx.tenantID, payment.ID, fx.staffID, "salah catat")
	require.NoError(t, err)

	logs := auditLogsFor(t, pg.AdminPool, fx.tenantID, payment.ID)
	require.Len(t, logs, 2, "record then void must write two audit_logs rows")
	require.Equal(t, "payment.void", logs[0].Action, "ListAuditLogs orders newest first")
}
