package scheduling_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	schedulehttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	tenantctx "github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// effectiveWorld is one tenant whose school's "today" is pinned to
// Wednesday 16 September 2026: an academic year from Monday 13 July 2026,
// classes X-A and X-B, three teachers who may each teach Math in both, two
// periods, Monday to Friday.
type effectiveWorld struct {
	t                *testing.T
	ctx              context.Context
	admin            *pgxpool.Pool
	svc              *service.Service
	actor            service.Actor
	tenant, year     uuid.UUID
	classA, classB   uuid.UUID
	subject          uuid.UUID
	t1, t2, t3       uuid.UUID
	p1, p2           uuid.UUID
	yearStart, today time.Time
}

func newEffectiveWorld(t *testing.T, slug string) *effectiveWorld {
	t.Helper()
	pg := dbtest.Start(t)
	w := &effectiveWorld{t: t, admin: pg.AdminPool}
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, w.admin.QueryRow(context.Background(), sql+" returning id", args...).Scan(&id))
		return id
	}
	w.tenant = insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ($1,'Test','sma','UTC','id','active','default')`, slug)
	w.ctx = tenantctx.WithTenant(context.Background(), tenantctx.Tenant{ID: w.tenant, Timezone: "UTC"})
	w.year = insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-07-13','2027-06-30')`, w.tenant)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, w.tenant)
	w.classA = insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, w.tenant, w.year, grade)
	w.classB = insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-B')`, w.tenant, w.year, grade)
	w.subject = insertID(`insert into subjects (tenant_id,code,name) values ($1,'MTK','Math')`, w.tenant)
	w.t1 = insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'teacher-one','x','Teacher One','active','id')`, w.tenant)
	w.t2 = insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'teacher-two','x','Teacher Two','active','id')`, w.tenant)
	w.t3 = insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'teacher-three','x','Teacher Three','active','id')`, w.tenant)
	template := insertID(`insert into period_templates (tenant_id,name) values ($1,'Default')`, w.tenant)
	w.p1 = insertID(`insert into periods (tenant_id,template_id,name,sequence,starts_at,ends_at) values ($1,$2,'P1',1,'08:00','09:00')`, w.tenant, template)
	w.p2 = insertID(`insert into periods (tenant_id,template_id,name,sequence,starts_at,ends_at) values ($1,$2,'P2',2,'09:00','10:00')`, w.tenant, template)
	for _, teacher := range []uuid.UUID{w.t1, w.t2, w.t3} {
		for _, class := range []uuid.UUID{w.classA, w.classB} {
			w.exec(`insert into teaching_assignments (tenant_id,academic_year_id,teacher_user_id,subject_id,class_id) values ($1,$2,$3,$4,$5)`, w.tenant, w.year, teacher, w.subject, class)
		}
	}
	for day := 1; day <= 5; day++ {
		w.exec(`insert into school_days (tenant_id,academic_year_id,day_of_week) values ($1,$2,$3)`, w.tenant, w.year, day)
		w.exec(`insert into period_day_assignments (tenant_id,academic_year_id,day_of_week,template_id) values ($1,$2,$3,$4)`, w.tenant, w.year, day, template)
	}
	w.yearStart = mustParseDate(t, "2026-07-13")
	w.today = mustParseDate(t, "2026-09-16")
	w.svc = service.New(pg.AppPool, repository.New(pg.AppPool)).WithClock(clock.Frozen{At: time.Date(2026, 9, 16, 3, 0, 0, 0, time.UTC)})
	w.actor = service.Actor{CanManage: true, UserID: w.t1}
	return w
}

func (w *effectiveWorld) exec(sql string, args ...any) {
	w.t.Helper()
	_, err := w.admin.Exec(context.Background(), sql, args...)
	require.NoError(w.t, err)
}

func (w *effectiveWorld) count(sql string, args ...any) int {
	w.t.Helper()
	var n int
	require.NoError(w.t, w.admin.QueryRow(context.Background(), sql, args...).Scan(&n))
	return n
}

func (w *effectiveWorld) lesson(class, teacher uuid.UUID, day int16, period uuid.UUID) service.ScheduleInput {
	return service.ScheduleInput{
		AcademicYearID: w.year, ClassID: class, SubjectID: w.subject, TeacherUserID: teacher,
		DayOfWeek: day, StartPeriodID: period, EndPeriodID: period, Source: domain.SourceAdmin,
	}
}

func (w *effectiveWorld) create(in service.ScheduleInput) domain.Schedule {
	w.t.Helper()
	sched, err := w.svc.CreateSchedule(w.ctx, w.tenant, in, w.actor)
	require.NoError(w.t, err)
	return sched
}

func (w *effectiveWorld) recordSession(sched domain.Schedule, date string) uuid.UUID {
	w.t.Helper()
	var id uuid.UUID
	require.NoError(w.t, w.admin.QueryRow(context.Background(),
		`insert into attendance_sessions (tenant_id,academic_year_id,schedule_id,date,class_id,subject_id,teacher_user_id,start_period_id,end_period_id,submitted_at)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) returning id`,
		w.tenant, w.year, sched.ID, date, sched.ClassID, sched.SubjectID, sched.TeacherUserID, sched.StartPeriodID, sched.EndPeriodID).Scan(&id))
	return id
}

func (w *effectiveWorld) placeholder(sched domain.Schedule, date string) uuid.UUID {
	w.t.Helper()
	var id uuid.UUID
	require.NoError(w.t, w.admin.QueryRow(context.Background(),
		`insert into attendance_sessions (tenant_id,academic_year_id,schedule_id,date,class_id,subject_id,teacher_user_id,start_period_id,end_period_id)
		 values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
		w.tenant, w.year, sched.ID, date, sched.ClassID, sched.SubjectID, sched.TeacherUserID, sched.StartPeriodID, sched.EndPeriodID).Scan(&id))
	return id
}

