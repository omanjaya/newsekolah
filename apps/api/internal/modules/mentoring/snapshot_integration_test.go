package mentoring

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
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

	snapshot, err := mod.Service.StudentSnapshot(ctx, fx.tenantID, fx.studentID)
	require.NoError(t, err)
	require.Equal(t, "Siswa Test", snapshot.StudentName)

	_, err = mod.Service.StudentSnapshot(ctx, fx.tenantID, uuid.Nil)
	require.ErrorIs(t, err, domain.ErrStudentNotFound)

	// Another tenant's student is not this tenant's either.
	other := seedMentoringFixture(t, pg.AdminPool)
	_, err = mod.Service.StudentSnapshot(ctx, fx.tenantID, other.studentID)
	require.ErrorIs(t, err, domain.ErrStudentNotFound)

	ctx = httpx.WithTenantID(ctx, fx.tenantID)
	_, err = mod.Handler.GetMentorStudentSnapshot(ctx, api.GetMentorStudentSnapshotRequestObject{StudentId: uuid.Nil})
	var appErr *httpx.Error
	require.True(t, errors.As(err, &appErr), "want an *httpx.Error, got %v", err)
	require.Equal(t, http.StatusNotFound, appErr.Status)
}
