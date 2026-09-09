// Command seed creates a single fictional school ("SMA Contoh") for local
// development and demos: roles, duty types, an active academic year, a
// handful of classes, and one user per role. It refuses to run when
// APP_ENV=production, per docs/06-database-schema.md section 15.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/telemetry"
)

// roleSlug names the seven system roles carried over from
// docs/analysis/backend-inventory.md section 1.2, plus librarian for the
// library module (docs/analysis/backend-inventory.md section 7).
type roleSeed struct {
	slug        string
	name        string
	permissions []string
}

var systemRoles = []roleSeed{
	{"super_admin", "Super Admin", authz.Codes()},
	{"admin", "Admin Sekolah", filterOut(authz.Codes(), authz.PermManagePermissions)},
	{"teacher", "Guru", []string{
		authz.PermViewDashboard, authz.PermViewAnnouncements, authz.PermViewSchedules,
		authz.PermViewAttendance, authz.PermManageAttendance, authz.PermViewNotifications,
		authz.PermManageGrades, authz.PermViewLibrary,
	}},
	{"staff", "Pegawai", []string{
		authz.PermViewDashboard, authz.PermViewAnnouncements, authz.PermViewNotifications, authz.PermViewLibrary,
	}},
	{"student", "Siswa", []string{
		authz.PermViewDashboard, authz.PermViewAnnouncements, authz.PermViewNotifications,
		authz.PermViewOwnGrades, authz.PermSubmitLeaveRequests, authz.PermViewAttendance, authz.PermViewLibrary,
	}},
	{"parent", "Orang Tua", []string{
		authz.PermViewDashboard, authz.PermViewAnnouncements, authz.PermViewNotifications,
		authz.PermViewChildAttendance, authz.PermViewChildGrades,
	}},
	{"librarian", "Pustakawan", []string{
		authz.PermViewDashboard, authz.PermViewNotifications, authz.PermViewLibrary,
		authz.PermManageLibraryCatalog, authz.PermManageLibraryCirculation,
		authz.PermManageLibraryMembers, authz.PermManageLibrarySettings, authz.PermViewLibraryReports,
	}},
}

type dutySeed struct {
	slug        string
	name        string
	scopeKind   string
	permissions []string
}

var systemDuties = []dutySeed{
	{"homeroom", "Wali Kelas", "class", []string{authz.PermReviewLeaveRequests, authz.PermCorrectAttendance}},
	{"counselor", "Guru BK", "school", []string{authz.PermIssueLeaveLetters, authz.PermViewReports}},
	{"picket", "Guru Piket", "school", []string{authz.PermManageAttendance}},
	{"leadership", "Wakil Kepala Sekolah", "school", []string{authz.PermReviewLeaveRequests, authz.PermIssueLeaveLetters, authz.PermViewReports}},
	{"security", "Satpam", "school", []string{authz.PermScanExitPermits}},
	{"librarian", "Petugas Perpustakaan", "school", []string{authz.PermManageLibraryCirculation}},
}

type userSeed struct {
	username string
	name     string
	role     string
}

var systemUsers = []userSeed{
	{"admin", "Admin Contoh", "admin"},
	{"guru", "Guru Contoh", "teacher"},
	{"siswa", "Siswa Contoh", "student"},
	{"ortu", "Orang Tua Contoh", "parent"},
}

