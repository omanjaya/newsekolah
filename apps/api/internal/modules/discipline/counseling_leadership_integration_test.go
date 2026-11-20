package discipline

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestLeadershipReadsNotesSharedWithLeadership is the regression test for
// "Pimpinan" counseling notes no leader could read: the wakasek (the
// leadership duty) and the kepsek (the principal role, no duty) both read
// a note shared with leadership, through the student's list, the note
// itself and the cross-student leadership list, while notes kept for the
// counselor or the BK team stay hidden from them. A reader who is neither
// (an admin) gets nothing.
func TestLeadershipReadsNotesSharedWithLeadership(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	fx := seedDisciplineFixture(t, pg.AdminPool)
	mod := newTestDisciplineModule(t, pg.AppPool)
	q := db.New(pg.AdminPool)

	newUser := func(name string) uuid.UUID {
		u, err := q.CreateUser(ctx, db.CreateUserParams{
			TenantID: fx.tenantID, Username: name + "-" + uuid.NewString()[:8], PasswordHash: "x", Name: name, Status: "active", Locale: "id",
		})
		require.NoError(t, err)
		return u.ID
	}
	giveDuty := func(slug string, userID uuid.UUID) {
		dutyType, err := q.CreateDutyType(ctx, db.CreateDutyTypeParams{TenantID: fx.tenantID, Slug: slug, Name: slug, ScopeKind: "school"})
		require.NoError(t, err)
		_, err = q.CreateDutyAssignment(ctx, db.CreateDutyAssignmentParams{
			TenantID: fx.tenantID, AcademicYearID: fx.yearID, DutyTypeID: dutyType.ID, UserID: userID,
			StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		})
		require.NoError(t, err)
	}

	giveDuty("counselor", fx.counselorID)
	wakasek := newUser("wakasek")
	giveDuty("leadership", wakasek)
	kepsek := newUser("kepsek")
	principal, err := q.CreateRole(ctx, db.CreateRoleParams{TenantID: fx.tenantID, Slug: "principal", Name: "Kepala Sekolah", IsSystem: true})
	require.NoError(t, err)
	require.NoError(t, q.AssignUserRole(ctx, db.AssignUserRoleParams{UserID: kepsek, RoleID: principal.ID, TenantID: fx.tenantID, IsPrimary: true}))
	admin := newUser("admin")

	note := func(visibility domain.Visibility) domain.Counseling {
		c, err := mod.Service.CreateCounseling(ctx, fx.tenantID, fx.counselorID, service.CounselingInput{
			StudentUserID: fx.studentID, SessionAt: time.Now(), Kind: domain.CounselingIndividual,
			Title: "Catatan " + string(visibility), Content: "isi", Visibility: visibility,
		})
		require.NoError(t, err)
		return c
	}
	shared := note(domain.VisibilityLeadership)
	team := note(domain.VisibilityBKTeam)
	private := note(domain.VisibilityCounselor)

	for name, reader := range map[string]uuid.UUID{"wakasek (leadership duty)": wakasek, "kepsek (principal role)": kepsek} {
		t.Run(name, func(t *testing.T) {
			got, err := mod.Service.GetCounseling(ctx, fx.tenantID, shared.ID, reader)
			require.NoError(t, err)
			require.Equal(t, "isi", got.Content)

			for _, hidden := range []domain.Counseling{team, private} {
				_, err := mod.Service.GetCounseling(ctx, fx.tenantID, hidden.ID, reader)
				require.ErrorIs(t, err, domain.ErrCounselingForbidden, "%s note", hidden.Visibility)
			}

			forStudent, err := mod.Service.ListCounselingsForStudent(ctx, fx.tenantID, fx.studentID, reader)
			require.NoError(t, err)
			require.Len(t, forStudent, 1)
			require.Equal(t, shared.ID, forStudent[0].ID)

			list, err := mod.Service.ListLeadershipCounselings(ctx, fx.tenantID, reader, "", 50, 0)
			require.NoError(t, err)
			require.Len(t, list, 1)
			require.Equal(t, shared.ID, list[0].ID)
		})
	}

	_, err = mod.Service.ListLeadershipCounselings(ctx, fx.tenantID, admin, "", 50, 0)
	require.ErrorIs(t, err, domain.ErrCounselingForbidden)
	_, err = mod.Service.GetCounseling(ctx, fx.tenantID, shared.ID, admin)
	require.ErrorIs(t, err, domain.ErrCounselingForbidden)

	// The BK team's own list is unchanged: it shows only bk_team notes.
	teamList, err := mod.Service.ListBKTeamCounselings(ctx, fx.tenantID, fx.counselorID, "", "", 50, 0)
	require.NoError(t, err)
	require.Len(t, teamList, 1)
	require.Equal(t, team.ID, teamList[0].ID)
}
