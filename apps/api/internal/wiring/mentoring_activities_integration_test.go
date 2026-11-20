package wiring

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities"
	activitiesdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
	activitiesservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring"
	mentoringdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform"
	platformdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestMentoringSnapshotCarriesActivitiesRecord (F98): the guru wali who
// writes the term summary holds no view_activities, so the mentee's clubs
// and achievements were visible nowhere to them. The mentor's snapshot
// now carries both, read through MentoringActivities, and leaves them out
// while the tenant has activities turned off.
func TestMentoringSnapshotCarriesActivitiesRecord(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	platformSvc := platform.Register(platform.Dependencies{Pool: pg.AppPool, Clock: clock.Real{}, Mode: config.TenancyMulti}).Service
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	activitiesModule := activities.Register(activities.Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}})
	mentoringModule := mentoring.Register(mentoring.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service,
		Activities: MentoringActivities{Svc: activitiesModule.Service, Flags: PlatformFlags{Svc: platformSvc}},
		Flags:      PlatformFlags{Svc: platformSvc}, Clock: clock.Real{},
	})

	fx := seedGradeLevelFixture(t, pg.AdminPool)
	student := enrolledStudent(t, pg.AdminPool, fx)

	achievedOn := time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)
	_, err := activitiesModule.Service.CreateAchievement(ctx, fx.tenantID, activitiesdomain.Achievement{
		StudentUserID: student, CompetitionName: "Lomba Pionering", Level: activitiesdomain.LevelCity,
		Placing: "Juara 1", AchievedOn: achievedOn,
	})
	require.NoError(t, err)
	club, err := activitiesModule.Service.CreateExtracurricular(ctx, fx.tenantID, activitiesservice.ExtracurricularInput{
		Name: "Pramuka", IsActive: true,
	})
	require.NoError(t, err)
	joinedOn := time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC)
	_, err = activitiesModule.Service.JoinClub(ctx, fx.tenantID, club.ID, student, joinedOn)
	require.NoError(t, err)

	reader := mentoringdomain.Viewer{ReadAll: true}
	snapshot, err := mentoringModule.Service.StudentSnapshot(ctx, fx.tenantID, reader, student)
	require.NoError(t, err)
	require.Len(t, snapshot.Achievements, 1)
	require.Equal(t, "Lomba Pionering", snapshot.Achievements[0].CompetitionName)
	require.Equal(t, "city", snapshot.Achievements[0].Level)
	require.Equal(t, "Juara 1", snapshot.Achievements[0].Placing)
	require.Equal(t, "2026-11-02", snapshot.Achievements[0].AchievedOn.Format(time.DateOnly))
	require.Len(t, snapshot.Clubs, 1)
	require.Equal(t, "Pramuka", snapshot.Clubs[0].ClubName)
	require.True(t, snapshot.Clubs[0].Active)
	require.Equal(t, "2026-11-20", snapshot.Clubs[0].JoinedOn.Format(time.DateOnly))

	// Activities off: the snapshot still loads, without the record.
	_, err = platformSvc.SetFlag(ctx, fx.tenantID, string(platformdomain.ModuleActivities), false)
	require.NoError(t, err)
	snapshot, err = mentoringModule.Service.StudentSnapshot(ctx, fx.tenantID, reader, student)
	require.NoError(t, err)
	require.Empty(t, snapshot.Achievements)
	require.Empty(t, snapshot.Clubs)
}
