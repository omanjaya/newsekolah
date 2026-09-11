package wiring

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	permitsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
)

// DisciplineDocuments issues warning letters through the permits module's
// document pipeline (templates, numbering, verification, storage). The
// numbering pattern itself (NumberingTemplate/SeqPad) is discipline's own
// tenant policy, not a constant here -- see
// domain.WarningLetterTemplatePolicy.
type DisciplineDocuments struct{ Permits *permitsservice.Service }

func (d DisciplineDocuments) IssueWarningLetter(ctx context.Context, tenantID uuid.UUID, in disciplineservice.WarningLetterDocument) (disciplineservice.IssuedDocument, error) {
	result, err := d.Permits.IssueDocument(ctx, tenantID, permitsservice.IssueDocumentInput{
		Kind: permitsdomain.TemplateKindWarningLetter, NumberingTemplate: in.NumberingTemplate, SeqPad: in.SeqPad,
		ExtraNumberingVars: map[string]string{"sp_level_number": fmt.Sprint(in.Vars["level"])},
		EntityType:         "warning_letter", EntityID: in.LetterID, AcademicYearID: in.AcademicYearID, IssuerUserID: in.IssuerUserID,
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

// DisciplineGuardians resolves a warning letter's guardian recipients
// through identity's existing parent-link reader, so a letter notifies
// the parent account the same way it notifies the homeroom teacher (the
// old app's intent per letters.go's WarningLetterIssued doc comment).
type DisciplineGuardians struct{ Identity *identityservice.Service }

func (g DisciplineGuardians) GuardianIDsOf(ctx context.Context, tenantID, studentUserID uuid.UUID) ([]uuid.UUID, error) {
	guardians, err := g.Identity.GuardiansOf(ctx, tenantID, studentUserID)
	if err != nil {
		return nil, err
	}
	out := make([]uuid.UUID, len(guardians))
	for i, guardian := range guardians {
		out[i] = guardian.ParentUserID
	}
	return out, nil
}
