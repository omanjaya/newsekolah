package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	identityrepo "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/repository"
	identityservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/migrator"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestPrincipalWithLeadershipDutyApprovesLateArrival is the school that
// lets its principal approve the Pimpinan stage by assigning them the
// "leadership" duty (authz.RoleDefaults' principal comment). The principal
// role leaves issue_scan_tokens out, so the duty's own default permissions
// must carry it: otherwise POST /v1/scan-tokens refuses the stage QR the
// student is waiting for. The tenant gets its roles and duty types from
// the same defaults a real tenant is provisioned with, the permission
// check runs through identity's real EffectivePermissions and the bundled
// spec, and the student's scan of the minted QR moves the flow on.
func TestPrincipalWithLeadershipDutyApprovesLateArrival(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "principal-lead-"+uuid.NewString())
	require.NoError(t, migrator.EnsureTenantDefaults(ctx, pg.AdminPool, w.tenantID))
	q := db.New(pg.AdminPool)

	principal, err := q.CreateUser(ctx, db.CreateUserParams{
		TenantID: w.tenantID, Username: "kepsek-" + uuid.NewString(), PasswordHash: "x", Name: "Kepala Sekolah", Status: "active", Locale: "id",
	})
	require.NoError(t, err)
	role, err := q.GetRoleBySlug(ctx, db.GetRoleBySlugParams{TenantID: w.tenantID, Slug: authz.RoleSlugPrincipal})
	require.NoError(t, err)
	require.NoError(t, q.AssignUserRole(ctx, db.AssignUserRoleParams{UserID: principal.ID, RoleID: role.ID, TenantID: w.tenantID, IsPrimary: true}))
	leadership, err := q.GetDutyTypeBySlug(ctx, db.GetDutyTypeBySlugParams{TenantID: w.tenantID, Slug: "leadership"})
	require.NoError(t, err)
	_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
		TenantID: w.tenantID, AcademicYearID: w.yearID, DutyTypeID: leadership.ID, UserID: principal.ID,
		StartsOn: database.Date(time.Now().AddDate(0, 0, -30)),
	})
	require.NoError(t, err)

	identity := identityservice.New(pg.AppPool, identityrepo.New(pg.AppPool), school.Register(pg.AppPool, tenant.ModeSingle, nil).Service,
		nil, nil, clock.Real{}, identityservice.Config{}, auth.NewRefreshToken, identityservice.Extras{})
	doc, err := api.GetSpec()
	require.NoError(t, err)
	ops, err := authz.LoadOperationPermissions(doc)
	require.NoError(t, err)
	caller := authz.Identity{Authenticated: true, UserID: principal.ID, TenantID: w.tenantID}
	require.NoError(t, authz.Authorize(ctx, ops, identity, "IssueScanToken", caller),
		"the leadership duty must let a principal mint the stage QR")

	svc := buildRealtimeTestService(pg.AppPool, &fakeRealtimeHub{})
	opened := openLateArrival(t, ctx, svc, w)
	_, err = svc.ReviewLateArrival(ctx, service.ReviewLateArrivalInput{
		TenantID: w.tenantID, InstanceID: opened.Instance.ID, ReviewerUserID: w.dutyTeacherID,
	})
	require.NoError(t, err)

	queue, err := svc.ListLateArrivalsForReview(ctx, w.tenantID, principal.ID)
	require.NoError(t, err)
	require.Len(t, queue, 1, "the principal is asked to approve the flow")
	require.Equal(t, "leadership", queue[0].CurrentStage.Key)

	token, err := svc.IssueScanToken(ctx, service.IssueScanTokenInput{
		TenantID: w.tenantID, Purpose: domain.PurposeApproveStage,
		ContextID: uuid.NullUUID{UUID: opened.Instance.ID, Valid: true}, IssuedByUserID: principal.ID,
	})
	require.NoError(t, err)
	detail, err := svc.LateArrivalScan(ctx, w.tenantID, opened.Instance.ID, w.studentID, token.RawValue)
	require.NoError(t, err)
	require.Equal(t, 2, detail.Instance.CurrentStageIndex, "the principal approved the Pimpinan stage; the class teacher's is next")
}
