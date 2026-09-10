package wiring

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	permitsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	platformservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	visitorsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
	visitorsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// VisitorsDocuments issues visitor badges through the permits module's
// document pipeline (templates, numbering, verification, storage).
type VisitorsDocuments struct{ Permits *permitsservice.Service }

func (d VisitorsDocuments) IssueVisitorBadge(ctx context.Context, tenantID uuid.UUID, in visitorsservice.BadgeDocument) (visitorsservice.IssuedBadge, error) {
	result, err := d.Permits.IssueDocument(ctx, tenantID, permitsservice.IssueDocumentInput{
		Kind: permitsdomain.TemplateKindVisitorBadge, NumberingTemplate: visitorsdomain.DefaultBadgeNumberingTemplate,
		EntityType: "visitor_visit", EntityID: in.VisitID, AcademicYearID: in.AcademicYearID, IssuerUserID: in.IssuerUserID,
		ObjectKey: fmt.Sprintf("tenants/%s/documents/visitor-badge/%s.pdf", tenantID, in.VisitID),
		Vars:      in.Vars, BuiltinHTML: visitorsservice.BuiltinVisitorBadgeHTML,
	})
	if err != nil {
		return visitorsservice.IssuedBadge{}, err
	}
	return visitorsservice.IssuedBadge{Number: result.Number, AssetID: result.AssetID}, nil
}

func (d VisitorsDocuments) DocumentURL(ctx context.Context, tenantID, assetID uuid.UUID) (string, error) {
	return d.Permits.DocumentDownloadURLForAsset(ctx, tenantID, assetID)
}

// VisitorsFlags reads the visitors module's on/off state from the platform
// console's existing feature-flag storage, rather than a second flag
// system living only inside this module.
type VisitorsFlags struct{ Platform *platformservice.Service }

func (f VisitorsFlags) IsModuleEnabled(ctx context.Context, tenantID uuid.UUID) (bool, error) {
	return f.Platform.IsModuleEnabled(ctx, tenantID, string(platformdomain.ModuleVisitors))
}

// VisitorsAudit backs the incident-read requirement ("every read is
// recorded") with the platform's existing append-only audit log.
type VisitorsAudit struct{}

func (VisitorsAudit) Record(ctx context.Context, tenantID uuid.UUID, action, entityType string, entityID uuid.UUID) error {
	return audit.RecordSimple(ctx, tenantID, action, entityType, entityID)
}
