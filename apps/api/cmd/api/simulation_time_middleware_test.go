package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

type simulationPermissions struct {
	forUser uuid.UUID
	set     authz.Set
	called  bool
}

func (p *simulationPermissions) EffectivePermissions(_ context.Context, _, userID uuid.UUID) (authz.Set, error) {
	p.called = true
	p.forUser = userID
	return p.set, nil
}

func TestSimulationTimeMiddleware(t *testing.T) {
	tenantID := uuid.New()
	userID := uuid.New()
	actorID := uuid.New()
	sessionID := uuid.New()
	at := time.Date(2026, time.September, 28, 6, 45, 0, 0, time.FixedZone("WITA", 8*3600))
	fallback := clock.Frozen{At: time.Date(2026, time.September, 29, 10, 0, 0, 0, time.UTC)}
	base := authz.Identity{Authenticated: true, TenantID: tenantID, UserID: userID, SessionID: sessionID}
	superadmin := authz.Set{authz.PermPlatformSuperadmin: {}}

	tests := []struct {
		name           string
		headers        []string
		identity       authz.Identity
		permissions    authz.Set
		wantStatus     int
		wantCalled     bool
		wantActor      uuid.UUID
		wantTime       time.Time
		wantHandlerRun bool
	}{
		{name: "absent header bypasses simulation", identity: base, wantStatus: http.StatusOK, wantTime: fallback.At, wantHandlerRun: true},
		{name: "authorized session", headers: []string{at.Format(time.RFC3339)}, identity: base, permissions: superadmin, wantStatus: http.StatusOK, wantCalled: true, wantActor: userID, wantTime: at, wantHandlerRun: true},
		{name: "impersonation checks real actor", headers: []string{at.Format(time.RFC3339)}, identity: authz.Identity{Authenticated: true, TenantID: tenantID, UserID: userID, SessionID: sessionID, ActorUserID: uuid.NullUUID{UUID: actorID, Valid: true}}, permissions: superadmin, wantStatus: http.StatusOK, wantCalled: true, wantActor: actorID, wantTime: at, wantHandlerRun: true},
		{name: "impersonation actor without permission forbidden", headers: []string{at.Format(time.RFC3339)}, identity: authz.Identity{Authenticated: true, TenantID: tenantID, UserID: userID, SessionID: sessionID, ActorUserID: uuid.NullUUID{UUID: actorID, Valid: true}}, wantStatus: http.StatusForbidden, wantCalled: true, wantActor: actorID},
		{name: "ordinary user forbidden", headers: []string{at.Format(time.RFC3339)}, identity: base, wantStatus: http.StatusForbidden, wantCalled: true, wantActor: userID},
		{name: "unauthenticated forbidden", headers: []string{at.Format(time.RFC3339)}, wantStatus: http.StatusUnauthorized},
		{name: "API key forbidden", headers: []string{at.Format(time.RFC3339)}, identity: authz.Identity{Authenticated: true, TenantID: tenantID, UserID: userID}, wantStatus: http.StatusUnauthorized},
		{name: "malformed value", headers: []string{"2026-09-28T06:45:00"}, identity: base, permissions: superadmin, wantStatus: http.StatusBadRequest, wantCalled: true, wantActor: userID},
		{name: "multiple values", headers: []string{at.Format(time.RFC3339), at.Format(time.RFC3339)}, identity: base, permissions: superadmin, wantStatus: http.StatusBadRequest, wantCalled: true, wantActor: userID},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			provider := &simulationPermissions{set: tt.permissions}
			handlerRan := false
			handler := simulationTimeMiddleware(provider)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				handlerRan = true
				if got := clock.Now(r.Context(), fallback); !got.Equal(tt.wantTime) {
					t.Errorf("business time = %s, want %s", got, tt.wantTime)
				}
				w.WriteHeader(http.StatusOK)
			}))
			req := httptest.NewRequest(http.MethodGet, "/v1/attendance", nil)
			for _, value := range tt.headers {
				req.Header.Add(simulationTimeHeader, value)
			}
			req = req.WithContext(authz.WithIdentity(req.Context(), tt.identity))
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != tt.wantStatus || handlerRan != tt.wantHandlerRun || provider.called != tt.wantCalled {
				t.Errorf("status=%d handlerRan=%t permissionCalled=%t, want %d/%t/%t", rec.Code, handlerRan, provider.called, tt.wantStatus, tt.wantHandlerRun, tt.wantCalled)
			}
			if tt.wantCalled && provider.forUser != tt.wantActor {
				t.Errorf("permission checked user %s, want %s", provider.forUser, tt.wantActor)
			}
		})
	}
}

func TestSimulationTimeDoesNotLeakBetweenRequests(t *testing.T) {
	provider := &simulationPermissions{set: authz.Set{authz.PermPlatformSuperadmin: {}}}
	fallback := clock.Frozen{At: time.Date(2026, time.September, 29, 0, 0, 0, 0, time.UTC)}
	var seen []time.Time
	handler := simulationTimeMiddleware(provider)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, clock.Now(r.Context(), fallback))
		w.WriteHeader(http.StatusOK)
	}))
	id := authz.Identity{Authenticated: true, TenantID: uuid.New(), UserID: uuid.New(), SessionID: uuid.New()}
	for _, value := range []string{"2026-09-28T06:45:00+08:00", ""} {
		req := httptest.NewRequest(http.MethodGet, "/v1/attendance", nil)
		if value != "" {
			req.Header.Set(simulationTimeHeader, value)
		}
		handler.ServeHTTP(httptest.NewRecorder(), req.WithContext(authz.WithIdentity(req.Context(), id)))
	}
	if len(seen) != 2 || !seen[0].Equal(time.Date(2026, time.September, 27, 22, 45, 0, 0, time.UTC)) || !seen[1].Equal(fallback.At) {
		t.Errorf("simulation leaked between requests: %v", seen)
	}
}
