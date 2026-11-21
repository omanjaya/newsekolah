package scheduling_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	schedulehttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// The rules that keep a change from reaching back into weeks already
// taught, on top of effective_dating_integration_test.go's world (today is
// Wednesday 16 September 2026, 03:00 school time).

func (w *effectiveWorld) expectedOn(class uuid.UUID, date string) int64 {
	w.t.Helper()
	n, err := service.NewScheduleReaderAdapter(w.svc).CountSchedulesForClassOn(w.ctx, w.tenant, w.year, class, mustParseDate(w.t, date))
	require.NoError(w.t, err)
	return n
}

// A correction in place that moves a lesson to another weekday keeps it
// inside its own dates: a version that started after a dated change never
// takes over a week before it (one the version it replaced still covers,
// or one already past).
func TestInPlaceWeekdayCorrectionNeverStartsEarlier(t *testing.T) {
	w := newEffectiveWorld(t, "effective-resnap")
	thursday := w.create(w.lesson(w.classA, w.t1, 4, w.p1))
	w.recordSession(thursday, "2026-09-10")
	swap := w.lesson(w.classA, w.t2, 4, w.p1)
	swap.EffectiveFrom = datePtr(t, "2026-09-16")
	next, err := w.svc.UpdateSchedule(w.ctx, w.tenant, thursday.ID, swap, w.actor)
	require.NoError(t, err)
	require.Equal(t, mustParseDate(t, "2026-09-17"), next.EffectiveFrom)

	// The new version has no history, so it is corrected in place; on
	// Monday it starts on 21 September, not on Monday 14 September (before
	// it started, a week already past).
	monday := w.lesson(w.classA, w.t2, 1, w.p1)
	moved, err := w.svc.UpdateSchedule(w.ctx, w.tenant, next.ID, monday, w.actor)
	require.NoError(t, err)
	require.Equal(t, next.ID, moved.ID)
	require.Equal(t, int16(1), moved.DayOfWeek)
	require.Equal(t, mustParseDate(t, "2026-09-21"), moved.EffectiveFrom)
	require.Zero(t, w.expectedOn(w.classA, "2026-09-14"), "the past Monday keeps no lesson")
	require.Equal(t, int64(1), w.expectedOn(w.classA, "2026-09-21"))
	require.Equal(t, int64(1), w.expectedOn(w.classA, "2026-09-10"), "the old Thursday keeps its weeks")
}

// A version that has history but binds no date (only a cancelled
// substitution request) and has not started yet can still be changed or
// removed: from the day after its first lesson, which it keeps, so the
// request keeps its row.
func TestFutureVersionWithCancelledRequestKeepsItsFirstLesson(t *testing.T) {
	w := newEffectiveWorld(t, "effective-cancelled")
	addFriday := func(class, teacher, substitute uuid.UUID) domain.Schedule {
		in := w.lesson(class, teacher, 5, w.p2)
		in.EffectiveFrom = datePtr(t, "2026-10-01")
		friday := w.create(in)
		require.Equal(t, mustParseDate(t, "2026-10-02"), friday.EffectiveFrom)
		w.exec(`insert into substitution_requests (tenant_id,academic_year_id,schedule_id,date,requester_user_id,substitute_user_id,status) values ($1,$2,$3,'2026-10-02',$4,$5,'cancelled')`,
			w.tenant, w.year, friday.ID, teacher, substitute)
		return friday
	}
	changed := addFriday(w.classA, w.t1, w.t3)

	policy := w.svc.MutationPolicyFor(w.ctx, w.tenant, changed, w.actor)
	require.True(t, policy.RequiresEffectiveFrom)
	require.Equal(t, mustParseDate(t, "2026-10-03"), *policy.MinEffectiveFrom, "the day after its first lesson, not today")

	swap := w.lesson(w.classA, w.t2, 5, w.p2)
	swap.EffectiveFrom = datePtr(t, "2026-09-30")
	_, err := w.svc.UpdateSchedule(w.ctx, w.tenant, changed.ID, swap, w.actor)
	var tooEarly *domain.ChangeTooEarlyError
	require.ErrorAs(t, err, &tooEarly)
	require.Equal(t, mustParseDate(t, "2026-10-03"), tooEarly.Min)

	swap.EffectiveFrom = &tooEarly.Min
	next, err := w.svc.UpdateSchedule(w.ctx, w.tenant, changed.ID, swap, w.actor)
	require.NoError(t, err)
	require.Equal(t, mustParseDate(t, "2026-10-09"), next.EffectiveFrom)
	require.Equal(t, mustParseDate(t, "2026-10-02"), *w.get(changed.ID).EffectiveUntil)

	removed := addFriday(w.classB, w.t3, w.t1)
	err = w.svc.DeleteScheduleBlock(w.ctx, w.tenant, removed.ID, []uuid.UUID{removed.ID}, datePtr(t, "2026-09-30"), w.actor)
	require.ErrorAs(t, err, &tooEarly)
	require.Equal(t, mustParseDate(t, "2026-10-03"), tooEarly.Min)
	require.NoError(t, w.svc.DeleteScheduleBlock(w.ctx, w.tenant, removed.ID, []uuid.UUID{removed.ID}, &tooEarly.Min, w.actor))
	require.Equal(t, mustParseDate(t, "2026-10-02"), *w.get(removed.ID).EffectiveUntil)
	require.Equal(t, 2, w.count(`select count(*) from substitution_requests where status = 'cancelled'`))
}

