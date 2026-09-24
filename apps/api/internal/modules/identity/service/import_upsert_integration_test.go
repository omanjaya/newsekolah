package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// insertTestRole inserts a system role directly (mirroring cmd/seed's
// CreateRole call), since dbtest.Start only applies migrations: unlike the
// permission catalog itself (migrator.PostUp), no tenant's roles are
// seeded automatically.
func insertTestRole(t *testing.T, pool *pgxpool.Pool, tenantID uuid.UUID, slug, name string) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(context.Background(),
		`insert into roles (tenant_id, slug, name, is_system) values ($1, $2, $3, true) returning id`,
		tenantID, slug, name).Scan(&id)
	require.NoError(t, err)
	return id
}

// grantPermission inserts one role_permissions row. code must already be
// in the permissions catalog, which migrator.PostUp (part of dbtest.Start)
// upserts from authz.Catalog before any test runs.
func grantPermission(t *testing.T, pool *pgxpool.Pool, tenantID, roleID uuid.UUID, code string) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		`insert into role_permissions (role_id, permission_code, tenant_id) values ($1, $2, $3)`,
		roleID, code, tenantID)
	require.NoError(t, err)
}

// assignPrimaryRole grants userID roleID as their one primary role,
// bypassing the service so a test can set up a fixture actor without
// exercising the code under test.
func assignPrimaryRole(t *testing.T, pool *pgxpool.Pool, tenantID, userID, roleID uuid.UUID) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		`insert into user_roles (user_id, role_id, tenant_id, is_primary) values ($1, $2, $3, true)`,
		userID, roleID, tenantID)
	require.NoError(t, err)
}

type userRow struct {
	Name, Email, Phone, PasswordHash string
}

func fetchUserRow(t *testing.T, pool *pgxpool.Pool, userID uuid.UUID) userRow {
	t.Helper()
	var row userRow
	require.NoError(t, pool.QueryRow(context.Background(),
		`select name, coalesce(email,''), coalesce(phone,''), password_hash from users where id = $1`,
		userID).Scan(&row.Name, &row.Email, &row.Phone, &row.PasswordHash))
	return row
}

func fetchStudentNIS(t *testing.T, pool *pgxpool.Pool, userID uuid.UUID) string {
	t.Helper()
	var nis string
	require.NoError(t, pool.QueryRow(context.Background(),
		`select coalesce(nis,'') from student_profiles where user_id = $1`, userID).Scan(&nis))
	return nis
}

func primaryRoleSlug(t *testing.T, pool *pgxpool.Pool, userID uuid.UUID) string {
	t.Helper()
	var slug string
	require.NoError(t, pool.QueryRow(context.Background(),
		`select r.slug from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1 and ur.is_primary`,
		userID).Scan(&slug))
	return slug
}

func studentImportRow(username, email, phone, name, nis string) domain.ImportRow {
	return domain.ImportRow{
		Username: username, Email: email, Password: "Password123!",
		ProfileKind: domain.ProfileStudent, RoleSlug: "student",
		Name: name, NIS: nis, Gender: "female", Phone: phone,
	}
}

