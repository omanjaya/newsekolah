// Command seed creates a single fictional school ("SMA Contoh") for local
// development and demos: roles, duty types, an active academic year, a
// handful of classes, one user per role, and enough operational data
// (periods, subjects, an enrollment, a homeroom duty, a timetable) for the
// attendance and permits flows to work end to end. It is idempotent: rows
// that already exist are reused, so it can be re-run after a migration.
// It refuses to run when APP_ENV=production, per docs/06-database-schema.md
// section 15.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/telemetry"
)

const (
	tenantSlug = "sma-contoh"
	yearLabel  = "2026/2027"
)

// System roles and their default permissions come from authz.RoleDefaults so
// seed and cmd/migrate never disagree.

var systemRoles = authz.RoleDefaults()

// System duty types and their default permissions come from
// authz.DutyTypeDefaults so seed and a real tenant's bootstrap (platform
// service's CreateTenant) never disagree.

type userSeed struct {
	username string
	name     string
	role     string
}

var systemUsers = []userSeed{
	{"admin", "Admin Contoh", "admin"},
	{"guru", "Guru Contoh", "teacher"},
	{"gurubk", "Guru BK Contoh", "teacher"},
	{"kepsek", "Kepala Sekolah Contoh", "principal"},
	{"siswa", "Siswa Contoh", "student"},
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

	tenant, err := ensureTenant(ctx, q, logger)
	if err != nil {
		return err
	}

	roleIDs, err := seedRoles(ctx, q, tenant.ID)
	if err != nil {
		return err
	}
	if err := seedDuties(ctx, q, tenant.ID); err != nil {
		return err
	}

	year, err := ensureAcademicYear(ctx, q, tenant.ID, logger)
	if err != nil {
		return err
	}

	if err := seedClasses(ctx, q, tenant.ID, year.ID); err != nil {
		return err
	}

	users, err := seedUsers(ctx, q, tenant.ID, roleIDs, cfg.SeedPassword)
	if err != nil {
		return err
	}

	if err := seedOperations(ctx, pool, q, tenant.ID, year.ID, users, logger); err != nil {
		return err
	}

	if err := seedPhase2(ctx, pool, tenant.ID, year.ID, users, cfg.EncryptionSecret(), logger); err != nil {
		return err
	}

	if err := seedLibrary(ctx, pool, tenant.ID, users, logger); err != nil {
		return err
	}

	logger.Info("seed complete", "tenant_slug", tenant.Slug, "password", cfg.SeedPassword)
	return nil
}

func notFound(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

func ensureTenant(ctx context.Context, q *db.Queries, logger *slog.Logger) (db.Tenant, error) {
	tenant, err := q.GetTenantBySlug(ctx, tenantSlug)
	if err == nil {
		logger.Info("tenant exists", "id", tenant.ID, "slug", tenant.Slug)
		return tenant, nil
	}
	if !notFound(err) {
		return db.Tenant{}, fmt.Errorf("lookup tenant: %w", err)
	}
	tenant, err = q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: tenantSlug, Name: "SMA Contoh", EducationLevel: "sma",
		Timezone: "Asia/Makassar", Locale: "id", Status: "active", Plan: "default",
	})
	if err != nil {
		return db.Tenant{}, fmt.Errorf("create tenant: %w", err)
	}
	logger.Info("tenant created", "id", tenant.ID, "slug", tenant.Slug)
	return tenant, nil
}