// A version that already ended describes past weeks only: without a date
// it can be neither rewritten nor deleted, history or not, and the API
// says SCHEDULE_ENDED.
func TestEndedVersionCannotBeCorrectedOrDeleted(t *testing.T) {
	w := newEffectiveWorld(t, "effective-ended")
	monday := w.create(w.lesson(w.classB, w.t3, 1, w.p2))
	require.NoError(t, w.svc.DeleteScheduleBlock(w.ctx, w.tenant, monday.ID, []uuid.UUID{monday.ID}, datePtr(t, "2026-09-16"), w.actor))
	require.Equal(t, mustParseDate(t, "2026-09-14"), *w.get(monday.ID).EffectiveUntil)

	handler := schedulehttp.New(w.svc, fullAccessPermissions{}, nil)
	actorCtx := httpx.WithUserID(w.ctx, w.t1)
	body := api.ScheduleWriteRequest{
		AcademicYearId: w.year, ClassId: w.classB, SubjectId: w.subject, TeacherUserId: w.t2,
		DayOfWeek: 1, StartPeriodId: w.p2, EndPeriodId: w.p2,
	}
	_, err := handler.UpdateSchedule(actorCtx, api.UpdateScheduleRequestObject{ScheduleId: monday.ID, Body: &body})
	var appErr *httpx.Error
	require.ErrorAs(t, err, &appErr)
	require.Equal(t, 409, appErr.Status)
	require.Equal(t, "SCHEDULE_ENDED", appErr.Code)
	_, err = handler.DeleteSchedule(actorCtx, api.DeleteScheduleRequestObject{ScheduleId: monday.ID})
	require.ErrorAs(t, err, &appErr)
	require.Equal(t, 409, appErr.Status)
	require.Equal(t, "SCHEDULE_ENDED", appErr.Code)
	require.Equal(t, w.t3, w.get(monday.ID).TeacherUserID)

	// The bulk clear without a date would delete it too: it asks for one.
	var needsDate *domain.HistoryRequiresDateError
	require.ErrorAs(t, w.svc.ClearAcademicYear(w.ctx, w.tenant, w.year, nil, w.actor), &needsDate)
	require.Equal(t, w.today, needsDate.Min)
	require.NoError(t, w.svc.ClearAcademicYear(w.ctx, w.tenant, w.year, &needsDate.Min, w.actor))
	require.Equal(t, 1, w.count(`select count(*) from schedules where id = $1`, monday.ID), "an ended version is left alone")

	policy := w.svc.MutationPolicyFor(w.ctx, w.tenant, w.get(monday.ID), w.actor)
	require.False(t, policy.CanEdit)
	require.ErrorIs(t, policy.Reason, domain.ErrScheduleEnded)
}

