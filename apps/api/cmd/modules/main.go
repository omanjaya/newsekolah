// Command modules lists, enables and disables a school's feature modules
// (the feature_flags table) straight against the database, for the operator
// of an install without the platform console. Every current deployment runs
// TENANCY_MODE=single, where the console's flag endpoints refuse but the
// flags themselves are still enforced, so this is the supported way to
// switch a module off there; it works the same in multi-tenant mode.
//
//	modules list [--tenant <slug>]
//	modules enable <module>... [--tenant <slug>]
//	modules disable <module>... [--tenant <slug>]
//
// It never prompts, so a deploy script can run it. Exit status: 0 on
// success, including an enable or disable that found every module already
// in the requested state; 2 when the command line itself is wrong (unknown
// command or flag, unknown module, a tenant that must be named or does not
// exist), in which case nothing was changed; 1 on any other failure.
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/telemetry"
	"github.com/omanjaya/newsekolah/apps/api/internal/wiring"
)

const (
	exitOK      = 0
	exitFailure = 1
	exitUsage   = 2
)

// auditUserAgent is what the audit_logs rows of a change made here carry
// as user_agent: an operator command has no user, so this is what tells it
// apart from a console change (actor_user_id is NULL).
const auditUserAgent = "cli:modules"

func main() {
	logger := telemetry.NewLogger()
	os.Exit(execute(context.Background(), os.Args[1:], os.Stdout, os.Stderr, logger))
}

// execute runs one invocation and returns its exit status.
func execute(ctx context.Context, args []string, stdout, stderr io.Writer, logger *slog.Logger) int {
	inv, err := parseArgs(args)
	if err == nil && inv.help {
		_, _ = io.WriteString(stdout, usage)
		return exitOK
	}
	if err == nil && inv.action != actionList {
		// Reject a typo before opening a connection; SetFlagsForOperator
		// checks again before it writes anything.
		_, err = service.ValidateModuleNames(inv.modules)
	}
	if err == nil {
		err = run(ctx, inv, stdout)
	}
	return report(err, stderr, logger)
}

func run(ctx context.Context, inv invocation, stdout io.Writer) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	svc := platform.Register(platform.Dependencies{Pool: pool, Clock: clock.Real{}, Mode: cfg.TenancyMode}).Service

	tenant, err := svc.ResolveTenantForOperator(ctx, inv.tenant)
	if err != nil {
		return err
	}
	var out strings.Builder
	fmt.Fprintf(&out, "tenant: %s (%s)\n", tenant.Slug, tenant.Name)

	changed := false
	if inv.action != actionList {
		ctx = httpx.WithRequestMeta(ctx, httpx.RequestMeta{UserAgent: auditUserAgent})
		changes, err := svc.SetFlagsForOperator(ctx, tenant.ID, inv.modules, inv.action == actionEnable)
		if err != nil {
			return err
		}
		changed = writeChanges(&out, changes)
		out.WriteString("\n")
	}
	if _, err := io.WriteString(stdout, out.String()); err != nil {
		return err
	}
	out.Reset()

	flags, err := svc.ListFlagsForOperator(ctx, tenant.ID)
	if err != nil {
		return err
	}
	writeFlags(&out, flags)
	if changed {
		fmt.Fprintf(&out, "\nRunning API processes cache module flags for up to %s, so the change takes effect within %s.\n",
			wiring.DefaultFlagCacheTTL, wiring.DefaultFlagCacheTTL)
	}
	_, err = io.WriteString(stdout, out.String())
	return err
}

// writeChanges prints one line per requested module and reports whether
// any of them actually changed.
func writeChanges(out *strings.Builder, changes []service.OperatorFlagChange) bool {
	changed := false
	for _, c := range changes {
		if c.Changed {
			fmt.Fprintf(out, "%s: %s -> %s\n", c.Module, state(c.Before), state(c.After))
			changed = true
		} else {
			fmt.Fprintf(out, "%s: already %s\n", c.Module, state(c.After))
		}
	}
	return changed
}

func writeFlags(out *strings.Builder, flags []domain.ModuleFlag) {
	width := 0
	for _, f := range flags {
		width = max(width, len(f.Module))
	}
	for _, f := range flags {
		fmt.Fprintf(out, "%-*s  %s\n", width, f.Module, state(f.Enabled))
	}
}

func state(enabled bool) string {
	if enabled {
		return "enabled"
	}
	return "disabled"
}

// report turns run's error into an exit status: a mistake on the command
// line is explained on stderr in plain text, anything else is logged the
// way the other commands log a failure.
func report(err error, stderr io.Writer, logger *slog.Logger) int {
	var usageErr usageError
	var modulesErr *service.OperatorUnknownModulesError
	var tenantErr *service.OperatorTenantError
	switch {
	case err == nil:
		return exitOK
	case errors.As(err, &usageErr):
		_, _ = fmt.Fprintf(stderr, "modules: %s\n\n%s", usageErr.msg, usage)
	case errors.As(err, &modulesErr):
		_, _ = fmt.Fprintf(stderr, "modules: %s\nvalid modules: %s\n", modulesErr, validModules())
	case errors.As(err, &tenantErr):
		_, _ = fmt.Fprintf(stderr, "modules: %s\n", describeTenantError(tenantErr))
	default:
		logger.Error("modules failed", "error", err)
		return exitFailure
	}
	return exitUsage
}

func describeTenantError(e *service.OperatorTenantError) string {
	switch {
	case len(e.Available) == 0:
		return "no tenant exists in this database; create one with bootstrap first"
	case e.Requested == "":
		return fmt.Sprintf("this database holds %d tenants; choose one with --tenant <slug>: %s",
			len(e.Available), strings.Join(e.Available, ", "))
	default:
		return fmt.Sprintf("tenant %q not found; available: %s", e.Requested, strings.Join(e.Available, ", "))
	}
}

func validModules() string {
	names := make([]string, len(domain.AllModules))
	for i, m := range domain.AllModules {
		names[i] = string(m)
	}
	return strings.Join(names, ", ")
}
