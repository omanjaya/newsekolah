// Package tenant resolves the tenant for every request (single-tenant
// mode: one fixed tenant; multi-tenant mode: host or header) and carries it
// through the request context. The Loader interface is implemented by the
// school module's repository and injected at wiring time, so this platform
// package never imports a module.
package tenant

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type Tenant struct {
	ID             uuid.UUID
	Slug           string
	Name           string
	EducationLevel string
	Timezone       string
	Locale         string
	Status         string
}

// Loader reads tenant rows. Implemented by modules/school/repository.
type Loader interface {
	GetBySlug(ctx context.Context, slug string) (Tenant, error)
	GetByDomain(ctx context.Context, host string) (Tenant, error)
	GetSingle(ctx context.Context) (Tenant, error)
}

type Mode string

const (
	ModeSingle Mode = "single"
	ModeMulti  Mode = "multi"
)

type ctxKey int

const tenantKey ctxKey = iota

func WithTenant(ctx context.Context, t Tenant) context.Context {
	ctx = context.WithValue(ctx, tenantKey, t)
	return httpx.WithTenantID(ctx, t.ID)
}

func FromContext(ctx context.Context) (Tenant, bool) {
	t, ok := ctx.Value(tenantKey).(Tenant)
	return t, ok
}

// publicOperationPaths lists routes where a mobile client may supply
// X-Tenant before it has a token, per docs/03 section: tenant resolution
// falls back to the header only for these public endpoints.
var headerAllowedPrefixes = []string{
	"/v1/auth/login",
	"/v1/tenant/branding",
	"/v1/tenants/lookup",
}

// Middleware resolves the tenant for every request and rejects with
// 404 TENANT_NOT_FOUND when it cannot. In single-tenant mode the same
// tenant is cached and reused for every request.
func Middleware(mode Mode, loader Loader, baseDomain string) func(http.Handler) http.Handler {
	single := newSingleTenantCache(loader)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/health" {
				next.ServeHTTP(w, r)
				return
			}

			var (
				t   Tenant
				err error
			)

			switch mode {
			case ModeSingle:
				t, err = single.get(r.Context())
			default:
				t, err = resolveMulti(r, loader, baseDomain)
			}

			if err != nil {
				httpx.WriteError(w, r, httpx.ErrTenantNotFound)
				return
			}

			next.ServeHTTP(w, r.WithContext(WithTenant(r.Context(), t)))
		})
	}
}

func resolveMulti(r *http.Request, loader Loader, baseDomain string) (Tenant, error) {
	host := hostOnly(r.Host)

	if t, err := loader.GetByDomain(r.Context(), host); err == nil {
		return t, nil
	}

	if baseDomain != "" && strings.HasSuffix(host, "."+baseDomain) {
		slug := strings.TrimSuffix(host, "."+baseDomain)
		if slug != "" && !strings.Contains(slug, ".") {
			if t, err := loader.GetBySlug(r.Context(), slug); err == nil {
				return t, nil
			}
		}
	}

	if allowsHeaderTenant(r.URL.Path) {
		if slug := r.Header.Get("X-Tenant"); slug != "" {
			return loader.GetBySlug(r.Context(), slug)
		}
	}

	return Tenant{}, httpx.ErrTenantNotFound
}

func allowsHeaderTenant(path string) bool {
	for _, p := range headerAllowedPrefixes {
		if strings.HasPrefix(path, p) {
			return true
		}
	}
	return false
}

func hostOnly(hostport string) string {
	host, _, err := splitHostPort(hostport)
	if err != nil {
		return hostport
	}
	return host
}

func splitHostPort(hostport string) (string, string, error) {
	if !strings.Contains(hostport, ":") {
		return hostport, "", nil
	}
	idx := strings.LastIndex(hostport, ":")
	return hostport[:idx], hostport[idx+1:], nil
}

// singleTenantCache avoids a database round trip on every request in
// single-tenant mode, refreshing periodically so a settings change is
// eventually picked up without a restart.
type singleTenantCache struct {
	loader Loader
	ttl    time.Duration

	mu      sync.RWMutex
	tenant  Tenant
	expires time.Time
}

func newSingleTenantCache(loader Loader) *singleTenantCache {
	return &singleTenantCache{loader: loader, ttl: 30 * time.Second}
}

func (c *singleTenantCache) get(ctx context.Context) (Tenant, error) {
	c.mu.RLock()
	if (clock.Real{}).Now().Before(c.expires) {
		t := c.tenant
		c.mu.RUnlock()
		return t, nil
	}
	c.mu.RUnlock()

	t, err := c.loader.GetSingle(ctx)
	if err != nil {
		return Tenant{}, err
	}

	c.mu.Lock()
	c.tenant = t
	c.expires = clock.Real{}.Now().Add(c.ttl)
	c.mu.Unlock()

	return t, nil
}