// A change never moves a lesson that has already begun today: from 08:30
// on Wednesday the 08:00 Wednesday lesson can only change from tomorrow,
// while the 09:00 one still can from today.
func TestChangeFloorIsTomorrowOnceTodaysLessonBegan(t *testing.T) {
	w := newEffectiveWorld(t, "effective-begun")
	w.svc.WithClock(clock.Frozen{At: time.Date(2026, 9, 16, 8, 30, 0, 0, time.UTC)})
	early := w.create(w.lesson(w.classA, w.t1, 3, w.p1))
	late := w.create(w.lesson(w.classB, w.t2, 3, w.p2))
	w.recordSession(early, "2026-09-09")
	w.recordSession(late, "2026-09-09")
	tomorrow := mustParseDate(t, "2026-09-17")

	policy := w.svc.MutationPolicyFor(w.ctx, w.tenant, early, w.actor)
	require.Equal(t, tomorrow, *policy.MinEffectiveFrom)
	policy = w.svc.MutationPolicyFor(w.ctx, w.tenant, late, w.actor)
	require.Equal(t, w.today, *policy.MinEffectiveFrom)
	list := w.classWeek(w.classA, "2026-09-16")
	require.Equal(t, tomorrow, *blockOn(list, 3).Policy.MinEffectiveFrom, "the grid says the same")

	swap := w.lesson(w.classA, w.t3, 3, w.p1)
	swap.EffectiveFrom = datePtr(t, "2026-09-16")
	_, err := w.svc.UpdateSchedule(w.ctx, w.tenant, early.ID, swap, w.actor)
	var tooEarly *domain.ChangeTooEarlyError
	require.ErrorAs(t, err, &tooEarly)
	require.Equal(t, tomorrow, tooEarly.Min)
	require.NoError(t, w.svc.DeleteScheduleBlock(w.ctx, w.tenant, late.ID, []uuid.UUID{late.ID}, datePtr(t, "2026-09-16"), w.actor))
	require.Equal(t, mustParseDate(t, "2026-09-09"), *w.get(late.ID).EffectiveUntil)

	// The same holds without history: today's lesson stays as taught.
	fresh := w.create(w.lesson(w.classB, w.t3, 3, w.p1))
	err = w.svc.DeleteScheduleBlock(w.ctx, w.tenant, fresh.ID, []uuid.UUID{fresh.ID}, datePtr(t, "2026-09-16"), w.actor)
	require.ErrorAs(t, err, &tooEarly)
	require.Equal(t, tomorrow, tooEarly.Min)
	require.NoError(t, w.svc.DeleteScheduleBlock(w.ctx, w.tenant, fresh.ID, []uuid.UUID{fresh.ID}, &tomorrow, w.actor))
	require.Equal(t, w.today, *w.get(fresh.ID).EffectiveUntil)

	// And a lesson added without a date for today's weekday starts next
	// week rather than on a lesson already under way.
	added, err := w.svc.CreateSchedule(w.ctx, w.tenant, w.lesson(w.classB, w.t2, 3, w.p1), w.actor)
	require.NoError(t, err)
	require.Equal(t, mustParseDate(t, "2026-09-23"), added.EffectiveFrom)
}

