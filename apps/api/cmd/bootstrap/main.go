// Command bootstrap creates the single tenant and its first administrator
// for a production deployment: no demo data, no fixed password. It prints
// a one-time set-password link token instead of ever holding a plaintext
// password, per docs/08-security.md section 2 ("admin reset menghasilkan
// tautan set-password, bukan password").
package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/migrator"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/telemetry"
)

const setPasswordTokenTTL = 30 * time.Minute

func main() {
	logger := telemetry.NewLogger()

	tenantSlug := flag.String("tenant-slug", "", "tenant slug, e.g. sman-1-denpasar")
	tenantName := flag.String("tenant-name", "", "tenant display name")
	educationLevel := flag.String("education-level", "sma", "sd|smp|sma|smk|other")
	adminUsername := flag.String("admin-username", "admin", "first administrator's username")
	adminName := flag.String("admin-name", "", "first administrator's full name")
	adminEmail := flag.String("admin-email", "", "first administrator's email (optional)")
	flag.Parse()

	if *tenantSlug == "" || *tenantName == "" || *adminName == "" {
		fmt.Fprintln(os.Stderr, "usage: bootstrap -tenant-slug=... -tenant-name=... -admin-name=... [-admin-username=admin] [-admin-email=...] [-education-level=sma]")
		os.Exit(2)
	}

	if err := run(logger, *tenantSlug, *tenantName, *educationLevel, *adminUsername, *adminName, *adminEmail); err != nil {
		logger.Error("bootstrap failed", "error", err)
		os.Exit(1)
	}
}

// (validate flags, open the pool, create tenant/roles/admin user) run once
// at deploy time; the branches are sequential preconditions, not nested
// decision logic, and splitting them would only hide the same linear steps
// behind indirection.
//
//nolint:gocyclo // one-time CLI bootstrap: a fixed sequence of setup steps
func run(logger *slog.Logger, tenantSlug, tenantName, educationLevel, adminUsername, adminName, adminEmail string) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx := context.Background()
	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	// tenants itself carries no RLS policy (it defines the tenant
	// boundary, so there is nothing to scope it by), but every table this
	// function writes next -- roles, role_permissions, users, user_roles,
	// password_resets -- is RLS-protected and requires app.tenant_id set
	// for its WITH CHECK to pass. Under app_rw (the least-privilege
	// runtime role every production deployment connects as, migration
	// 0004) a plain db.New(pool) insert here has no tenant context and
	// fails with "new row violates row-level security policy" -- this
	// command is the documented `/bootstrap` step of a fresh self-host
	// install (infra/README.md), so that failure would block every new
	// tenant from ever being created.
	q := db.New(pool)

	tenant, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: tenantSlug, Name: tenantName, EducationLevel: educationLevel,
		Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	if err != nil {
		return fmt.Errorf("create tenant: %w", err)
	}
	logger.Info("tenant created", "id", tenant.ID, "slug", tenant.Slug)

	var user db.User
	var token string
	err = database.WithTenantTx(ctx, pool, tenant.ID, func(ctx context.Context) error {
		tx, ok := database.TxFromContext(ctx)
		if !ok {
			return fmt.Errorf("tenant transaction missing from context")
		}
		tq := db.New(tx)

		role, err := tq.CreateRole(ctx, db.CreateRoleParams{
			TenantID: tenant.ID, Slug: "super_admin", Name: "Super Admin", IsSystem: true,
		})
		if err != nil {
			return fmt.Errorf("create super_admin role: %w", err)
		}
		for _, code := range authz.Codes() {
			if err := tq.AddRolePermission(ctx, db.AddRolePermissionParams{RoleID: role.ID, PermissionCode: code, TenantID: tenant.ID}); err != nil {
				return fmt.Errorf("grant %s: %w", code, err)
			}
		}

		// The account starts locked behind an unguessable password nobody
		// (including this process) retains; only the set-password link
		// below can activate it.
		lockPassword, err := randomToken(32)
		if err != nil {
			return err
		}
		passwordHash, err := auth.HashPassword(lockPassword)
		if err != nil {
			return err
		}

		user, err = tq.CreateUser(ctx, db.CreateUserParams{
			TenantID: tenant.ID, Username: adminUsername, Email: database.Text(adminEmail),
			PasswordHash: passwordHash, Name: adminName, Status: "active",
			MustChangePassword: true, Locale: "id",
		})
		if err != nil {
			return fmt.Errorf("create admin user: %w", err)
		}
		if err := tq.AssignUserRole(ctx, db.AssignUserRoleParams{UserID: user.ID, RoleID: role.ID, TenantID: tenant.ID, IsPrimary: true}); err != nil {
			return fmt.Errorf("assign super_admin role: %w", err)
		}

		// Beyond super_admin (the one role this command creates itself,
		// above) and the tenant row, a fresh install otherwise has none of
		// the system roles or duty types every other provisioning path
		// (platform console's CreateTenant, cmd/seed) creates -- an admin
		// could not grant anyone the teacher/student/staff/
		// librarian/admin roles, and no homeroom/counselor/picket/
		// leadership/security/librarian duty existed until the next
		// deploy's migrate ran (migrator.PostUp calls the same routine for
		// every existing tenant). Calling it here, inside this same
		// transaction, makes a fresh install complete immediately instead
		// of waiting on that; database.WithTenantTx's ambient-transaction
		// reuse (see its doc comment) means this joins the transaction
		// already open around this closure rather than opening a second
		// one, so the whole tenant is still all-or-nothing.
		if err := migrator.EnsureTenantDefaults(ctx, pool, tenant.ID); err != nil {
			return fmt.Errorf("ensure tenant defaults: %w", err)
		}

		token, err = randomToken(32)
		if err != nil {
			return err
		}
		if _, err := tq.CreatePasswordReset(ctx, db.CreatePasswordResetParams{
			TenantID: tenant.ID, UserID: user.ID, TokenHash: auth.HashRefreshToken(token),
			Channel: "admin", ExpiresAt: database.Timestamptz((clock.Real{}).Now().Add(setPasswordTokenTTL)),
		}); err != nil {
			return fmt.Errorf("create password reset: %w", err)
		}
		return nil
	})
	if err != nil {
		return err
	}

	logger.Info("administrator created", "tenant_slug", tenant.Slug, "username", user.Username)
	fmt.Printf("Set-password token (expires in %s, single use): %s\n", setPasswordTokenTTL, token)
	fmt.Printf("Give this to %s: https://%s/set-password?token=%s\n", adminName, tenantSlug, token)
	return nil
}

func randomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
