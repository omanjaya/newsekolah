package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	academicdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

func validDapodikRow() domain.DapodikRow {
	return domain.DapodikRow{
		RowNumber: 2, Name: "Siti Aminah", NISN: "0051234567", NIPD: "2024001",
		GenderRaw: "P", BirthPlace: "Jakarta", BirthDateRaw: "17-08-2012", ClassName: "7A",
	}
}

func TestEvaluateDapodikRow_NewNISNIsCreate(t *testing.T) {
	svc := &Service{}
	row := evaluateResult(t, svc, validDapodikRow(), map[string]uuid.UUID{}, map[string]bool{})
	require.Equal(t, DapodikActionCreate, row.Action)
	require.Empty(t, row.Errors)
}

func TestEvaluateDapodikRow_KnownNISNIsUpdate(t *testing.T) {
	svc := &Service{}
	existingUserID := uuid.New()
	existing := map[string]uuid.UUID{"0051234567": existingUserID}

	evaluated := svc.evaluateDapodikRow(validDapodikRow(), existing, map[string]bool{})
	require.Equal(t, DapodikActionUpdate, evaluated.Action)
	require.Equal(t, existingUserID, evaluated.existingUserID)
}

func TestEvaluateDapodikRow_DuplicateNISNInSameFileIsError(t *testing.T) {
	svc := &Service{}
	seen := map[string]bool{}
	row := validDapodikRow()

	first := svc.evaluateDapodikRow(row, map[string]uuid.UUID{}, seen)
	require.Equal(t, DapodikActionCreate, first.Action)

	second := svc.evaluateDapodikRow(row, map[string]uuid.UUID{}, seen)
	require.Equal(t, DapodikActionError, second.Action)
	require.Contains(t, second.Errors, "duplicate nisn in file")
}

func TestEvaluateDapodikRow_ReRunningTheSameFileStaysIdempotent(t *testing.T) {
	svc := &Service{}
	row := validDapodikRow()
	existingUserID := uuid.New()

	// Simulates running commit twice with the same export: the first run's
	// NISN now shows up in the "existing" map the second run is matched
	// against, so it becomes an update rather than a second create.
	firstRun := svc.evaluateDapodikRow(row, map[string]uuid.UUID{}, map[string]bool{})
	require.Equal(t, DapodikActionCreate, firstRun.Action)

	secondRun := svc.evaluateDapodikRow(row, map[string]uuid.UUID{row.NISN: existingUserID}, map[string]bool{})
	require.Equal(t, DapodikActionUpdate, secondRun.Action)
}

func TestEvaluateDapodikRow_ValidationErrorsShortCircuitMatching(t *testing.T) {
	svc := &Service{}
	row := validDapodikRow()
	row.Name = ""
	row.GenderRaw = "X"

	evaluated := svc.evaluateDapodikRow(row, map[string]uuid.UUID{}, map[string]bool{})
	require.Equal(t, DapodikActionError, evaluated.Action)
	require.Equal(t, []string{"nama is required", "jenis_kelamin must be L or P"}, evaluated.Errors)
}

func evaluateResult(t *testing.T, svc *Service, row domain.DapodikRow, existing map[string]uuid.UUID, seen map[string]bool) DapodikRowResult {
	t.Helper()
	return svc.evaluateDapodikRow(row, existing, seen).DapodikRowResult
}

func TestDapodikCommit_UnavailableWithoutPorts(t *testing.T) {
	svc := &Service{}
	_, err := svc.DapodikCommit(context.Background(), uuid.New(), uuid.New(), []byte("nama,nisn,nipd,jenis_kelamin,tempat_lahir,tanggal_lahir,rombel saat ini\n"))
	require.ErrorIs(t, err, domain.ErrOnboardingUnavailable)
}

func TestResolveStudentRoleID_FindsSeededRole(t *testing.T) {
	identity := newFakeIdentity()
	svc := &Service{identity: identity}

	roleID, err := svc.resolveStudentRoleID(context.Background(), uuid.New())
	require.NoError(t, err)
	require.Equal(t, identity.roleID, roleID)
}

func TestApplyDapodikRow_CreateThenUpdateIsIdempotent(t *testing.T) {
	ctx := context.Background()
	tenantID := uuid.New()
	yearID := uuid.New()
	academic := newFakeAcademic()
	identity := newFakeIdentity()
	svc := &Service{academic: academic, identity: identity, clk: clock.Frozen{At: time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)}}

	// A level template must run first in real use so grade levels exist to
	// match the rombel against; here a bare grade level is enough.
	academic.gradeLevels = append(academic.gradeLevels, academicdomain.GradeLevel{ID: uuid.New(), TenantID: tenantID, Code: "7", Name: "Kelas 7", Sequence: 1})

	roleID, err := svc.resolveStudentRoleID(ctx, tenantID)
	require.NoError(t, err)

	created := svc.evaluateDapodikRow(validDapodikRow(), map[string]uuid.UUID{}, map[string]bool{})
	require.Equal(t, DapodikActionCreate, created.Action)
	require.NoError(t, svc.applyDapodikRow(ctx, tenantID, uuid.New(), yearID, roleID, created))
	require.Len(t, identity.users, 1)
	require.Len(t, academic.classes, 1, "the rombel's class must be created once")

	var studentID uuid.UUID
	for id := range identity.users {
		studentID = id
	}

	// Re-running the same file: the NISN now resolves to the just-created
	// student, so the row becomes an update, not a second create.
	updated := svc.evaluateDapodikRow(validDapodikRow(), map[string]uuid.UUID{validDapodikRow().NISN: studentID}, map[string]bool{})
	require.Equal(t, DapodikActionUpdate, updated.Action)
	require.NoError(t, svc.applyDapodikRow(ctx, tenantID, uuid.New(), yearID, roleID, updated))
	require.Len(t, identity.users, 1, "re-running must not create a second student")
	require.Len(t, academic.classes, 1, "re-running must not create a second class for the same rombel")
}
