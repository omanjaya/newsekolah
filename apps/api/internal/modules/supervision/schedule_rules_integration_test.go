package supervision_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// recordingPublisher keeps every event the service announces.
type recordingPublisher struct {
	mu     sync.Mutex
	events []service.Event
}

func (p *recordingPublisher) Publish(_ context.Context, evt service.Event) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.events = append(p.events, evt)
	return nil
}

// TestScheduleObservationRules covers three gaps found on the running app:
// a Monday lesson could be scheduled on a Friday (the report then carried
// the wrong lesson), scheduling the same lesson twice on one date was a
// 500 instead of a conflict, and the observed teacher and the observer
// were never told about a planned visit, its result or the response.
func TestScheduleObservationRules(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenant := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ('supervision-rules','Test','sma','Asia/Makassar','id','active','default')`)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on)
		values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenant)
	teacher := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale)
		values ($1,'teacher','x','Teacher','active','id')`, tenant)
	observer := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale)
		values ($1,'observer','x','Observer','active','id')`, tenant)
	cycle := insertID(`insert into supervision_cycles (tenant_id,academic_year_id,name,instrument)
		values ($1,$2,'Test cycle','{"name":"Instrumen","scale_min":1,"scale_max":4,"criteria":[{"key":"a","name":"A"}]}'::jsonb)`,
		tenant, year)

	// A Monday lesson (ISO weekday 1).
	schedules := stubScheduleReader{ref: service.ScheduleRef{ID: uuid.New(), TeacherUserID: teacher, DayOfWeek: 1}}
	publisher := &recordingPublisher{}
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, schedules, nil, nil, nil).WithEvents(publisher)
	schedule := func(date time.Time) (domain.ScheduledObservation, error) {
		return svc.ScheduleObservation(ctx, tenant, service.ScheduleObservationInput{
			CycleID: cycle, ScheduleID: schedules.ref.ID, LessonDate: date, ObserverUserID: observer,
		})
	}

	// Friday 20 November 2026 is not a Monday.
	_, err := schedule(time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC))
	require.ErrorIs(t, err, domain.ErrLessonDayMismatch)

	monday := time.Date(2026, 11, 23, 0, 0, 0, 0, time.UTC)
	scheduled, err := schedule(monday)
	require.NoError(t, err)

	// The same lesson on the same date again is a conflict, not a 500.
	_, err = schedule(monday)
	require.ErrorIs(t, err, domain.ErrScheduledExists)

	observation, err := svc.CompleteObservation(ctx, tenant, observer, service.CompleteObservationInput{
		ScheduledID: scheduled.ID, Scores: []domain.CriterionScore{{CriterionKey: "a", Score: 4}},
		ObserverNotes: "Baik", ObservedAt: time.Date(2026, 11, 22, 23, 15, 0, 0, time.UTC),
	})
	require.NoError(t, err)
	_, err = svc.RecordTeacherResponse(ctx, tenant, observation.ID, teacher, "Terima kasih", "Perbaiki RPP")
	require.NoError(t, err)

	require.Len(t, publisher.events, 3)
	require.Equal(t, service.EventObservationScheduled, publisher.events[0].Name)
	require.Equal(t, teacher, publisher.events[0].SubjectUserID)
	require.Equal(t, tenant, publisher.events[0].TenantID)
	require.Equal(t, service.EventObservationCompleted, publisher.events[1].Name)
	require.Equal(t, teacher, publisher.events[1].SubjectUserID)
	require.Equal(t, "/supervision/observations/"+observation.ID.String(), publisher.events[1].Payload["href"])
	require.Equal(t, service.EventResponseRecorded, publisher.events[2].Name)
	require.Equal(t, observer, publisher.events[2].SubjectUserID)
}
