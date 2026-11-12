package main

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

const cacheNotice = "takes effect within 15s"

type cliResult struct {
	code   int
	stdout string
	stderr string
}

// runCLI runs the command the way main does, reading its database and
// tenancy mode from the environment useDatabase set.
func runCLI(t *testing.T, args ...string) cliResult {
	t.Helper()
	var stdout, stderr bytes.Buffer
	code := execute(context.Background(), args, &stdout, &stderr, slog.New(slog.DiscardHandler))
	return cliResult{code: code, stdout: stdout.String(), stderr: stderr.String()}
}

// useDatabase points the command at the test container as app_rw -- the
// least-privilege role production's api container (and so this command,
// run inside it) connects as, with row level security enforced.
func useDatabase(t *testing.T, pg dbtest.Postgres, mode config.TenancyMode) {
	t.Helper()
	t.Setenv("APP_ENV", "development")
	t.Setenv("DATABASE_URL", dbtest.RestrictedConnString(pg.DSN, "app_rw", dbtest.AppRWPassword))
	t.Setenv("JWT_SIGNING_KEY", "test-jwt-signing-key-0123456789")
	t.Setenv("DOCUMENT_SIGNING_KEY", "test-document-signing-key-0123456789")
	t.Setenv("TENANCY_MODE", string(mode))
}