func (w *effectiveWorld) get(id uuid.UUID) domain.Schedule {
	w.t.Helper()
	sched, err := w.svc.GetSchedule(w.ctx, w.tenant, id)
	require.NoError(w.t, err)
	return sched
}

func (w *effectiveWorld) classWeek(class uuid.UUID, asOf string) service.BlockList {
	w.t.Helper()
	d := mustParseDate(w.t, asOf)
	list, err := w.svc.ListBlocks(w.ctx, w.tenant, service.BlockQuery{
		AcademicYearID: w.year, ClassID: uuid.NullUUID{UUID: class, Valid: true}, AsOf: &d,
	}, w.actor)
	require.NoError(w.t, err)
	return list
}

func blockOn(list service.BlockList, day int16) *service.ListedBlock {
	for i := range list.Blocks {
		if list.Blocks[i].DayOfWeek == day {
			return &list.Blocks[i]
		}
	}
	return nil
}

func datePtr(t *testing.T, value string) *time.Time {
	d := mustParseDate(t, value)
	return &d
}

func pgConstraint(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.ConstraintName
	}
	return ""
}

// A lesson that has been taught can still change: from a date on, the old
// version ends on its last lesson before it and a new version takes over,
// while the recorded session keeps pointing at the old one.
func TestEffectiveDatedChangeRetiresAndInserts(t *testing.T) {
	w := newEffectiveWorld(t, "effective-change")
	monday := w.create(w.lesson(w.classA, w.t1, 1, w.p1))
	require.Equal(t, w.yearStart, monday.EffectiveFrom, "a new lesson runs from the year's first Monday")
	require.Nil(t, monday.EffectiveUntil)
	session := w.recordSession(monday, "2026-09-14")

	// Undated, the change would rewrite history: refused, naming the
	// earliest date a dated change may use (today, the day after it).
	swap := w.lesson(w.classA, w.t2, 1, w.p1)
	_, err := w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, swap, w.actor)
	var needsDate *domain.HistoryRequiresDateError
	require.ErrorAs(t, err, &needsDate)
	require.ErrorIs(t, err, domain.ErrScheduleHasHistory)
	require.Equal(t, w.today, needsDate.Min)

	// A date in the past is refused with the same earliest date.
	swap.EffectiveFrom = datePtr(t, "2026-09-15")
	_, err = w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, swap, w.actor)
	var tooEarly *domain.ChangeTooEarlyError
	require.ErrorAs(t, err, &tooEarly)
	require.Equal(t, w.today, tooEarly.Min)

	// A teacher acting on their own lesson cannot date a change.
	_, err = w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, swap, service.Actor{UserID: w.t1})
	require.ErrorIs(t, err, domain.ErrEffectiveDateAdminOnly)

	// A date outside the academic year is refused.
	swap.EffectiveFrom = datePtr(t, "2027-07-01")
	_, err = w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, swap, w.actor)
	require.ErrorIs(t, err, domain.ErrEffectiveFromOutOfYear)

	swap.EffectiveFrom = datePtr(t, "2026-09-16")
	next, err := w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, swap, w.actor)
	require.NoError(t, err)
	require.NotEqual(t, monday.ID, next.ID, "the change is a new version")
	require.Equal(t, w.t2, next.TeacherUserID)
	require.Equal(t, mustParseDate(t, "2026-09-21"), next.EffectiveFrom, "snapped to the next Monday")
	require.Nil(t, next.EffectiveUntil)

	old := w.get(monday.ID)
	require.Equal(t, w.t1, old.TeacherUserID, "the old version is untouched but for its end")
	require.Equal(t, mustParseDate(t, "2026-09-14"), *old.EffectiveUntil, "it ends on its last Monday before the change")
	require.Equal(t, 1, w.count(`select count(*) from attendance_sessions where id = $1 and schedule_id = $2`, session, monday.ID))

	before := w.classWeek(w.classA, "2026-09-14")
	require.Equal(t, mustParseDate(t, "2026-09-14"), before.WeekStart)
	require.Equal(t, w.t1, blockOn(before, 1).TeacherUserID)
	require.Equal(t, []uuid.UUID{monday.ID}, blockOn(before, 1).ScheduleIDs)
	after := w.classWeek(w.classA, "2026-09-21")
	require.Equal(t, w.t2, blockOn(after, 1).TeacherUserID)
	require.Equal(t, []uuid.UUID{next.ID}, blockOn(after, 1).ScheduleIDs)

	// A notes-only change touches nothing the history protects, so it stays
	// on the same version whatever date it carries.
	notes := swap
	notes.Notes = "Lab"
	same, err := w.svc.UpdateSchedule(w.ctx, w.tenant, next.ID, notes, w.actor)
	require.NoError(t, err)
	require.Equal(t, next.ID, same.ID)
	require.Equal(t, "Lab", same.Notes)

	// The retired version's policy: it has history but its last date has
	// passed, so nothing about it can change any more.
	policy := w.svc.MutationPolicyFor(w.ctx, w.tenant, w.get(monday.ID), w.actor)
	require.False(t, policy.CanEdit)
	require.False(t, policy.CanDelete)
	require.Equal(t, domain.ErrScheduleEnded.Error(), policy.Reason)
}

