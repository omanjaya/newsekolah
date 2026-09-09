package wiring

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	disciplinedomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	permitsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
)

// DisciplineDocuments issues warning letters through the permits module's
// document pipeline (templates, numbering, verification, storage).
type DisciplineDocuments struct{ Permits *permitsservice.Service }

func (d DisciplineDocuments) IssueWarningLetter(ctx context.Context, tenantID uuid.UUID, in disciplineservice.WarningLetterDocument) (disciplineservice.IssuedDocument, error) {
	result, err := d.Permits.IssueDocument(ctx, tenantID, permitsservice.IssueDocumentInput{
		Kind: permitsdomain.TemplateKindWarningLetter, NumberingTemplate: disciplinedomain.DefaultWarningLetterNumberingTemplate,
		EntityType: "warning_letter", EntityID: in.LetterID, AcademicYearID: in.AcademicYearID, IssuerUserID: in.IssuerUserID,
		ObjectKey: fmt.Sprintf("tenants/%s/documents/warning/%s.pdf", tenantID, in.LetterID),
		Vars:      in.Vars, BuiltinHTML: disciplineservice.BuiltinWarningLetterHTML,
	})
	if err != nil {
		return disciplineservice.IssuedDocument{}, err
	}
	return disciplineservice.IssuedDocument{Number: result.Number, AssetID: result.AssetID}, nil
}

func (d DisciplineDocuments) DocumentURL(ctx context.Context, tenantID, assetID uuid.UUID) (string, error) {
	return d.Permits.DocumentDownloadURLForAsset(ctx, tenantID, assetID)
}
