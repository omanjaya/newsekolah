package wiring

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/billing"
	billingdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	billingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestVoidedPaymentReceiptVerifiesAsRevoked pins the bug where a voided
// payment's receipt still verified as genuine on the public verify page:
// voiding the payment must revoke its issued_documents row in the same
// transaction.
func TestVoidedPaymentReceiptVerifiesAsRevoked(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	permitsModule := permits.Register(permits.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{},
		Config: permitsservice.DefaultConfig([]byte("01234567890123456789012345678901"), ""),
	})
	billingModule := billing.Register(billing.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Docs: BillingDocuments{Permits: permitsModule.Service}, Clock: clock.Real{},
	})

	fx := seedGradeLevelFixture(t, pg.AdminPool)
	_ = enrolledStudent(t, pg.AdminPool, fx)
	staff := enrolledStudent(t, pg.AdminPool, fx) // any user can be the recording officer here
	_, err := billingModule.Service.CreateFeeType(ctx, billingdomain.FeeType{
		TenantID: fx.tenantID, Name: "SPP", AmountMinor: 100000, Recurrence: billingdomain.RecurrenceMonthly,
	}, staff)
	require.NoError(t, err)
	summary, err := billingModule.Service.GenerateBills(ctx, fx.tenantID, staff, "2026-11")
	require.NoError(t, err)
	require.NotEmpty(t, summary.Created)

	payment, err := billingModule.Service.RecordPayment(ctx, fx.tenantID, billingservice.PaymentInput{
		BillID: summary.Created[0].ID, AmountMinor: 100000, Method: billingdomain.PaymentCash, PaidOn: time.Now(),
	}, staff)
	require.NoError(t, err)
	require.NotEmpty(t, payment.ReceiptNumber)

	doc, err := db.New(pg.AdminPool).GetIssuedDocumentByEntity(ctx, db.GetIssuedDocumentByEntityParams{
		TenantID: fx.tenantID, EntityType: "payment", EntityID: payment.ID, Kind: "receipt",
	})
	require.NoError(t, err)
	require.False(t, doc.RevokedAt.Valid, "a fresh receipt is valid")

	_, err = billingModule.Service.VoidPayment(ctx, fx.tenantID, payment.ID, staff, "salah catat")
	require.NoError(t, err)

	doc, err = db.New(pg.AdminPool).GetIssuedDocumentByEntity(ctx, db.GetIssuedDocumentByEntityParams{
		TenantID: fx.tenantID, EntityType: "payment", EntityID: payment.ID, Kind: "receipt",
	})
	require.NoError(t, err)
	require.True(t, doc.RevokedAt.Valid, "voiding the payment revokes its receipt")
}

// TestVerifyDocumentRevokedAndCaseInsensitive covers the public verify
// path end to end: a code typed in lowercase still resolves, and a
// revoked document reports Revoked.
func TestVerifyDocumentRevokedAndCaseInsensitive(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	permitsModule := permits.Register(permits.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{},
		Config: permitsservice.DefaultConfig([]byte("01234567890123456789012345678901"), ""),
	})
	fx := seedGradeLevelFixture(t, pg.AdminPool)
	issuer := enrolledStudent(t, pg.AdminPool, fx)
	entityID := uuid.New()

	issued, err := permitsModule.Service.IssueDocument(ctx, fx.tenantID, permitsservice.IssueDocumentInput{
		Kind: receiptKind, NumberingTemplate: billingdomain.DefaultReceiptNumberingTemplate,
		EntityType: receiptEntityType, EntityID: entityID, AcademicYearID: fx.yearID, IssuerUserID: issuer,
		Vars: map[string]any{}, BuiltinHTML: billingservice.BuiltinReceiptHTML,
	})
	require.NoError(t, err)

	typed := " " + strings.ToLower(issued.VerificationCode) + " "
	got, err := permitsModule.Service.VerifyDocument(ctx, fx.tenantID, typed)
	require.NoError(t, err, "a code typed in lowercase with stray spaces still verifies")
	require.Equal(t, issued.Number, got.Number)
	require.False(t, got.Revoked)

	require.NoError(t, BillingDocuments{Permits: permitsModule.Service}.RevokeReceipt(ctx, fx.tenantID, entityID))
	got, err = permitsModule.Service.VerifyDocument(ctx, fx.tenantID, issued.VerificationCode)
	require.NoError(t, err)
	require.True(t, got.Revoked)

	// Revoking again is a no-op, not an error.
	require.NoError(t, BillingDocuments{Permits: permitsModule.Service}.RevokeReceipt(ctx, fx.tenantID, entityID))
}