// Pending and accepted substitutions bind their date too: a change must
// take effect after the last of them, while a rejected one binds nothing.
func TestSubstitutionsPushTheEarliestChangeDate(t *testing.T) {
	w := newEffectiveWorld(t, "effective-substitutions")
	monday := w.create(w.lesson(w.classA, w.t1, 1, w.p1))
	w.exec(`insert into substitution_requests (tenant_id,academic_year_id,schedule_id,date,requester_user_id,substitute_user_id,status) values ($1,$2,$3,'2026-09-28',$4,$5,'pending')`,
		w.tenant, w.year, monday.ID, w.t1, w.t2)
	w.exec(`insert into substitution_requests (tenant_id,academic_year_id,schedule_id,date,requester_user_id,substitute_user_id,status) values ($1,$2,$3,'2026-10-05',$4,$5,'rejected')`,
		w.tenant, w.year, monday.ID, w.t1, w.t3)

	policy := w.svc.MutationPolicyFor(w.ctx, w.tenant, monday, w.actor)
	require.True(t, policy.CanEdit)
	require.True(t, policy.RequiresEffectiveFrom)
	require.Equal(t, mustParseDate(t, "2026-09-29"), *policy.MinEffectiveFrom)

	in := w.lesson(w.classA, w.t3, 1, w.p1)
	in.EffectiveFrom = datePtr(t, "2026-09-28")
	_, err := w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, in, w.actor)
	var tooEarly *domain.ChangeTooEarlyError
	require.ErrorAs(t, err, &tooEarly)
	require.Equal(t, mustParseDate(t, "2026-09-29"), tooEarly.Min)

	in.EffectiveFrom = datePtr(t, "2026-09-29")
	next, err := w.svc.UpdateSchedule(w.ctx, w.tenant, monday.ID, in, w.actor)
	require.NoError(t, err)
	require.Equal(t, mustParseDate(t, "2026-10-05"), next.EffectiveFrom)
	require.Equal(t, mustParseDate(t, "2026-09-28"), *w.get(monday.ID).EffectiveUntil, "the pending substitution's date stays inside")

	// Requesting a substitute for the old version after it ended is
	// refused: that lesson is no longer on the timetable then.
	_, err = w.svc.RequestSubstitution(w.ctx, w.tenant, monday.ID, mustParseDate(t, "2026-10-12"), w.t1, w.t2, "", noopSubstitutionPublisher{})
	require.ErrorIs(t, err, domain.ErrSubstitutionNotScheduled)
	_, err = w.svc.RequestSubstitution(w.ctx, w.tenant, next.ID, mustParseDate(t, "2026-10-12"), w.t3, w.t2, "", noopSubstitutionPublisher{})
	require.NoError(t, err)
}

