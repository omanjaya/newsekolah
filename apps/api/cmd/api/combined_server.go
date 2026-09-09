package main

import (
	"net/http"

	identityhttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/transport/http"
	permitshttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/transport/http"
	schoolhttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/school/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// combinedServer satisfies api.StrictServerInterface by embedding each
// module's handler plus the wiring-only health handler: Go promotes their
// methods, so no operation is implemented twice.
type combinedServer struct {
	*identityhttp.Handler
	*schoolhttp.TenantHandler
	*permitshttp.PermitsHandler
	*healthHandler
}

// decodeErrorHandler renders a request-decoding failure (bad JSON, a
// missing required parameter) in the same {error:{code,message}} envelope
// as every other error, instead of oapi-codegen's default plain-text body.
func decodeErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	httpx.WriteError(w, r, httpx.WrapError(http.StatusBadRequest, "VALIDATION_FAILED", err))
}

// responseErrorHandler renders whatever the strict handler chain returned
// as an error -- almost always a *httpx.Error produced by a service/domain
// error mapping, or by authz.Authorize itself.
func responseErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	httpx.WriteError(w, r, err)
}
