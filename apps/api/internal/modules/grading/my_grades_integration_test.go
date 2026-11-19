package grading

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// TestMyGradesCarriesComponentDescription covers what a student sees on
// "Nilai saya": each published component carries the teacher's own
// description of the assessment, so "TG1" can be told apart from "TG2",
// and a component without one still comes back by its code alone.
func TestMyGradesCarriesComponentDescription(t *testing.T) {
	pg := dbtest.Start(t)
	fx := seedFixture(t, pg.AdminPool)
	ctx := context.Background()

	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	gradingModule := Register(Dependencies{Pool: pg.AppPool, Years: schoolModule.Service, Clock: clock.Real{}})
	term := uuid.NullUUID{UUID: fx.termID, Valid: true}

	described, err := gradingModule.Service.CreateComponent(ctx, fx.tenantID, fx.teacherID, true, service.ComponentInput{
		ClassID: fx.classID, SubjectID: fx.subjectID, TermID: term,
		Code: "TG1", Kind: domain.KindFormative, Weight: 1, Description: "Kuis bab 3: pecahan",
	})
	require.NoError(t, err)
	bare, err := gradingModule.Service.CreateComponent(ctx, fx.tenantID, fx.teacherID, true, service.ComponentInput{
		ClassID: fx.classID, SubjectID: fx.subjectID, TermID: term,
		Code: "UH1", Kind: domain.KindFormative, Weight: 1,
	})
	require.NoError(t, err)

	for _, componentID := range []uuid.UUID{described.ID, bare.ID} {
		score := 80.0
		_, err = gradingModule.Service.SaveScores(ctx, fx.tenantID, componentID, fx.teacherID, true, []service.ScoreEntry{
			{StudentUserID: fx.studentID, Score: &score},
		})
		require.NoError(t, err)
	}
	_, err = gradingModule.Service.Publish(ctx, fx.tenantID, fx.teacherID, true, fx.classID, fx.subjectID, term, true)
	require.NoError(t, err)

	grades, err := gradingModule.Service.MyGrades(ctx, fx.tenantID, fx.studentID, term)
	require.NoError(t, err)
	require.Len(t, grades.Subjects, 1)

	descriptions := map[string]string{}
	for _, component := range grades.Subjects[0].Components {
		descriptions[component.Code] = component.Description
	}
	require.Equal(t, map[string]string{"TG1": "Kuis bab 3: pecahan", "UH1": ""}, descriptions)
}
