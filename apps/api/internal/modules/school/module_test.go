package school_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestRegisterWithNilStorageDegradesGracefully proves a nil *storage.Client
// (S3 not configured, e.g. local dev without MinIO) still degrades to
// domain.ErrUploadNotConfigured, not a nil pointer panic, once wired
// through service.New's Storage interface parameter.
//
// service/service.go's Storage field changed from the concrete
// *platform/storage.Client to a narrow interface so tests can substitute
// an in-memory fake. That conversion has a classic Go trap: assigning a
// nil *storage.Client directly to an interface-typed parameter produces a
// non-nil interface value (concrete type set, pointer nil), and every
// `s.storage != nil` guard in the service package would then see "storage
// is configured" and try to call through the nil client. Register's own
// explicit nil check exists to prevent exactly that; this test pins the
// resulting behaviour so a future refactor that drops the check fails
// loudly here instead of panicking in production the first time S3 is
// left unconfigured.
func TestRegisterWithNilStorageDegradesGracefully(t *testing.T) {
	mod := school.Register(nil, tenant.ModeSingle, nil)
	ctx := context.Background()

	_, err := mod.Service.RequestLogoUpload(ctx, uuid.New())
	require.ErrorIs(t, err, domain.ErrUploadNotConfigured)

	_, err = mod.Service.RequestFaviconUpload(ctx, uuid.New())
	require.ErrorIs(t, err, domain.ErrUploadNotConfigured)

	_, err = mod.Service.ConfirmLogoUpload(ctx, uuid.New(), uuid.New(), "branding/x/logo/y")
	require.ErrorIs(t, err, domain.ErrUploadNotConfigured)

	_, err = mod.Service.ConfirmFaviconUpload(ctx, uuid.New(), uuid.New(), "branding/x/favicon/y")
	require.ErrorIs(t, err, domain.ErrUploadNotConfigured)
}
