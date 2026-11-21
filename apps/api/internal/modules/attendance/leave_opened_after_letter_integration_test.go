package attendance

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestSessionOpenedAfterLetterNamesIt: a session opened and saved after a
// leave letter was issued carries the letter's note, as an unopened lesson
// of the same letter does, in the teacher's roster, in the saved entry and
// in the student's calendar; an entry saved earlier without the note still
// reads it in the calendar (audit r7v-auth-attendance-R1).
func TestSessionOpenedAfterLetterNamesIt(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedWorld(t, ctx, pg.AdminPool, "leave-opened-after-letter")
	const note = "leave letter 19/IZIN/IV/2027"
	svc := buildServiceWithOverrider(pg.AppPool, notedOverrider{
		rangeOverrider: rangeOverrider{student: w.student1ID, from: w.today, to: w.today, code: "S"},
		note:           note,
	})
	actor := service.Actor{UserID: w.teacherID}

	opened, err := svc.OpenSession(ctx, w.tenantID, actor, w.scheduleTodayID, w.today, domain.SaveModeNormal)
	require.NoError(t, err)
	rosterNotes := map[uuid.UUID]string{}
	for _, item := range opened.Roster {
		rosterNotes[item.StudentUserID] = item.Notes
	}
	require.Equal(t, note, rosterNotes[w.student1ID], "the locked roster row names the letter before the save")
	require.Empty(t, rosterNotes[w.student2ID], "a student without a letter has no note")

	// The web sends only the notes a teacher typed: none for the letter.
	_, err = svc.SaveEntries(ctx, w.tenantID, actor, opened.Session.ID, service.SaveEntriesInput{
		Entries: []service.SaveEntryInput{
			{StudentUserID: w.student1ID, StatusCode: "H"},
			{StudentUserID: w.student2ID, StatusCode: "H", Notes: "teacher note"},
		},
	})
	require.NoError(t, err)

	storedNote := func(student uuid.UUID) string {
		t.Helper()
		var notes string
		require.NoError(t, pg.AdminPool.QueryRow(ctx,
			`select coalesce(notes, '') from attendance_entries where session_id = $1 and student_user_id = $2`,
			opened.Session.ID, student).Scan(&notes))
		return notes
	}
	require.Equal(t, note, storedNote(w.student1ID), "the forced entry stores the letter's note, as ForceStatus writes it")
	require.Equal(t, "teacher note", storedNote(w.student2ID), "an entry the letter does not decide keeps the teacher's note")

	todayOf := func() service.CalendarDay {
		t.Helper()
		days, err := svc.GetStudentCalendarMonth(ctx, w.tenantID, w.student1ID, w.today.Format("2006-01"))
		require.NoError(t, err)
		for _, d := range days {
			if sameDate(d.Date, w.today) {
				return d
			}
		}
		t.Fatalf("today missing from the calendar")
		return service.CalendarDay{}
	}
	day := todayOf()
	require.Len(t, day.Sessions, 1)
	require.Equal(t, "S", day.Sessions[0].StatusCode)
	require.Equal(t, domain.SourceLeave, day.Sessions[0].Source)
	require.Equal(t, note, day.Sessions[0].Note)

	// An entry stored without the note (saved before SaveEntries wrote it)
	// still names the letter in the calendar.
	_, err = pg.AdminPool.Exec(ctx,
		`update attendance_entries set notes = null where session_id = $1 and student_user_id = $2`,
		opened.Session.ID, w.student1ID)
	require.NoError(t, err)
	day = todayOf()
	require.Len(t, day.Sessions, 1)
	require.Equal(t, note, day.Sessions[0].Note)
}
