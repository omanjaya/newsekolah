package service

import (
	"context"

	"github.com/google/uuid"
)

// SearchCatalogue is the public OPAC search: the same title listing the
// catalogue screen uses, without requiring a session. Callers behind the
// public endpoint pass the tenant resolved from the host/header, never a
// user's own tenant from a token.
func (s *Service) SearchCatalogue(ctx context.Context, tenantID uuid.UUID, search string, limit, offset int) ([]TitleWithAvailability, error) {
	return s.ListTitles(ctx, tenantID, search, limit, offset)
}
