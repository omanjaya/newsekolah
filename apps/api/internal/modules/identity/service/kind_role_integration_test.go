package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

// TestCreateAndUpdateUserRejectKindRoleMismatch reproduces the "Siswa with
// primary role Admin Sekolah" account the user form used to accept: it
// logged in with the full admin menu and still showed up in class
// placement as a student. CreateUser, UpdateUser and the import must all
// refuse a student profile without the student role, and a staff profile
// with it.
func TestCreateAndUpdateUserRejectKindRoleMismatch(t *testing.T) {
	pg, svc, _ := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "kind-role")
	studentRole := insertTestRole(t, pg.AdminPool, tenantID, "student", "Siswa")
	adminRole := insertTestRole(t, pg.AdminPool, tenantID, "admin", "Admin Sekolah")
	teacherRole := insertTestRole(t, pg.AdminPool, tenantID, "teacher", "Guru")
	actorID := insertTestUser(t, pg.AdminPool, tenantID, "actor")

	primary := func(id uuid.UUID) []domain.RoleGrant {
		return []domain.RoleGrant{{RoleID: id, IsPrimary: true}}
	}
	studentInput := func(roles []domain.RoleGrant) service.CreateUserInput {
		return service.CreateUserInput{
			Username: "salahperan",
			UserWriteInput: service.UserWriteInput{
				Name: "Siswa Salah Peran", ProfileKind: domain.ProfileStudent,
				Profile: service.UserProfileFields{NIS: "2026999"}, Roles: roles,
			},
		}
	}

	_, err := svc.CreateUser(ctx, tenantID, actorID, studentInput(primary(adminRole)))
	require.ErrorIs(t, err, domain.ErrKindRoleMismatch)

	_, err = svc.CreateUser(ctx, tenantID, actorID, service.CreateUserInput{
		Username: "guru.siswa",
		UserWriteInput: service.UserWriteInput{
			Name: "Guru Berperan Siswa", ProfileKind: domain.ProfileTeacher,
			Profile: service.UserProfileFields{NIP: "1987"}, Roles: primary(studentRole),
		},
	})
	require.ErrorIs(t, err, domain.ErrKindRoleMismatch)

	created, err := svc.CreateUser(ctx, tenantID, actorID, studentInput(primary(studentRole)))
	require.NoError(t, err)

	update := service.UserWriteInput{
		Name: "Siswa Salah Peran", ProfileKind: domain.ProfileStudent, Locale: "id",
		Profile: service.UserProfileFields{NIS: "2026999"}, Roles: primary(adminRole),
	}
	_, err = svc.UpdateUser(ctx, tenantID, actorID, created.ID, update)
	require.ErrorIs(t, err, domain.ErrKindRoleMismatch, "replacing the role must check it against the kind")

	update.Roles = nil
	update.ProfileKind = domain.ProfileTeacher
	_, err = svc.UpdateUser(ctx, tenantID, actorID, created.ID, update)
	require.ErrorIs(t, err, domain.ErrKindRoleMismatch, "changing only the kind must check it against the stored role")

	update.Roles = primary(teacherRole)
	_, err = svc.UpdateUser(ctx, tenantID, actorID, created.ID, update)
	require.NoError(t, err, "a kind change together with a matching role is fine")
	require.Equal(t, "teacher", primaryRoleSlug(t, pg.AdminPool, created.ID))
}

// TestPreviewImportReportsCodedRowErrors proves import row errors are
// codes (never English sentences) and that a clean row carries no errors,
// including the kind/role rule above.
func TestPreviewImportReportsCodedRowErrors(t *testing.T) {
	pg, svc, _ := setupIdentityTest(t)
	ctx := context.Background()
	tenantID := insertTestTenant(t, pg.AdminPool, "import-codes")
	insertTestRole(t, pg.AdminPool, tenantID, "student", "Siswa")
	insertTestRole(t, pg.AdminPool, tenantID, "admin", "Admin Sekolah")
	actorID := insertTestUser(t, pg.AdminPool, tenantID, "actor")

	valid := studentImportRow("budi.santoso", "", "", "Budi Santoso", "2026102")
	adminStudent := studentImportRow("salahperan", "", "", "Siswa Salah Peran", "2026999")
	adminStudent.RoleSlug = "admin"
	broken := domain.ImportRow{
		Username: "rusak", ProfileKind: domain.ProfileStudent, RoleSlug: "siswa",
		Gender: "X", BirthDate: "17/05/2010", EntryYear: "dua ribu",
	}
	unknownRole := studentImportRow("peran.asing", "", "", "Peran Asing", "2026103")
	unknownRole.RoleSlug = "guru_bk"

	outcomes, err := svc.PreviewImport(ctx, tenantID, actorID,
		[]domain.ImportRow{valid, adminStudent, broken, unknownRole}, service.ImportOptions{})
	require.NoError(t, err)
	require.Len(t, outcomes, 4)

	require.Equal(t, domain.ImportActionCreate, outcomes[0].Action)
	require.Empty(t, outcomes[0].Errors)

	require.Equal(t, domain.ImportActionError, outcomes[1].Action)
	require.Equal(t, []domain.ImportRowError{{
		Code: domain.ImportErrKindRoleMismatch, Field: "role_slug",
		Params: map[string]string{"kind": "student", "role": "admin"},
	}}, outcomes[1].Errors)

	require.Equal(t, []string{
		domain.ImportErrNameRequired, domain.ImportErrGenderInvalid, domain.ImportErrBirthDateFormat,
		domain.ImportErrNISRequired, domain.ImportErrEntryYearNotNumber,
	}, domain.ImportRowErrorCodes(outcomes[2].Errors))

	require.Equal(t, []domain.ImportRowError{{
		Code: domain.ImportErrRoleNotFound, Field: "role_slug", Params: map[string]string{"role": "guru_bk"},
	}}, outcomes[3].Errors)
}