func ensureAcademicYear(ctx context.Context, q *db.Queries, tenantID uuid.UUID, logger *slog.Logger) (db.AcademicYear, error) {
	year, err := q.GetActiveAcademicYear(ctx, tenantID)
	if err == nil {
		return year, nil
	}
	if !notFound(err) {
		return db.AcademicYear{}, fmt.Errorf("lookup academic year: %w", err)
	}
	year, err = q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tenantID, Label: yearLabel,
		StartsOn: database.Date(time.Date(2026, 7, 13, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2027, 6, 18, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	if err != nil {
		return db.AcademicYear{}, fmt.Errorf("create academic year: %w", err)
	}
	logger.Info("academic year created", "id", year.ID, "label", year.Label)
	return year, nil
}

func seedRoles(ctx context.Context, q *db.Queries, tenantID uuid.UUID) (map[string]uuid.UUID, error) {
	ids := make(map[string]uuid.UUID, len(systemRoles))
	for _, rs := range systemRoles {
		role, err := q.GetRoleBySlug(ctx, db.GetRoleBySlugParams{TenantID: tenantID, Slug: rs.Slug})
		if notFound(err) {
			role, err = q.CreateRole(ctx, db.CreateRoleParams{
				TenantID: tenantID, Slug: rs.Slug, Name: rs.Name, IsSystem: true,
			})
		}
		if err != nil {
			return nil, fmt.Errorf("ensure role %s: %w", rs.Slug, err)
		}
		for _, code := range rs.Permissions {
			if err := q.AddRolePermission(ctx, db.AddRolePermissionParams{RoleID: role.ID, PermissionCode: code, TenantID: tenantID}); err != nil {
				return nil, fmt.Errorf("grant %s to %s: %w", code, rs.Slug, err)
			}
		}
		ids[rs.Slug] = role.ID
	}
	return ids, nil
}

func seedDuties(ctx context.Context, q *db.Queries, tenantID uuid.UUID) error {
	for _, ds := range authz.DutyTypeDefaults() {
		dutyType, err := q.GetDutyTypeBySlug(ctx, db.GetDutyTypeBySlugParams{TenantID: tenantID, Slug: ds.Slug})
		if notFound(err) {
			dutyType, err = q.CreateDutyType(ctx, db.CreateDutyTypeParams{
				TenantID: tenantID, Slug: ds.Slug, Name: ds.Name, ScopeKind: ds.ScopeKind,
			})
		}
		if err != nil {
			return fmt.Errorf("ensure duty type %s: %w", ds.Slug, err)
		}
		for _, code := range ds.Permissions {
			if err := q.AddDutyPermission(ctx, db.AddDutyPermissionParams{DutyTypeID: dutyType.ID, PermissionCode: code, TenantID: tenantID}); err != nil {
				return fmt.Errorf("grant %s to duty %s: %w", code, ds.Slug, err)
			}
		}
	}
	return nil
}

func seedClasses(ctx context.Context, q *db.Queries, tenantID, yearID uuid.UUID) error {
	existingLevels, err := q.AcademicListGradeLevels(ctx, tenantID)
	if err != nil {
		return fmt.Errorf("list grade levels: %w", err)
	}
	levelByCode := make(map[string]db.GradeLevel, len(existingLevels))
	for _, l := range existingLevels {
		levelByCode[l.Code] = l
	}

	grades := []struct {
		code, name string
		seq        int16
	}{
		{"X", "Kelas X", 1}, {"XI", "Kelas XI", 2}, {"XII", "Kelas XII", 3},
	}
	for _, g := range grades {
		level, ok := levelByCode[g.code]
		if !ok {
			level, err = q.CreateGradeLevel(ctx, db.CreateGradeLevelParams{TenantID: tenantID, Code: g.code, Name: g.name, Sequence: g.seq})
			if err != nil {
				return fmt.Errorf("create grade level %s: %w", g.code, err)
			}
		}
		classes, err := q.AcademicListClassesByYearAndGradeLevel(ctx, db.AcademicListClassesByYearAndGradeLevelParams{
			TenantID: tenantID, AcademicYearID: yearID, GradeLevelID: level.ID,
		})
		if err != nil {
			return fmt.Errorf("list classes for %s: %w", g.code, err)
		}
		have := make(map[string]bool, len(classes))
		for _, c := range classes {
			have[c.Name] = true
		}
		for _, section := range []string{"A", "B"} {
			name := fmt.Sprintf("%s-%s", g.code, section)
			if have[name] {
				continue
			}
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

// seedUsers returns the users keyed by username so the operational seed can
// reference the teacher and the student.
func seedUsers(ctx context.Context, q *db.Queries, tenantID uuid.UUID, roleIDs map[string]uuid.UUID, password string) (map[string]db.User, error) {
	hash, err := auth.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("hash seed password: %w", err)
	}

	profileKindByRole := map[string]string{
		"admin": "staff", "teacher": "teacher", "student": "student",
		// A "Kepala Sekolah" is drawn from the teaching staff (Indonesian
		// regulation requires a principal to hold a teaching
		// certification), matching the "leadership" duty type's usual
		// holder (Wakil Kepala Sekolah, also a teacher). This is what
		// makes profileKinds: ["teacher", "staff"] nav items (journal,
		// check-in, the class/student roster) visible to the principal.
		"principal": "teacher",
	}

	users := make(map[string]db.User, len(systemUsers))
	for _, us := range systemUsers {
		user, err := q.GetUserByUsername(ctx, db.GetUserByUsernameParams{TenantID: tenantID, Username: us.username})
		if err == nil {
			users[us.username] = user
			continue
		}
		if !notFound(err) {
			return nil, fmt.Errorf("lookup user %s: %w", us.username, err)
		}

		user, err = q.CreateUser(ctx, db.CreateUserParams{
			TenantID: tenantID, Username: us.username, PasswordHash: hash, Name: us.name,
			Status: "active", MustChangePassword: false, Locale: "id",
		})
		if err != nil {
			return nil, fmt.Errorf("create user %s: %w", us.username, err)
		}

		roleID, ok := roleIDs[us.role]
		if !ok {
			return nil, fmt.Errorf("unknown role %q for user %s", us.role, us.username)
		}
		if err := q.AssignUserRole(ctx, db.AssignUserRoleParams{
			UserID: user.ID, RoleID: roleID, TenantID: tenantID, IsPrimary: true,
		}); err != nil {
			return nil, fmt.Errorf("assign role to %s: %w", us.username, err)
		}

		if kind, ok := profileKindByRole[us.role]; ok {
			if err := q.CreateUserProfile(ctx, db.CreateUserProfileParams{UserID: user.ID, TenantID: tenantID, Kind: kind}); err != nil {
				return nil, fmt.Errorf("create profile for %s: %w", us.username, err)
			}
		}
		users[us.username] = user
	}
	if err := seedDetailedProfiles(ctx, q, tenantID, users); err != nil {
		return nil, err
	}
	return users, nil
}

// seedDetailedProfiles fills the per-kind profile tables. Approver rules
// such as any_teacher read teacher_profiles, so a teacher without one is
// invisible to the permits workflow. The upserts are idempotent.
func seedDetailedProfiles(ctx context.Context, q *db.Queries, tenantID uuid.UUID, users map[string]db.User) error {
	text := func(s string) pgtype.Text { return pgtype.Text{String: s, Valid: true} }
	year := pgtype.Int2{Int16: 2020, Valid: true}

	teachers := map[string]string{"guru": "Matematika", "gurubk": "Bimbingan Konseling", "kepsek": "Kepemimpinan Sekolah"}
	for username, specialization := range teachers {
		u, ok := users[username]
		if !ok {
			continue
		}
		if err := q.UpsertTeacherProfile(ctx, db.UpsertTeacherProfileParams{
			UserID: u.ID, TenantID: tenantID, Nip: text("1987" + username), EmploymentStatus: text("pns"),
			LastEducation: text("S1"), JoinedYear: year, Specialization: text(specialization),
		}); err != nil {
			return fmt.Errorf("upsert teacher profile %s: %w", username, err)
		}
	}
	if u, ok := users["siswa"]; ok {
		if err := q.UpsertStudentProfile(ctx, db.UpsertStudentProfileParams{
			UserID: u.ID, TenantID: tenantID, Nis: text("2026001"), Nisn: text("0091234567"),
			EntryYear: pgtype.Int2{Int16: 2026, Valid: true}, GuardianName: text("Orang Tua Contoh"),
		}); err != nil {
			return fmt.Errorf("upsert student profile: %w", err)
		}
	}
	if u, ok := users["admin"]; ok {
		if err := q.UpsertStaffProfile(ctx, db.UpsertStaffProfileParams{
			UserID: u.ID, TenantID: tenantID, EmployeeNumber: text("ADM001"), Position: text("Tata Usaha"),
			EmploymentStatus: text("tetap"), JoinedYear: year,
		}); err != nil {
			return fmt.Errorf("upsert staff profile: %w", err)
		}
	}
	return nil
}
