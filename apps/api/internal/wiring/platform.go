package wiring

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"github.com/google/uuid"

	identitydomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	platformservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// adminRoleSlug is the role the platform console grants a freshly
// provisioned tenant's first administrator. It is deliberately not
// domain.SuperAdminRoleSlug: identity's ValidateRoleGrants only requires
// the acting user to already be a super_admin when granting that exact
// slug, and here there is no acting tenant user yet (the console operates
// across tenants, not as one).
const adminRoleSlug = "admin"

// PlatformIdentity provisions a new tenant's first administrator through
// the identity module's own use cases (create role, grant every tenant
// permission except the platform console itself, create the user) rather
// than reaching into identity's repository directly, following the
// pattern of DisciplineDocuments above.
type PlatformIdentity struct{ Identity *identityservice.Service }

func (p PlatformIdentity) ProvisionAdmin(ctx context.Context, tenantID uuid.UUID, in platformservice.AdminInput) (platformservice.AdminResult, error) {
	role, err := p.Identity.CreateRole(ctx, tenantID, adminRoleSlug, "Administrator", "Tenant administrator provisioned by the platform console")
	if err != nil {
		return platformservice.AdminResult{}, fmt.Errorf("provision admin role: %w", err)
	}
	if _, err := p.Identity.ReplaceRolePermissions(ctx, tenantID, role.ID, tenantPermissionCodes()); err != nil {
		return platformservice.AdminResult{}, fmt.Errorf("grant admin permissions: %w", err)
	}

	password, err := auth.NewRandomPassword()
	if err != nil {
		return platformservice.AdminResult{}, fmt.Errorf("generate admin password: %w", err)
	}

	user, err := p.Identity.CreateUser(ctx, tenantID, uuid.Nil, identityservice.CreateUserInput{
		UserWriteInput: identityservice.UserWriteInput{
			Name: in.Name, Email: in.Email, Locale: "id", ProfileKind: identitydomain.ProfileStaff,
			Roles: []identitydomain.RoleGrant{{Slug: adminRoleSlug, IsPrimary: true}},
		},
		Username: in.Username, Password: password,
	})
	if err != nil {
		return platformservice.AdminResult{}, fmt.Errorf("create admin user: %w", err)
	}

	return platformservice.AdminResult{UserID: user.ID, Username: user.Username, Password: password}, nil
}

// tenantPermissionCodes is every permission code except the platform
// console's own: a tenant admin must never be handed cross-tenant access.
func tenantPermissionCodes() []string {
	all := authz.Codes()
	out := make([]string, 0, len(all))
	for _, code := range all {
		if code == authz.PermPlatformSuperadmin {
			continue
		}
		out = append(out, code)
	}
	return out
}

// PlatformStorage adapts the S3-compatible object store to
// platformservice.Storage, converting the presigned URL to a plain string
// for the API response.
type PlatformStorage struct{ Client PlatformObjectStore }

// PlatformObjectStore is the slice of the storage client the export job
// needs; matched structurally so *storage.Client satisfies it without an
// import cycle back into this package.
type PlatformObjectStore interface {
	PutObject(ctx context.Context, objectKey string, content []byte, contentType string) error
	PresignedGetURL(ctx context.Context, objectKey string, ttl time.Duration) (*url.URL, error)
}

func (s PlatformStorage) PutObject(ctx context.Context, objectKey string, content []byte, contentType string) error {
	return s.Client.PutObject(ctx, objectKey, content, contentType)
}

func (s PlatformStorage) PresignedGetURL(ctx context.Context, objectKey string, ttl time.Duration) (string, error) {
	u, err := s.Client.PresignedGetURL(ctx, objectKey, ttl)
	if err != nil {
		return "", err
	}
	return u.String(), nil
}
