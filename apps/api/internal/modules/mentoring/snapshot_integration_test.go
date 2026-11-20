package mentoring

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// TestStudentSnapshotUnknownStudentIsNotFound: a student id the tenant has
// no user for (a stale link, /students/<zero uuid>) answered 500
// INTERNAL_ERROR, which the web client retried and showed as a failed
// load. It is a 404 now, from the service and through the handler.
func TestStudentSnapshotUnknownStudentIsNotFound(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	fx := seedMentoringFixture(t, pg.AdminPool)
	mod := newTestMentoringModule(t, pg.AppPool)

	snapshot, err := mod.Service.StudentSnapshot(ctx, fx.tenantID, schoolWide, fx.studentID)
	require.NoError(t, err)
	require.Equal(t, "Siswa Test", snapshot.StudentName)

	_, err = mod.Service.StudentSnapshot(ctx, fx.tenantID, schoolWide, uuid.Nil)
	require.ErrorIs(t, err, domain.ErrStudentNotFound)

	// Another tenant's student is not this tenant's either.
	other := seedMentoringFixture(t, pg.AdminPool)
	_, err = mod.Service.StudentSnapshot(ctx, fx.tenantID, schoolWide, other.studentID)
	require.ErrorIs(t, err, domain.ErrStudentNotFound)

	ctx = httpx.WithTenantID(ctx, fx.tenantID)
	_, err = mod.Handler.GetMentorStudentSnapshot(ctx, api.GetMentorStudentSnapshotRequestObject{StudentId: uuid.Nil})
	var appErr *httpx.Error
	require.True(t, errors.As(err, &appErr), "want an *httpx.Error, got %v", err)
	require.Equal(t, http.StatusNotFound, appErr.Status)
}

// TestStudentSnapshotOfNonStudentIsNotFound: the snapshot answered 200
// with a made-up record (name, empty class, every day "NONE") for any
// user of the tenant, so a staff member's or an administrator's id in a
// student address showed a student page. Only a student profile is a
// student; everyone else is a 404, from the service and the handler.
func TestStudentSnapshotOfNonStudentIsNotFound(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	fx := seedMentoringFixture(t, pg.AdminPool)
	mod := newTestMentoringModule(t, pg.AppPool)
	q := db.New(pg.AdminPool)

	staff, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: fx.tenantID, Username: "tu-" + uuid.NewString(), PasswordHash: "x",
		Name: "Admin Contoh", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	require.NoError(t, q.CreateUserProfile(ctx, db.CreateUserProfileParams{
		UserID: staff.ID, TenantID: fx.tenantID, Kind: "staff",
	}))
	// A user with no profile at all (an account made only to administer
	// the school) is no student either.
	bare, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: fx.tenantID, Username: "admin-" + uuid.NewString(), PasswordHash: "x",
		Name: "Operator", Status: "active", Locale: "id",
	})
	require.NoError(t, err)

	for name, id := range map[string]uuid.UUID{
		"staff": staff.ID, "teacher": fx.mentorID, "no profile": bare.ID,
	} {
		_, err := mod.Service.StudentSnapshot(ctx, fx.tenantID, schoolWide, id)
		require.ErrorIs(t, err, domain.ErrStudentNotFound, name)
	}

	hctx := httpx.WithTenantID(ctx, fx.tenantID)
	_, err = mod.Handler.GetMentorStudentSnapshot(hctx, api.GetMentorStudentSnapshotRequestObject{StudentId: staff.ID})
	var appErr *httpx.Error
	require.True(t, errors.As(err, &appErr), "want an *httpx.Error, got %v", err)
	require.Equal(t, http.StatusNotFound, appErr.Status)

	// The student of the same school still has their snapshot.
	snapshot, err := mod.Service.StudentSnapshot(ctx, fx.tenantID, schoolWide, fx.studentID)
	require.NoError(t, err)
	require.Equal(t, "Siswa Test", snapshot.StudentName)
}