// TestCommitImportUpsertCreateAndUpdate covers the three non-error
// actions an upsert-mode row can produce: create (no match), unchanged (a
// match where nothing differs), and update (a match with some fields
// changed) -- and proves an update never touches username or password.
func TestCommitImportUpsertCreateAndUpdate(t *testing.T) {
	pg, svc, _ := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "import-upsert")
	insertTestRole(t, pg.AdminPool, tenantID, "student", "Siswa")
	actorID := insertTestUser(t, pg.AdminPool, tenantID, "actor")

	createRow := studentImportRow("siti", "siti@example.test", "0811111111", "Siti Aminah", "2026001")

	// Create: an upsert-mode row with no existing match behaves exactly
	// like create mode.
	created, err := svc.CommitImport(ctx, tenantID, actorID, []domain.ImportRow{createRow}, service.ImportOptions{Mode: domain.ImportModeUpsert})
	require.NoError(t, err)
	require.Len(t, created, 1)
	require.Equal(t, domain.ImportActionCreate, created[0].Action)
	require.Empty(t, created[0].Errors)

	var userID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select id from users where tenant_id=$1 and username='siti'`, tenantID).Scan(&userID))
	before := fetchUserRow(t, pg.AdminPool, userID)
	require.Equal(t, "Siti Aminah", before.Name)
	require.Equal(t, "siti@example.test", before.Email)
	require.Equal(t, "0811111111", before.Phone, "the phone column must be written on create, not silently dropped")
	require.Equal(t, "2026001", fetchStudentNIS(t, pg.AdminPool, userID))

	// Unchanged: previewing the identical row again reports no changes and
	// writes nothing.
	unchangedRow := createRow
	preview, err := svc.PreviewImport(ctx, tenantID, actorID, []domain.ImportRow{unchangedRow}, service.ImportOptions{Mode: domain.ImportModeUpsert})
	require.NoError(t, err)
	require.Len(t, preview, 1)
	require.Equal(t, domain.ImportActionUnchanged, preview[0].Action)
	require.Empty(t, preview[0].Changes)
	require.Empty(t, preview[0].Errors)

	// Update: name and phone change, email is left blank (must not clear
	// the existing address), NIS is unchanged, and the sheet's password
	// column -- even though filled in with a value that would fail policy
	// validation on create -- must never be applied or rejected on update.
	updateRow := createRow
	updateRow.Name = "Siti Aminah Update"
	updateRow.Phone = "0822222222"
	updateRow.Email = ""
	updateRow.Password = "short"

	updated, err := svc.CommitImport(ctx, tenantID, actorID, []domain.ImportRow{updateRow}, service.ImportOptions{Mode: domain.ImportModeUpsert})
	require.NoError(t, err)
	require.Len(t, updated, 1)
	require.Equal(t, domain.ImportActionUpdate, updated[0].Action)
	require.ElementsMatch(t, []string{"name", "phone"}, updated[0].Changes)
	require.Equal(t, "siti", updated[0].Username, "an update must never change the username")

	after := fetchUserRow(t, pg.AdminPool, userID)
	require.Equal(t, "Siti Aminah Update", after.Name)
	require.Equal(t, "0822222222", after.Phone)
	require.Equal(t, "siti@example.test", after.Email, "a blank email cell must leave the existing address untouched")
	require.Equal(t, before.PasswordHash, after.PasswordHash, "an update must never change the password")
	require.Equal(t, "2026001", fetchStudentNIS(t, pg.AdminPool, userID), "an unchanged NIS cell must not be cleared")
}

// TestCommitImportUpsertConflictAndRollback proves a batch with one
// invalid row (here, an update whose email collides with a different
// user) writes nothing at all -- including the other, otherwise-valid row
// in the same batch.
func TestCommitImportUpsertConflictAndRollback(t *testing.T) {
	pg, svc, _ := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "import-conflict")
	insertTestRole(t, pg.AdminPool, tenantID, "student", "Siswa")
	actorID := insertTestUser(t, pg.AdminPool, tenantID, "actor")

	rows := []domain.ImportRow{
		studentImportRow("siti", "siti@example.test", "0811111111", "Siti Aminah", "2026001"),
		studentImportRow("budi", "budi@example.test", "0811111112", "Budi Santoso", "2026002"),
	}
	_, err := svc.CommitImport(ctx, tenantID, actorID, rows, service.ImportOptions{Mode: domain.ImportModeUpsert})
	require.NoError(t, err)

	var sitiID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select id from users where tenant_id=$1 and username='siti'`, tenantID).Scan(&sitiID))
	before := fetchUserRow(t, pg.AdminPool, sitiID)

	// siti's row would be a clean update on its own; budi's row is invalid
	// because its email now collides with siti's.
	conflict := []domain.ImportRow{
		studentImportRow("siti", "siti@example.test", "0899999999", "Siti Aminah Update", "2026001"),
		studentImportRow("budi", "siti@example.test", "0811111112", "Budi Santoso", "2026002"),
	}
	outcomes, err := svc.CommitImport(ctx, tenantID, actorID, conflict, service.ImportOptions{Mode: domain.ImportModeUpsert})
	require.ErrorIs(t, err, domain.ErrImportHasRowErrors)
	require.Len(t, outcomes, 2)
	require.Empty(t, outcomes[0].Errors, "siti's own row has no error on its own")
	require.NotEmpty(t, outcomes[1].Errors, "budi's row must report the email conflict")

	after := fetchUserRow(t, pg.AdminPool, sitiID)
	require.Equal(t, before, after, "a batch with any invalid row must write nothing, not even the other row's clean update")
}