// Removing a lesson with history from a date on keeps it on every earlier
// date, history and all; a version that has not started by then simply
// goes. Placeholder sessions after the date go with the removed dates.
func TestRemovingALessonFromADateKeepsItsPast(t *testing.T) {
	w := newEffectiveWorld(t, "effective-remove")
	tuesday := w.create(w.lesson(w.classA, w.t1, 2, w.p1))
	w.recordSession(tuesday, "2026-09-15")
	future := w.placeholder(tuesday, "2026-09-22")

	// Undated delete: refused with the earliest date.
	err := w.svc.DeleteScheduleBlock(w.ctx, w.tenant, tuesday.ID, []uuid.UUID{tuesday.ID}, nil, w.actor)
	var needsDate *domain.HistoryRequiresDateError
	require.ErrorAs(t, err, &needsDate)
	require.Equal(t, w.today, needsDate.Min)

	require.NoError(t, w.svc.DeleteScheduleBlock(w.ctx, w.tenant, tuesday.ID, []uuid.UUID{tuesday.ID}, datePtr(t, "2026-09-16"), w.actor))
	retired := w.get(tuesday.ID)
	require.Equal(t, mustParseDate(t, "2026-09-15"), *retired.EffectiveUntil)
	require.Zero(t, w.count(`select count(*) from attendance_sessions where id = $1`, future), "the placeholder after the end went")
	require.Equal(t, 1, w.count(`select count(*) from attendance_sessions where schedule_id = $1`, tuesday.ID))
	require.NotNil(t, blockOn(w.classWeek(w.classA, "2026-09-15"), 2), "earlier weeks keep it")
	require.Nil(t, blockOn(w.classWeek(w.classA, "2026-09-22"), 2), "later weeks do not")

	// A lesson added from October goes outright when removed before it
	// ever takes place.
	in := w.lesson(w.classA, w.t1, 3, w.p2)
	in.EffectiveFrom = datePtr(t, "2026-10-01")
	october := w.create(in)
	require.Equal(t, mustParseDate(t, "2026-10-07"), october.EffectiveFrom)
	require.NoError(t, w.svc.DeleteScheduleBlock(w.ctx, w.tenant, october.ID, []uuid.UUID{october.ID}, datePtr(t, "2026-09-30"), w.actor))
	require.Zero(t, w.count(`select count(*) from schedules where id = $1`, october.ID))

	// A version already over cannot be removed again.
	err = w.svc.DeleteScheduleBlock(w.ctx, w.tenant, tuesday.ID, []uuid.UUID{tuesday.ID}, datePtr(t, "2026-09-23"), w.actor)
	require.ErrorIs(t, err, domain.ErrScheduleEnded)

	// A lesson already removed from a later date keeps that end when it is
	// changed before it: the new version stops where the old one would.
	friday := w.create(w.lesson(w.classA, w.t2, 5, w.p1))
	require.NoError(t, w.svc.DeleteScheduleBlock(w.ctx, w.tenant, friday.ID, []uuid.UUID{friday.ID}, datePtr(t, "2026-10-05"), w.actor))
	require.Equal(t, mustParseDate(t, "2026-10-02"), *w.get(friday.ID).EffectiveUntil)
	swap := w.lesson(w.classA, w.t3, 5, w.p1)
	swap.EffectiveFrom = datePtr(t, "2026-09-21")
	next, err := w.svc.UpdateSchedule(w.ctx, w.tenant, friday.ID, swap, w.actor)
	require.NoError(t, err)
	require.Equal(t, mustParseDate(t, "2026-09-25"), next.EffectiveFrom)
	require.Equal(t, mustParseDate(t, "2026-10-02"), *next.EffectiveUntil)
	require.Equal(t, mustParseDate(t, "2026-09-18"), *w.get(friday.ID).EffectiveUntil)
}

