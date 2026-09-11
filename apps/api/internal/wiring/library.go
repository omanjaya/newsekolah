package wiring

import (
	"context"
	"time"

	"github.com/google/uuid"

	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	libraryservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	permitsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	platformservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
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

// UserRole returns the identity module's profile kind (student, teacher,
// staff, parent) so library can pick a member type's default_for_role at
// auto-registration.
func (m LibraryMembers) UserRole(ctx context.Context, tenantID, userID uuid.UUID) (string, bool, error) {
	user, err := m.Svc.GetUser(ctx, tenantID, userID)
	if err != nil {
		return "", false, nil //nolint:nilerr // caller falls back to a default role when this comes up empty
	}
	if user.ProfileKind == "" {
		return "", false, nil
	}
	return string(user.ProfileKind), true, nil
}

// LibraryFlags reads the library module's on/off state from the platform
// console's existing feature-flag storage (same convention as
// internal/wiring/visitors.go).
type LibraryFlags struct{ Platform *platformservice.Service }

func (f LibraryFlags) IsModuleEnabled(ctx context.Context, tenantID uuid.UUID) (bool, error) {
	return f.Platform.IsModuleEnabled(ctx, tenantID, string(platformdomain.ModuleLibrary))
}

// LibraryPermissions backs the self-or-staff scoping on member loan and
// reservation history with the identity module's existing effective
// permission set, so library never computes permissions of its own.
type LibraryPermissions struct{ Identity *identityservice.Service }

func (p LibraryPermissions) HasPermission(ctx context.Context, tenantID, userID uuid.UUID, permission string) (bool, error) {
	perms, err := p.Identity.EffectivePermissions(ctx, tenantID, userID)
	if err != nil {
		return false, err
	}
	return perms.Has(permission), nil
}

var _ authz.PermissionsProvider = (*identityservice.Service)(nil)

// LibraryEvents republishes the library module's typed events on the
// shared platform bus, where internal/wiring/eventbridge.go translates
// them into the generic events.Envelope the notifications module
// subscribes to (same indirection as internal/modules/permits/service.go's
// EventPublisher).
type LibraryEvents struct{ Bus *events.Bus }

func (e LibraryEvents) Publish(ctx context.Context, evt libraryservice.Event) error {
	return e.Bus.Publish(ctx, evt)
}

// LibraryScanTokens issues and consumes library kiosk check-in tokens
// through the permits module's existing scan_tokens pipeline (purpose
// library_visit, reserved for this module in migrations/0045_scan_tokens),
// rather than a second token implementation.
type LibraryScanTokens struct{ Permits *permitsservice.Service }

func (t LibraryScanTokens) IssueLibraryVisitToken(ctx context.Context, tenantID, issuedByUserID uuid.UUID) (string, time.Time, error) {
	result, err := t.Permits.IssueScanToken(ctx, permitsservice.IssueScanTokenInput{
		TenantID: tenantID, Purpose: permitsdomain.PurposeLibraryVisit, IssuedByUserID: issuedByUserID,
	})
	if err != nil {
		return "", time.Time{}, err
	}
	return result.RawValue, result.ExpiresAt, nil
}

func (t LibraryScanTokens) ConsumeLibraryVisitToken(ctx context.Context, tenantID uuid.UUID, rawValue string, consumedByUserID uuid.UUID) error {
	_, err := t.Permits.ConsumeScanToken(ctx, permitsservice.ConsumeScanTokenInput{
		TenantID: tenantID, Purpose: permitsdomain.PurposeLibraryVisit, RawValue: rawValue, ConsumedByUserID: consumedByUserID,
	})
	return err
}
