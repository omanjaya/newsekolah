package wiring

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	billingdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/domain"
	billingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/billing/service"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	platformservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
)

// BillingDocuments issues payment receipts through the permits module's
// document pipeline (numbering, rendering, storage), the same one
// discipline uses for warning letters.
type BillingDocuments struct{ Permits *permitsservice.Service }

func (d BillingDocuments) IssueReceipt(ctx context.Context, tenantID uuid.UUID, in billingservice.ReceiptDocument) (billingservice.IssuedReceipt, error) {
	result, err := d.Permits.IssueDocument(ctx, tenantID, permitsservice.IssueDocumentInput{
		// "receipt" is not one of the document_templates.kind values a
		// tenant can save a custom template under (see the module's
		// report), so this always renders billingservice.BuiltinReceiptHTML;
		// document_sequences and issued_documents have no such
		// restriction, so numbering and the verifiable record work the
		// same as every other document kind.
		Kind: "receipt", NumberingTemplate: billingdomain.DefaultReceiptNumberingTemplate,
		EntityType: "payment", EntityID: in.PaymentID, AcademicYearID: in.AcademicYearID, IssuerUserID: in.IssuerUserID,
		ObjectKey: fmt.Sprintf("tenants/%s/documents/receipts/%s.pdf", tenantID, in.PaymentID),
		Vars:      in.Vars, BuiltinHTML: billingservice.BuiltinReceiptHTML,
	})
	if err != nil {
		return billingservice.IssuedReceipt{}, err
	}
	return billingservice.IssuedReceipt{Number: result.Number, AssetID: result.AssetID}, nil
}

func (d BillingDocuments) DocumentURL(ctx context.Context, tenantID, assetID uuid.UUID) (string, error) {
	return d.Permits.DocumentDownloadURLForAsset(ctx, tenantID, assetID)
}

// BillingFlags reads the platform console's per-tenant module flag for
// billing, the only enforcement point the platform module exposes today
// (apps/api/internal/modules/platform/service/flags.go).
type BillingFlags struct{ Platform *platformservice.Service }

func (f BillingFlags) BillingEnabled(ctx context.Context, tenantID uuid.UUID) (bool, error) {
	return f.Platform.IsModuleEnabled(ctx, tenantID, string(platformdomain.ModuleBilling))
}