// The anti-clash rule compares versions that share a date: the slot a
// retired lesson leaves is free from the day after it ends, but not on the
// dates it still holds, and the same goes for a teacher's own time.
func TestConflictsOnlyCompareOverlappingVersions(t *testing.T) {
	w := newEffectiveWorld(t, "effective-conflicts")
	thursday := w.create(w.lesson(w.classA, w.t1, 4, w.p1))
	w.recordSession(thursday, "2026-09-10")
	require.NoError(t, w.svc.DeleteScheduleBlock(w.ctx, w.tenant, thursday.ID, []uuid.UUID{thursday.ID}, datePtr(t, "2026-09-16"), w.actor))
	require.Equal(t, mustParseDate(t, "2026-09-10"), *w.get(thursday.ID).EffectiveUntil)

	// Before the old lesson ends: a clash, naming the retired version and
	// its dates.
	clash := w.lesson(w.classA, w.t2, 4, w.p1)
	clash.EffectiveFrom = datePtr(t, "2026-09-03")
	_, err := w.svc.CreateSchedule(w.ctx, w.tenant, clash, w.actor)
	var conflict *domain.ConflictError
	require.ErrorAs(t, err, &conflict)
	require.ErrorIs(t, err, domain.ErrConflictClass)
	require.Equal(t, thursday.ID, conflict.With.ID)
	require.Equal(t, mustParseDate(t, "2026-09-10"), *conflict.With.EffectiveUntil)

	// From the next lesson date on, the slot is free.
	clash.EffectiveFrom = datePtr(t, "2026-09-11")
	taken := w.create(clash)
	require.Equal(t, mustParseDate(t, "2026-09-17"), taken.EffectiveFrom)

	// Teacher One's retired Thursday still books them on 10 September, not
	// after: X-B may have them in that period from 17 September.
	otherClass := w.lesson(w.classB, w.t1, 4, w.p1)
	otherClass.EffectiveFrom = datePtr(t, "2026-09-10")
	_, err = w.svc.CreateSchedule(w.ctx, w.tenant, otherClass, w.actor)
	require.ErrorIs(t, err, domain.ErrConflictTeacher)
	otherClass.EffectiveFrom = datePtr(t, "2026-09-17")
	w.create(otherClass)

	// Snapped bounds never overlap without a shared lesson date: a Monday
	// lesson removed "from Friday 25 September" ends on Monday 21
	// September, and one added "from Tuesday 22 September" starts on
	// Monday 28 September.
	monday := w.create(w.lesson(w.classB, w.t3, 1, w.p2))
	require.NoError(t, w.svc.DeleteScheduleBlock(w.ctx, w.tenant, monday.ID, []uuid.UUID{monday.ID}, datePtr(t, "2026-09-25"), w.actor))
	require.Equal(t, mustParseDate(t, "2026-09-21"), *w.get(monday.ID).EffectiveUntil)
	replacement := w.lesson(w.classB, w.t2, 1, w.p2)
	replacement.EffectiveFrom = datePtr(t, "2026-09-22")
	require.Equal(t, mustParseDate(t, "2026-09-28"), w.create(replacement).EffectiveFrom)
}

