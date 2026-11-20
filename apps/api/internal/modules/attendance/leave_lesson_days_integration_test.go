package attendance

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// lessonCalendar has lessons on weekdays only, except one holiday.
type lessonCalendar struct {
	holiday time.Time
}

func (c lessonCalendar) IsTeachingDay(_ context.Context, _, _, _ uuid.UUID, date time.Time) (bool, string, error) {
	if sameDate(date, c.holiday) {
		return false, "Cuti bersama", nil
	}
	wd := date.Weekday()
	return wd != time.Saturday && wd != time.Sunday, "", nil
}

func (c lessonCalendar) TeachingDays(ctx context.Context, tenantID, yearID uuid.UUID, classIDs []uuid.UUID, from, to time.Time) (map[uuid.UUID][]time.Time, error) {
	return teachingDaysByDay(ctx, c, tenantID, yearID, classIDs, from, to)
}

// rangeOverrider is an issued leave letter for one student over
// [from, to], answering both the single and the batch Overrider forms the
// way permits does: for every calendar date of the range.
type rangeOverrider struct {
	student  uuid.UUID
	from, to time.Time
	code     string
}

func (o rangeOverrider) covers(student uuid.UUID, date time.Time) bool {
	day := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC)
	return student == o.student && !day.Before(o.from) && !day.After(o.to)
}

func (o rangeOverrider) Override(_ context.Context, _ uuid.UUID, student uuid.UUID, date time.Time) (string, domain.EntrySource, bool, error) {
	if o.covers(student, date) {
		return o.code, domain.SourceLeave, true, nil
	}
	return "", "", false, nil
}

func (o rangeOverrider) OverridesForDates(_ context.Context, _ uuid.UUID, students []uuid.UUID, dates []time.Time) ([]service.DateOverride, error) {
	var out []service.DateOverride
	for _, s := range students {
		for _, d := range dates {
			if o.covers(s, d) {
				out = append(out, service.DateOverride{StudentUserID: s, Date: d, StatusCode: o.code})
			}
		}
	}
	return out, nil
}

// TestLeaveCountsOnlyDaysWithLessons: a Friday-to-Tuesday leave over a
// weekend and a Monday holiday is two days of Izin, not five, in the
// student's recap and in the batch day statuses (audit S13).
func TestLeaveCountsOnlyDaysWithLessons(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWorld(t, ctx, pg.AdminPool, "leave-school-days")
	from := time.Date(2027, 2, 5, 0, 0, 0, 0, time.UTC)
	to := time.Date(2027, 2, 9, 0, 0, 0, 0, time.UTC)
	holiday := time.Date(2027, 2, 8, 0, 0, 0, 0, time.UTC)
	svc := buildServiceWithOverrider(pg.AppPool, rangeOverrider{student: w.student2ID, from: from, to: to, code: "I"})
	svc.SetCalendar(lessonCalendar{holiday: holiday})
	after := clock.WithTime(ctx, time.Date(2027, 2, 10, 9, 0, 0, 0, time.UTC))

	days, totals, err := svc.GetMonthlySummary(after, w.tenantID, w.student2ID, "2027-02")
	require.NoError(t, err)
	require.Equal(t, 2, totals["I"], "Fri 5 and Tue 9 only")
	for _, d := range days {
		switch d.Date.Format(time.DateOnly) {
		case "2027-02-05", "2027-02-09":
			require.Equal(t, "I", d.StatusCode)
		case "2027-02-06", "2027-02-07", "2027-02-08":
			require.NotEqual(t, "I", d.StatusCode, "%s has no lessons", d.Date.Format(time.DateOnly))
			require.Empty(t, d.Sessions, "no leave session is invented for %s", d.Date.Format(time.DateOnly))
		}
	}

	var dates []time.Time
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		dates = append(dates, d)
	}
	statuses, err := svc.DayStatusesForStudents(after, w.tenantID, []uuid.UUID{w.student2ID}, dates)
	require.NoError(t, err)
	izin := 0
	for _, st := range statuses {
		if st.StatusCode == "I" {
			izin++
		}
	}
	require.Equal(t, 2, izin, "the batch path agrees with the recap")
}

// TestForceStatusSkipsDaysWithoutLessons: a session left on a day the
// calendar has since made a holiday does not take a leave letter's status.
func TestForceStatusSkipsDaysWithoutLessons(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWorld(t, ctx, pg.AdminPool, "force-holiday")
	actor := service.Actor{UserID: w.teacherID}

	plain := buildService(pg.AppPool)
	opened, err := plain.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)

	svc := buildService(pg.AppPool)
	svc.SetCalendar(holidayCalendar{classID: w.classID, date: w.today, name: "Libur"})
	require.NoError(t, svc.ForceStatus(ctx, w.tenantID, w.student1ID, w.today, w.today.Add(24*time.Hour-time.Second), "I", string(domain.SourceLeave), "surat izin"))

	var count int
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select count(*) from attendance_entries where session_id = $1 and student_user_id = $2`, opened.Session.ID, w.student1ID,
	).Scan(&count))
	require.Zero(t, count, "nothing is written into a holiday's session")
}
