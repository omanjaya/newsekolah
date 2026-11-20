package permits

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// weekdayCalendar has lessons Monday to Friday for every class, except
// one holiday, standing in for wiring.ClassCalendar over the academic
// calendar. calls counts the batch reads.
type weekdayCalendar struct {
	holiday time.Time
	calls   *int
}

func (c weekdayCalendar) TeachingDays(_ context.Context, _, _ uuid.UUID, classIDs []uuid.UUID, from, to time.Time) (map[uuid.UUID][]time.Time, error) {
	*c.calls++
	var days []time.Time
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		if wd := d.Weekday(); wd != time.Saturday && wd != time.Sunday && !d.Equal(c.holiday) {
			days = append(days, d)
		}
	}
	out := make(map[uuid.UUID][]time.Time, len(classIDs))
	for _, id := range classIDs {
		out[id] = days
	}
	return out, nil
}

// TestLeaveRequestCountsSchoolDays: a Friday-to-Tuesday leave over a
// weekend and a Monday holiday is two days long wherever it is shown --
// the submitted request, the student's list, the reviewer's queue and the
// detail -- matching the two days of Izin attendance records (S13). The
// lists read the calendar once, not once per request.
func TestLeaveRequestCountsSchoolDays(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLeaveWorld(t, ctx, pg.AdminPool, "leave-school-days-"+uuid.NewString())
	from := time.Date(2027, time.February, 5, 0, 0, 0, 0, time.UTC)
	to := time.Date(2027, time.February, 9, 0, 0, 0, 0, time.UTC)

	// Without a calendar the length falls back to calendar days.
	plain := buildLeaveService(pg.AppPool, &fakeAttendanceSync{})
	submitted, err := plain.SubmitLeaveRequest(ctx, service.SubmitLeaveRequestInput{
		TenantID: w.tenantID, ActorUserID: w.studentID, StudentUserID: w.studentID,
		Category: domain.CategoryOther, Reason: "Acara keluarga", StartsOn: from, EndsOn: to,
	})
	require.NoError(t, err)
	require.Equal(t, 5, submitted.SchoolDays)

	calls := 0
	svc := buildLeaveService(pg.AppPool, &fakeAttendanceSync{})
	svc.SetCalendar(weekdayCalendar{holiday: time.Date(2027, time.February, 8, 0, 0, 0, 0, time.UTC), calls: &calls})

	detail, err := svc.GetLeaveRequest(ctx, w.tenantID, submitted.Instance.ID)
	require.NoError(t, err)
	require.Equal(t, 2, detail.SchoolDays, "Fri 5 and Tue 9 only")

	calls = 0
	mine, err := svc.ListMyLeaveRequests(ctx, w.tenantID, w.studentID, 20, 0)
	require.NoError(t, err)
	require.Len(t, mine, 1)
	require.Equal(t, 2, mine[0].SchoolDays)
	require.Equal(t, 1, calls, "one calendar read for the whole list")

	queue, err := svc.ListLeaveRequestsForReview(ctx, w.tenantID, w.homeroomTeacherID, uuid.NullUUID{})
	require.NoError(t, err)
	require.Len(t, queue, 1)
	require.Equal(t, 2, queue[0].SchoolDays)

	reviewed, err := svc.ReviewLeaveRequest(ctx, w.tenantID, submitted.Instance.ID, w.homeroomTeacherID, true, "")
	require.NoError(t, err)
	require.Equal(t, 2, reviewed.SchoolDays)

	issued, err := svc.IssueLeaveLetter(ctx, w.tenantID, submitted.Instance.ID, w.counselorID)
	require.NoError(t, err)
	require.Equal(t, 2, issued.SchoolDays, "the letter states the school days")
}