// The database backs the service up: the history guard refuses an end
// date before recorded history, and a session or substitution can only be
// created on a date its schedule version is in effect. The exclusion
// constraints carry the names mapConstraintError matches.
func TestEffectiveRangeDatabaseGuards(t *testing.T) {
	w := newEffectiveWorld(t, "effective-guards")
	thursday := w.create(w.lesson(w.classA, w.t1, 4, w.p1))
	w.recordSession(thursday, "2026-09-10")

	_, err := w.admin.Exec(context.Background(), `update schedules set effective_until = '2026-09-03' where id = $1`, thursday.ID)
	require.Error(t, err)
	require.Equal(t, "schedule_history_range", pgConstraint(err))

	_, err = w.admin.Exec(context.Background(), `update schedules set effective_until = '2026-09-10' where id = $1`, thursday.ID)
	require.NoError(t, err)

	_, err = w.admin.Exec(context.Background(),
		`insert into attendance_sessions (tenant_id,academic_year_id,schedule_id,date,class_id,subject_id,teacher_user_id,start_period_id,end_period_id)
		 values ($1,$2,$3,'2026-09-17',$4,$5,$6,$7,$7)`, w.tenant, w.year, thursday.ID, w.classA, w.subject, w.t1, w.p1)
	require.Equal(t, "schedule_in_effect", pgConstraint(err))
	_, err = w.admin.Exec(context.Background(),
		`insert into substitution_requests (tenant_id,academic_year_id,schedule_id,date,requester_user_id,substitute_user_id,status) values ($1,$2,$3,'2026-09-17',$4,$5,'pending')`,
		w.tenant, w.year, thursday.ID, w.t1, w.t2)
	require.Equal(t, "schedule_in_effect", pgConstraint(err))
	_, err = w.admin.Exec(context.Background(),
		`insert into substitution_requests (tenant_id,academic_year_id,schedule_id,date,requester_user_id,substitute_user_id,status) values ($1,$2,$3,'2026-07-09',$4,$5,'pending')`,
		w.tenant, w.year, thursday.ID, w.t1, w.t2)
	require.Equal(t, "schedule_in_effect", pgConstraint(err), "nor before it starts")

	// A clash written past the service hits the named constraints.
	repo := repository.New(w.admin)
	clash := thursday
	clash.ID = uuid.Nil
	clash.TeacherUserID = w.t2
	clash.EffectiveUntil = nil
	_, err = repo.CreateSchedule(context.Background(), clash)
	require.Equal(t, "ex_schedules_class_slot", pgConstraint(err))
	clash.ClassID = w.classB
	clash.TeacherUserID = w.t1
	_, err = repo.CreateSchedule(context.Background(), clash)
	require.Equal(t, "ex_schedules_teacher_slot", pgConstraint(err))
	clash.EffectiveFrom = mustParseDate(t, "2026-09-17")
	_, err = repo.CreateSchedule(context.Background(), clash)
	require.NoError(t, err, "after the version ends the slot is free")
}