func main() {
	logger := telemetry.NewLogger()
	if err := run(logger); err != nil {
		logger.Error("seed failed", "error", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if cfg.IsProduction() {
		return fmt.Errorf("refusing to seed: APP_ENV=production")
	}

	ctx := context.Background()
	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	q := db.New(pool)

	tenant, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "sma-contoh", Name: "SMA Contoh", EducationLevel: "sma",
		Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	if err != nil {
		return fmt.Errorf("create tenant: %w", err)
	}
	logger.Info("tenant created", "id", tenant.ID, "slug", tenant.Slug)

	roleIDs, err := seedRoles(ctx, q, tenant.ID)
	if err != nil {
		return err
	}
	if err := seedDuties(ctx, q, tenant.ID); err != nil {
		return err
	}

	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tenant.ID, Label: "2026/2027",
		StartsOn: database.Date(time.Date(2026, 7, 13, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2027, 6, 18, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	if err != nil {
		return fmt.Errorf("create academic year: %w", err)
	}
	logger.Info("academic year created", "id", year.ID, "label", year.Label)

	if err := seedClasses(ctx, q, tenant.ID, year.ID); err != nil {
		return err
	}

	if err := seedUsers(ctx, q, tenant.ID, roleIDs, year.ID, cfg.SeedPassword); err != nil {
		return err
	}

	logger.Info("seed complete", "tenant_slug", tenant.Slug, "password", cfg.SeedPassword)
	return nil
}

func seedRoles(ctx context.Context, q *db.Queries, tenantID uuid.UUID) (map[string]uuid.UUID, error) {
	ids := make(map[string]uuid.UUID, len(systemRoles))
	for _, rs := range systemRoles {
		role, err := q.CreateRole(ctx, db.CreateRoleParams{
			TenantID: tenantID, Slug: rs.slug, Name: rs.name, IsSystem: true,
		})
		if err != nil {
			return nil, fmt.Errorf("create role %s: %w", rs.slug, err)
		}
		for _, code := range rs.permissions {
			if err := q.AddRolePermission(ctx, db.AddRolePermissionParams{RoleID: role.ID, PermissionCode: code, TenantID: tenantID}); err != nil {
				return nil, fmt.Errorf("grant %s to %s: %w", code, rs.slug, err)
			}
		}
		ids[rs.slug] = role.ID
	}
	return ids, nil
}

func seedDuties(ctx context.Context, q *db.Queries, tenantID uuid.UUID) error {
	for _, ds := range systemDuties {
		dutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{
			TenantID: tenantID, Slug: ds.slug, Name: ds.name, ScopeKind: ds.scopeKind,
		})
		if err != nil {
			return fmt.Errorf("create duty type %s: %w", ds.slug, err)
		}
		for _, code := range ds.permissions {
			if err := q.AddDutyPermission(ctx, db.AddDutyPermissionParams{DutyTypeID: dutyType.ID, PermissionCode: code, TenantID: tenantID}); err != nil {
				return fmt.Errorf("grant %s to duty %s: %w", code, ds.slug, err)
			}
		}
	}
	return nil
}

func seedClasses(ctx context.Context, q *db.Queries, tenantID, yearID uuid.UUID) error {
	grades := []struct {
		code, name string
		seq        int16
	}{
		{"X", "Kelas X", 1}, {"XI", "Kelas XI", 2}, {"XII", "Kelas XII", 3},
	}
	for _, g := range grades {
		level, err := q.CreateGradeLevel(ctx, db.CreateGradeLevelParams{TenantID: tenantID, Code: g.code, Name: g.name, Sequence: g.seq})
		if err != nil {
			return fmt.Errorf("create grade level %s: %w", g.code, err)
		}
		for _, section := range []string{"A", "B"} {
			name := fmt.Sprintf("%s-%s", g.code, section)
			if _, err := q.CreateClass(ctx, db.CreateClassParams{
				TenantID: tenantID, AcademicYearID: yearID, GradeLevelID: level.ID, Name: name,
				Capacity: pgtype.Int4{Int32: 32, Valid: true},
			}); err != nil {
				return fmt.Errorf("create class %s: %w", name, err)
			}
		}
	}
	return nil
}

func seedUsers(ctx context.Context, q *db.Queries, tenantID uuid.UUID, roleIDs map[string]uuid.UUID, yearID uuid.UUID, password string) error {
	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash seed password: %w", err)
	}

	profileKindByRole := map[string]string{
		"admin": "staff", "teacher": "teacher", "student": "student", "parent": "parent",
	}

	for _, us := range systemUsers {
		user, err := q.CreateUser(ctx, db.CreateUserParams{
			TenantID: tenantID, Username: us.username, PasswordHash: hash, Name: us.name,
			Status: "active", MustChangePassword: true, Locale: "id",
		})
		if err != nil {
			return fmt.Errorf("create user %s: %w", us.username, err)
		}

		roleID, ok := roleIDs[us.role]
		if !ok {
			return fmt.Errorf("unknown role %q for user %s", us.role, us.username)
		}
		if err := q.AssignUserRole(ctx, db.AssignUserRoleParams{
			UserID: user.ID, RoleID: roleID, TenantID: tenantID, IsPrimary: true,
		}); err != nil {
			return fmt.Errorf("assign role to %s: %w", us.username, err)
		}

		if kind, ok := profileKindByRole[us.role]; ok {
			if err := q.CreateUserProfile(ctx, db.CreateUserProfileParams{UserID: user.ID, TenantID: tenantID, Kind: kind}); err != nil {
				return fmt.Errorf("create profile for %s: %w", us.username, err)
			}
		}
	}

	_ = yearID // reserved for a future duty_assignments seed (e.g. the teacher as homeroom of X-A)
	return nil
}

func filterOut(codes []string, exclude string) []string {
	out := make([]string, 0, len(codes))
	for _, c := range codes {
		if c != exclude {
			out = append(out, c)
		}
	}
	return out
}