func createTenant(t *testing.T, pg dbtest.Postgres, slug, name string) uuid.UUID {
	t.Helper()
	tenant, err := db.New(pg.AdminPool).CreateTenant(context.Background(), db.CreateTenantParams{
		Slug: slug, Name: name, EducationLevel: "sma", Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	return tenant.ID
}

func storedFlags(t *testing.T, pg dbtest.Postgres, tenantID uuid.UUID) map[string]bool {
	t.Helper()
	rows, err := pg.AdminPool.Query(context.Background(),
		`select module, enabled from feature_flags where tenant_id = $1`, tenantID)
	require.NoError(t, err)
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var module string
		var enabled bool
		require.NoError(t, rows.Scan(&module, &enabled))
		out[module] = enabled
	}
	require.NoError(t, rows.Err())
	return out
}

type flagAuditRow struct {
	Action    string
	Actor     *uuid.UUID
	UserAgent string
	Before    string
	After     string
}

func flagAuditRows(t *testing.T, pg dbtest.Postgres, tenantID uuid.UUID) []flagAuditRow {
	t.Helper()
	rows, err := pg.AdminPool.Query(context.Background(), `
		select action, actor_user_id, coalesce(user_agent, ''), before::text, after::text
		from audit_logs
		where tenant_id = $1 and entity_type = 'feature_flag'
		order by id`, tenantID)
	require.NoError(t, err)
	defer rows.Close()
	var out []flagAuditRow
	for rows.Next() {
		var r flagAuditRow
		require.NoError(t, rows.Scan(&r.Action, &r.Actor, &r.UserAgent, &r.Before, &r.After))
		out = append(out, r)
	}
	require.NoError(t, rows.Err())
	return out
}

// listedFlags reads the module table out of the command's stdout as
// "module state" lines, in printed order.
func listedFlags(stdout string) []string {
	var out []string
	for _, line := range strings.Split(stdout, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && (fields[1] == "enabled" || fields[1] == "disabled") && domain.Module(fields[0]).Valid() {
			out = append(out, fields[0]+" "+fields[1])
		}
	}
	return out
}

// expectedFlags is every module in domain.AllModules order, enabled unless
// named in disabled.
func expectedFlags(disabled ...string) []string {
	off := map[string]bool{}
	for _, m := range disabled {
		off[m] = true
	}
	out := make([]string, len(domain.AllModules))
	for i, m := range domain.AllModules {
		out[i] = string(m) + " enabled"
		if off[string(m)] {
			out[i] = string(m) + " disabled"
		}
	}
	return out
}

func TestModulesCommandSingleTenant(t *testing.T) {
	pg := dbtest.Start(t)
	useDatabase(t, pg, config.TenancySingle)

	r := runCLI(t, "list")
	require.Equal(t, exitUsage, r.code)
	require.Contains(t, r.stderr, "no tenant exists")

	tenantID := createTenant(t, pg, "solo", "Solo School")

	t.Run("list shows the opt-out defaults without --tenant", func(t *testing.T) {
		r := runCLI(t, "list")
		require.Equal(t, exitOK, r.code, r.stderr)
		require.True(t, strings.HasPrefix(r.stdout, "tenant: solo (Solo School)\n"), r.stdout)
		require.Equal(t, expectedFlags(), listedFlags(r.stdout))
		require.NotContains(t, r.stdout, cacheNotice)
		require.Empty(t, storedFlags(t, pg, tenantID), "listing must not write rows")
	})

	t.Run("disable then list", func(t *testing.T) {
		r := runCLI(t, "disable", "library", "grading")
		require.Equal(t, exitOK, r.code, r.stderr)
		require.Contains(t, r.stdout, "library: enabled -> disabled\n")
		require.Contains(t, r.stdout, "grading: enabled -> disabled\n")
		require.Equal(t, expectedFlags("library", "grading"), listedFlags(r.stdout))
		require.Contains(t, r.stdout, cacheNotice)
		require.Equal(t, map[string]bool{"library": false, "grading": false}, storedFlags(t, pg, tenantID))

		audits := flagAuditRows(t, pg, tenantID)
		require.Len(t, audits, 2)
		for _, a := range audits {
			require.Equal(t, "feature_flag.update", a.Action)
			require.Nil(t, a.Actor, "an operator command has no user")
			require.Equal(t, auditUserAgent, a.UserAgent)
		}
		require.JSONEq(t, `{"module":"library","enabled":true}`, audits[0].Before)
		require.JSONEq(t, `{"module":"library","enabled":false}`, audits[0].After)

		r = runCLI(t, "list")
		require.Equal(t, exitOK, r.code, r.stderr)
		require.Equal(t, expectedFlags("library", "grading"), listedFlags(r.stdout))
	})

	t.Run("repeating a change is a successful no-op", func(t *testing.T) {
		r := runCLI(t, "disable", "library")
		require.Equal(t, exitOK, r.code, r.stderr)
		require.Contains(t, r.stdout, "library: already disabled\n")
		require.NotContains(t, r.stdout, cacheNotice)
		require.Len(t, flagAuditRows(t, pg, tenantID), 2, "a no-op writes no audit row")
	})

	t.Run("enable restores", func(t *testing.T) {
		r := runCLI(t, "enable", "library", "--tenant", "solo")
		require.Equal(t, exitOK, r.code, r.stderr)
		require.Contains(t, r.stdout, "library: disabled -> enabled\n")
		require.Equal(t, expectedFlags("grading"), listedFlags(r.stdout))
		require.Contains(t, r.stdout, cacheNotice)
		require.Equal(t, map[string]bool{"library": true, "grading": false}, storedFlags(t, pg, tenantID))
		require.Len(t, flagAuditRows(t, pg, tenantID), 3)
	})

	t.Run("an unknown module changes nothing", func(t *testing.T) {
		before := storedFlags(t, pg, tenantID)
		r := runCLI(t, "disable", "visitors", "nope")
		require.Equal(t, exitUsage, r.code)
		require.Empty(t, r.stdout)
		require.Contains(t, r.stderr, "unknown module(s): nope")
		require.Contains(t, r.stderr, "valid modules: library, discipline, grading, permits,")
		require.Equal(t, before, storedFlags(t, pg, tenantID))
		require.Len(t, flagAuditRows(t, pg, tenantID), 3)
	})

	t.Run("an unknown slug is refused with the available ones", func(t *testing.T) {
		r := runCLI(t, "disable", "visitors", "--tenant", "ghost")
		require.Equal(t, exitUsage, r.code)
		require.Contains(t, r.stderr, `tenant "ghost" not found; available: solo`)
		require.NotContains(t, storedFlags(t, pg, tenantID), "visitors")
	})
}

func TestModulesCommandSeveralTenants(t *testing.T) {
	pg := dbtest.Start(t)
	useDatabase(t, pg, config.TenancyMulti)
	alphaID := createTenant(t, pg, "alpha", "Alpha School")
	betaID := createTenant(t, pg, "beta", "Beta School")

	t.Run("--tenant is required", func(t *testing.T) {
		r := runCLI(t, "list")
		require.Equal(t, exitUsage, r.code)
		require.Contains(t, r.stderr, "this database holds 2 tenants; choose one with --tenant <slug>: alpha, beta")

		r = runCLI(t, "disable", "library")
		require.Equal(t, exitUsage, r.code)
		require.Empty(t, storedFlags(t, pg, alphaID))
		require.Empty(t, storedFlags(t, pg, betaID))
	})

	t.Run("an unknown slug is refused with the available ones", func(t *testing.T) {
		r := runCLI(t, "list", "--tenant", "ghost")
		require.Equal(t, exitUsage, r.code)
		require.Contains(t, r.stderr, `tenant "ghost" not found; available: alpha, beta`)
	})

	t.Run("a change applies to the named tenant only", func(t *testing.T) {
		r := runCLI(t, "disable", "library", "--tenant", "beta")
		require.Equal(t, exitOK, r.code, r.stderr)
		require.True(t, strings.HasPrefix(r.stdout, "tenant: beta (Beta School)\n"), r.stdout)
		require.Equal(t, expectedFlags("library"), listedFlags(r.stdout))
		require.Equal(t, map[string]bool{"library": false}, storedFlags(t, pg, betaID))
		require.Empty(t, storedFlags(t, pg, alphaID))

		r = runCLI(t, "list", "--tenant=alpha")
		require.Equal(t, exitOK, r.code, r.stderr)
		require.Equal(t, expectedFlags(), listedFlags(r.stdout))
	})
}
