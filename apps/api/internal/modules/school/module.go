// Package school wires the school module's repository, service, and HTTP
// transport together. cmd/api calls Register once at startup; nothing else
// constructs these types directly.
package school

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/service"
	transporthttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/school/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

type Module struct {
	Service *service.Service
	Handler *transporthttp.TenantHandler
	// Loader is exported so cmd/api can pass it to tenant.Middleware without
	// platform/tenant importing this module.
	Loader tenant.Loader
}

// storageClient is nil when S3 is not configured (dev without MinIO):
// branding logo/favicon upload then returns ErrUploadNotConfigured, the
// same degrade-gracefully convention identity's avatar upload uses.
//
// service.New takes the narrower service.Storage interface, not this
// concrete type, so tests can substitute an in-memory fake. A nil
// *storage.Client must not be assigned to that interface parameter
// directly: doing so would box a non-nil interface value around a nil
// pointer, and every `s.storage != nil` guard in the service package would
// then see a non-nil interface and try to call through the nil client,
// panicking instead of degrading gracefully. The explicit nil check below
// keeps a genuinely nil interface when storage is not configured, exactly
// like cmd/api's own storageClientFor/type-assertion guard for this same
// value (see cmd/api/wire.go).
func Register(pool *pgxpool.Pool, mode tenant.Mode, storageClient *storage.Client) *Module {
	repo := repository.New(pool)
	var st service.Storage
	if storageClient != nil {
		st = storageClient
	}
	svc := service.New(pool, repo, mode, st)
	handler := transporthttp.New(svc)
	return &Module{Service: svc, Handler: handler, Loader: repo}
}