// Clearing the timetable from a date ends every lesson there, keeps every
// earlier week, and makes room for a new timetable imported from that
// date; without a date a timetable with history still cannot be cleared.
func TestClearingTheTimetableFromADate(t *testing.T) {
	w := newEffectiveWorld(t, "effective-clear")
	monday := w.create(w.lesson(w.classA, w.t1, 1, w.p1))
	w.recordSession(monday, "2026-09-14")
	friday := w.create(w.lesson(w.classA, w.t2, 5, w.p2))
	in := w.lesson(w.classB, w.t3, 3, w.p1)
	in.EffectiveFrom = datePtr(t, "2026-10-01")
	october := w.create(in)

	var needsDate *domain.HistoryRequiresDateError
	require.ErrorAs(t, w.svc.ClearAcademicYear(w.ctx, w.tenant, w.year, nil, w.actor), &needsDate)
	require.Equal(t, w.today, needsDate.Min)
	var tooEarly *domain.ChangeTooEarlyError
	require.ErrorAs(t, w.svc.ClearAcademicYear(w.ctx, w.tenant, w.year, datePtr(t, "2026-09-14"), w.actor), &tooEarly)
	require.Equal(t, w.today, tooEarly.Min)

	require.NoError(t, w.svc.ClearAcademicYear(w.ctx, w.tenant, w.year, datePtr(t, "2026-09-21"), w.actor))
	require.Equal(t, mustParseDate(t, "2026-09-14"), *w.get(monday.ID).EffectiveUntil)
	require.Equal(t, mustParseDate(t, "2026-09-18"), *w.get(friday.ID).EffectiveUntil)
	require.Zero(t, w.count(`select count(*) from schedules where id = $1`, october.ID), "never started, so it went")
	require.Len(t, w.classWeek(w.classA, "2026-09-14").Blocks, 2)
	require.Empty(t, w.classWeek(w.classA, "2026-09-21").Blocks)

	// The new timetable is imported from the same date.
	from := mustParseDate(t, "2026-09-21")
	rows := []service.ScheduleInput{w.lesson(w.classA, w.t3, 1, w.p1), w.lesson(w.classA, w.t1, 5, w.p2)}
	for i := range rows {
		rows[i].EffectiveFrom = &from
	}
	created, err := w.svc.BulkImport(w.ctx, w.tenant, rows)
	require.NoError(t, err)
	require.Equal(t, from, created[0].EffectiveFrom)
	require.Equal(t, mustParseDate(t, "2026-09-25"), created[1].EffectiveFrom)
	week := w.classWeek(w.classA, "2026-09-21")
	require.Equal(t, w.t3, blockOn(week, 1).TeacherUserID)
	require.Equal(t, w.t1, blockOn(week, 5).TeacherUserID)
	require.Equal(t, w.t1, blockOn(w.classWeek(w.classA, "2026-09-14"), 1).TeacherUserID)
}

