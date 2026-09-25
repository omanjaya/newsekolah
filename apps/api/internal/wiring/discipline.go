package wiring

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"

	disciplinedomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	permitsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
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

// LateArrivalDiscipline implements permits/service.DisciplineRecorder over
// discipline's own service.Service.RecordViolation, so a late arrival's
// reviewed violation_ids become real student_has_violations rows instead
// of an opaque payload list (docs/analysis/backend-inventory.md 1.16).
// RecordViolation itself validates the violation type is active, so an
// unknown or inactive id surfaces here as permitsdomain.ErrViolationInvalid
// rather than a generic error the transport layer cannot map to 400.
type LateArrivalDiscipline struct {
	Discipline *disciplineservice.Service
	Clock      clock.Clock
}

func (d LateArrivalDiscipline) RecordLateArrivalViolation(ctx context.Context, tenantID, studentUserID, violationTypeID, workflowInstanceID, reporterUserID uuid.UUID, note string) error {
	occurredOn := d.Clock.Now()
	_, err := d.Discipline.RecordViolation(ctx, tenantID, disciplineservice.RecordInput{
		StudentUserID: studentUserID, ViolationTypeID: violationTypeID, OccurredOn: occurredOn, Notes: note,
		WorkflowInstanceID: uuid.NullUUID{UUID: workflowInstanceID, Valid: true}, ReporterUserID: reporterUserID,
	})
	if err != nil {
		if errors.Is(err, disciplinedomain.ErrViolationTypeNotFound) || errors.Is(err, disciplinedomain.ErrViolationTypeInactive) || errors.Is(err, disciplinedomain.ErrInvalidInput) {
			return fmt.Errorf("%w: %v", permitsdomain.ErrViolationInvalid, err)
		}
		return err
	}
	return nil
}
