package wiring

import (
	"context"

	"github.com/google/uuid"

	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

// LibraryMembers resolves a member's display name for the library
// module's reports and printed cards.
type LibraryMembers struct{ Svc *identityservice.Service }

func (m LibraryMembers) UserDisplayName(ctx context.Context, tenantID, userID uuid.UUID) (string, error) {
	user, err := m.Svc.GetUser(ctx, tenantID, userID)
	if err != nil {
		return "", err
	}
	return user.Name, nil
}