// GET /v1/schedules resolves each weekday within the as_of week: a change
// from Wednesday shows the old lessons on Monday and Tuesday and the new
// ones from Wednesday in the same response, which also says which week it
// is and what a manager may do with each block.
func TestListSchedulesResolvesEachWeekdayOfTheWeek(t *testing.T) {
	w := newEffectiveWorld(t, "effective-list")
	var lessons []domain.Schedule
	for day := int16(1); day <= 3; day++ {
		lessons = append(lessons, w.create(w.lesson(w.classB, w.t3, day, w.p1)))
	}
	w.recordSession(lessons[0], "2026-09-14")
	for _, sched := range lessons {
		in := w.lesson(w.classB, w.t2, sched.DayOfWeek, w.p1)
		in.EffectiveFrom = datePtr(t, "2026-09-16")
		_, err := w.svc.UpdateSchedule(w.ctx, w.tenant, sched.ID, in, w.actor)
		require.NoError(t, err)
	}

	handler := schedulehttp.New(w.svc, fullAccessPermissions{}, nil)
	actorCtx := httpx.WithUserID(w.ctx, w.t1)
	asOf := openapi_types.Date{Time: mustParseDate(t, "2026-09-17")}
	res, err := handler.ListSchedules(actorCtx, api.ListSchedulesRequestObject{
		Params: api.ListSchedulesParams{AcademicYearId: w.year, ClassId: &w.classB, AsOf: &asOf},
	})
	require.NoError(t, err)
	body := res.(api.ListSchedules200JSONResponse)
	require.Equal(t, mustParseDate(t, "2026-09-14"), body.WeekStartsOn.Time)
	teacherOn := map[int]uuid.UUID{}
	for _, b := range body.Data {
		teacherOn[b.DayOfWeek] = b.TeacherUserId
		require.NotNil(t, b.MutationPolicy, "a manager gets each block's policy")
	}
	require.Equal(t, map[int]uuid.UUID{1: w.t3, 2: w.t3, 3: w.t2}, teacherOn)
	for _, b := range body.Data {
		if b.DayOfWeek == 1 {
			require.NotNil(t, b.EffectiveUntil)
			require.Equal(t, "2026-09-14", b.EffectiveUntil.Time.Format(time.DateOnly))
			require.True(t, *b.HasHistory)
		}
		if b.DayOfWeek == 3 {
			require.Equal(t, "2026-09-16", b.EffectiveFrom.Time.Format(time.DateOnly))
			require.Nil(t, b.EffectiveUntil)
		}
	}

	// Without as_of the response is today's week; one before the year
	// starts is clamped to its first week.
	res, err = handler.ListSchedules(actorCtx, api.ListSchedulesRequestObject{
		Params: api.ListSchedulesParams{AcademicYearId: w.year, ClassId: &w.classB},
	})
	require.NoError(t, err)
	require.Equal(t, mustParseDate(t, "2026-09-14"), res.(api.ListSchedules200JSONResponse).WeekStartsOn.Time)
	early := openapi_types.Date{Time: mustParseDate(t, "2026-01-01")}
	res, err = handler.ListSchedules(actorCtx, api.ListSchedulesRequestObject{
		Params: api.ListSchedulesParams{AcademicYearId: w.year, ClassId: &w.classB, AsOf: &early},
	})
	require.NoError(t, err)
	require.Equal(t, w.yearStart, res.(api.ListSchedules200JSONResponse).WeekStartsOn.Time)

	// The day view picks the lessons of that date.
	tuesday := 2
	nextTuesday := openapi_types.Date{Time: mustParseDate(t, "2026-09-22")}
	res, err = handler.ListSchedules(actorCtx, api.ListSchedulesRequestObject{
		Params: api.ListSchedulesParams{AcademicYearId: w.year, DayOfWeek: &tuesday, AsOf: &nextTuesday},
	})
	require.NoError(t, err)
	day := res.(api.ListSchedules200JSONResponse).Data
	require.Len(t, day, 1)
	require.Equal(t, w.t2, day[0].TeacherUserId)

	// A dated delete without a date is answered with the earliest one.
	_, err = handler.DeleteSchedule(actorCtx, api.DeleteScheduleRequestObject{ScheduleId: lessons[0].ID})
	var appErr *httpx.Error
	require.ErrorAs(t, err, &appErr)
	require.Equal(t, "SCHEDULE_ENDED", appErr.Code, "the old Monday version already ended")
}