// A lesson added mid-year without a date starts from today: earlier weeks
// do not suddenly expect it, and it does not clash with a version a
// manager ended in the same slot. A teacher, who may not date a lesson,
// can so fill a slot freed from a date.
func TestLessonWithoutDateStartsFromToday(t *testing.T) {
	w := newEffectiveWorld(t, "effective-start")
	thursday := w.create(w.lesson(w.classA, w.t1, 4, w.p1))
	w.recordSession(thursday, "2026-09-10")
	require.NoError(t, w.svc.DeleteScheduleBlock(w.ctx, w.tenant, thursday.ID, []uuid.UUID{thursday.ID}, datePtr(t, "2026-09-16"), w.actor))

	teacher := service.Actor{UserID: w.t2}
	own, err := w.svc.CreateSchedule(w.ctx, w.tenant, w.lesson(w.classA, w.t2, 4, w.p1), teacher)
	require.NoError(t, err, "the ended Thursday no longer holds the slot")
	require.Equal(t, mustParseDate(t, "2026-09-17"), own.EffectiveFrom)
	require.Equal(t, domain.SourceTeacher, own.Source)
	require.Equal(t, int64(1), w.expectedOn(w.classA, "2026-09-10"))
	require.Equal(t, int64(1), w.expectedOn(w.classA, "2026-09-17"))

	tuesday, err := w.svc.CreateSchedule(w.ctx, w.tenant, w.lesson(w.classB, w.t3, 2, w.p1), w.actor)
	require.NoError(t, err)
	require.Equal(t, mustParseDate(t, "2026-09-22"), tuesday.EffectiveFrom)
	require.Zero(t, w.expectedOn(w.classB, "2026-09-15"), "last Tuesday expects no lesson nobody taught")
	require.Equal(t, int64(1), w.expectedOn(w.classB, "2026-09-22"))

	created, err := w.svc.BulkImport(w.ctx, w.tenant, []service.ScheduleInput{w.lesson(w.classB, w.t3, 1, w.p2)})
	require.NoError(t, err)
	require.Equal(t, mustParseDate(t, "2026-09-21"), created[0].EffectiveFrom)
}

// A supervision visit planned for a lesson binds it like a pending
// substitution: the version is not rewritten in place or deleted, and a
// change takes effect only after the visit's date, so the visit keeps
// pointing at the lesson in effect that day.
func TestSupervisionVisitBindsTheLesson(t *testing.T) {
	w := newEffectiveWorld(t, "effective-visit")
	monday := w.create(w.lesson(w.classA, w.t1, 1, w.p1))
	var cycle uuid.UUID
	require.NoError(t, w.admin.QueryRow(w.ctx,
		`insert into supervision_cycles (tenant_id,academic_year_id,name,instrument) values ($1,$2,'Semester 1','{}') returning id`,
		w.tenant, w.year).Scan(&cycle))
	w.exec(`insert into supervision_scheduled_observations (tenant_id,cycle_id,schedule_id,lesson_date,teacher_user_id,observer_user_id) values ($1,$2,$3,'2026-09-28',$4,$5)`,
		w.tenant, cycle, monday.ID, w.t1, w.t3)
	visitDay := mustParseDate(t, "2026-09-29")

	policy := w.svc.MutationPolicyFor(w.ctx, w.tenant, monday, w.actor)
	require.True(t, policy.HasHistory)
	require.True(t, policy.RequiresEffectiveFrom)
	require.Equal(t, visitDay, *policy.MinEffectiveFrom)
	require.Equal(t, domain.HoldSupervision, policy.HeldBy.Kind, "the visit is named as what holds the date")

	swap := w.lesson(w.classA, w.t2, 1, w.p1)
	_, err := w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, swap, w.actor)
	var needsDate *domain.HistoryRequiresDateError
	require.ErrorAs(t, err, &needsDate, "not rewritten in place")
	require.Equal(t, visitDay, needsDate.Min)
	err = w.svc.DeleteScheduleBlock(w.ctx, w.tenant, monday.ID, []uuid.UUID{monday.ID}, nil, w.actor)
	require.ErrorAs(t, err, &needsDate, "not deleted")
	_, err = w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, w.lesson(w.classA, w.t1, 1, w.p2), service.Actor{UserID: w.t1})
	require.ErrorIs(t, err, domain.ErrScheduleHasHistory, "nor moved by its teacher")

	swap.EffectiveFrom = datePtr(t, "2026-09-21")
	_, err = w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, swap, w.actor)
	var tooEarly *domain.ChangeTooEarlyError
	require.ErrorAs(t, err, &tooEarly)
	require.Equal(t, visitDay, tooEarly.Min)

	swap.EffectiveFrom = &visitDay
	next, err := w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, swap, w.actor)
	require.NoError(t, err)
	require.Equal(t, mustParseDate(t, "2026-10-05"), next.EffectiveFrom)
	old := w.get(monday.ID)
	require.Equal(t, mustParseDate(t, "2026-09-28"), *old.EffectiveUntil)
	require.True(t, old.EffectiveOn(mustParseDate(t, "2026-09-28")), "the visit's lesson is still this version")
	require.Equal(t, w.t1, old.TeacherUserID)
}
