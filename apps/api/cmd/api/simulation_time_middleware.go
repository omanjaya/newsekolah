package main

import (
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// simulationTimeHeader supplies an effective instant for business-time
// decisions in this request only. The browser computes frozen or running
// simulation time before each request; no shared process state is changed.
const simulationTimeHeader = "X-Simulation-Time"

func simulationTimeMiddleware(permissions authz.PermissionsProvider) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			values := r.Header.Values(simulationTimeHeader)
			if len(values) == 0 {
				next.ServeHTTP(w, r)
				return
			}

			id := authz.IdentityFromContext(r.Context())
			// API keys cannot simulate time, even when their owner has the
			// permission. A valid interactive session is required.
			if id.Err != nil || !id.Authenticated || id.SessionID == uuid.Nil || id.TenantID == uuid.Nil {
				httpx.WriteError(w, r, httpx.ErrTokenInvalid)
				return
			}

			actorID := id.UserID
			if id.ActorUserID.Valid {
				actorID = id.ActorUserID.UUID
			}
			if actorID == uuid.Nil {
				httpx.WriteError(w, r, httpx.ErrTokenInvalid)
				return
			}
			actorPermissions, err := permissions.EffectivePermissions(r.Context(), id.TenantID, actorID)
			if err != nil {
				httpx.WriteError(w, r, httpx.Internal(err))
				return
			}
			if !actorPermissions.Has(authz.PermPlatformSuperadmin) {
				httpx.WriteError(w, r, httpx.ErrForbidden)
				return
			}

			// A single RFC3339 value with an explicit zone is required. Parse
			// after permission checks so unauthorized users cannot probe the
			// simulation feature's validation behavior.
			if len(values) != 1 {
				httpx.WriteError(w, r, invalidSimulationTime())
				return
			}
			at, err := time.Parse(time.RFC3339Nano, values[0])
			if err != nil || at.IsZero() {
				httpx.WriteError(w, r, invalidSimulationTime())
				return
			}

			next.ServeHTTP(w, r.WithContext(clock.WithTime(r.Context(), at)))
		})
	}
}

func invalidSimulationTime() *httpx.Error {
	return httpx.ErrValidation.WithDetails(httpx.ErrorDetail{
		Field: simulationTimeHeader,
		Code:  "invalid_rfc3339_timestamp",
	})
}
