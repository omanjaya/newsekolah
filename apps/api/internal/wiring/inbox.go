package wiring

import (
	"context"
	"errors"

	"github.com/google/uuid"

	disciplinedomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
)

// InboxWarningLetters adapts discipline's due-candidate count to the inbox
// port, treating a tenant with no active academic year as "nothing due"
// (the candidates screen reports that as a conflict; a badge should not).
type InboxWarningLetters struct{ Svc *disciplineservice.Service }

func (w InboxWarningLetters) CountDueSPCandidates(ctx context.Context, tenantID uuid.UUID) (int, error) {
	n, err := w.Svc.CountDueSPCandidates(ctx, tenantID)
	if errors.Is(err, disciplinedomain.ErrNoActiveAcademicYear) {
		return 0, nil
	}
	return n, err
}
