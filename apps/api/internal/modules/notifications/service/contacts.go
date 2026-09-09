package service

import (
	"context"

	"github.com/google/uuid"
)

// ContactReader resolves a user's email address and WhatsApp-capable phone
// number. Both live on identity's users/user_profiles tables, which this
// module does not own and must not query directly (docs/03 section 1: no
// module writes -- or, by the same isolation principle, reads without an
// exported interface -- another module's tables). NoopContactReader is
// used until the identity module (built on a parallel branch) exposes a
// concrete reader and cmd/api wires it in after merge; until then, email
// and WhatsApp delivery for a user with no other contact source resolve
// to "no contact available" rather than failing Notify.
type ContactReader interface {
	EmailForUser(ctx context.Context, tenantID, userID uuid.UUID) (string, bool, error)
	PhoneNumberForUser(ctx context.Context, tenantID, userID uuid.UUID) (string, bool, error)
}

type NoopContactReader struct{}

func (NoopContactReader) EmailForUser(context.Context, uuid.UUID, uuid.UUID) (string, bool, error) {
	return "", false, nil
}

func (NoopContactReader) PhoneNumberForUser(context.Context, uuid.UUID, uuid.UUID) (string, bool, error) {
	return "", false, nil
}