// TestCommitImportUpsertRoles proves roles are left alone by default, that
// asking for update_roles without manage_permissions is rejected up front
// (not silently ignored), and that granting it actually replaces the
// matched user's role like the admin UI's own role replacement does.
func TestCommitImportUpsertRoles(t *testing.T) {
	pg, svc, _ := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "import-roles")
	insertTestRole(t, pg.AdminPool, tenantID, "student", "Siswa")
	insertTestRole(t, pg.AdminPool, tenantID, "librarian", "Pustakawan")

	plainActorID := insertTestUser(t, pg.AdminPool, tenantID, "actor.plain")

	privilegedRoleID := insertTestRole(t, pg.AdminPool, tenantID, "manager", "Manajer")
	grantPermission(t, pg.AdminPool, tenantID, privilegedRoleID, authz.PermManagePermissions)
	privilegedActorID := insertTestUser(t, pg.AdminPool, tenantID, "actor.privileged")
	assignPrimaryRole(t, pg.AdminPool, tenantID, privilegedActorID, privilegedRoleID)

	createRow := studentImportRow("siti", "siti@example.test", "0811111111", "Siti Aminah", "2026001")
	_, err := svc.CommitImport(ctx, tenantID, plainActorID, []domain.ImportRow{createRow}, service.ImportOptions{Mode: domain.ImportModeUpsert})
	require.NoError(t, err)

	var sitiID uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select id from users where tenant_id=$1 and username='siti'`, tenantID).Scan(&sitiID))
	require.Equal(t, "student", primaryRoleSlug(t, pg.AdminPool, sitiID))

	roleChangeRow := createRow
	roleChangeRow.RoleSlug = "librarian"

	// Default (update_roles unset): the role column is present but must be
	// ignored entirely, even though it names a different, valid role.
	defaultRun, err := svc.CommitImport(ctx, tenantID, plainActorID, []domain.ImportRow{roleChangeRow}, service.ImportOptions{Mode: domain.ImportModeUpsert})
	require.NoError(t, err)
	require.Equal(t, domain.ImportActionUnchanged, defaultRun[0].Action)
	require.Equal(t, "student", primaryRoleSlug(t, pg.AdminPool, sitiID))

	// update_roles requested by an actor without manage_permissions: the
	// whole request is rejected, not silently downgraded to "ignore roles".
	_, err = svc.CommitImport(ctx, tenantID, plainActorID, []domain.ImportRow{roleChangeRow}, service.ImportOptions{Mode: domain.ImportModeUpsert, UpdateRoles: true})
	require.ErrorIs(t, err, domain.ErrImportRoleUpdateForbidden)
	require.Equal(t, "student", primaryRoleSlug(t, pg.AdminPool, sitiID), "a rejected request must not touch roles")

	// update_roles requested by an actor who does hold manage_permissions:
	// the role is replaced.
	privileged, err := svc.CommitImport(ctx, tenantID, privilegedActorID, []domain.ImportRow{roleChangeRow}, service.ImportOptions{Mode: domain.ImportModeUpsert, UpdateRoles: true})
	require.NoError(t, err)
	require.Equal(t, domain.ImportActionUpdate, privileged[0].Action)
	require.Contains(t, privileged[0].Changes, "role")
	require.Equal(t, "librarian", primaryRoleSlug(t, pg.AdminPool, sitiID))
}
