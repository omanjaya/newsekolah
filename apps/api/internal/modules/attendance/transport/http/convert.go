package http

import (
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
)

func nullUUIDPtr(id uuid.NullUUID) *uuid.UUID {
	if !id.Valid {
		return nil
	}
	v := id.UUID
	return &v
}

func strPtrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func toAPIStatusDef(d domain.StatusDef) api.AttendanceStatusDef {
	return api.AttendanceStatusDef{Code: d.Code, Label: d.Label, Color: d.Color, CountsAsPresent: d.CountsAsPresent}
}

func toAPIStatusDefs(defs []domain.StatusDef) []api.AttendanceStatusDef {
	out := make([]api.AttendanceStatusDef, len(defs))
	for i, d := range defs {
		out[i] = toAPIStatusDef(d)
	}
	return out
}

func toAPISessionSummary(s service.SessionSummary) api.AttendanceSessionSummary {
	sess := s.Session
	return api.AttendanceSessionSummary{
		Id: sess.ID, ScheduleId: sess.ScheduleID, Date: openapi_types.Date{Time: sess.Date}, ClassId: sess.ClassID,
		SubjectId: sess.SubjectID, TeacherUserId: sess.TeacherUserID, SubstituteUserId: nullUUIDPtr(sess.SubstituteUserID),
		StartPeriodId: sess.StartPeriodID, EndPeriodId: sess.EndPeriodID, IsSubstitute: s.IsSubstitute, SubmittedAt: sess.SubmittedAt,
	}
}

func toAPIRosterItem(r service.RosterItem) api.AttendanceRosterItem {
	item := api.AttendanceRosterItem{
		StudentUserId: r.StudentUserID, Name: r.Name, PreviousStatus: strPtrOrNil(r.PreviousStatus),
		CurrentStatus: strPtrOrNil(r.CurrentStatus), Notes: strPtrOrNil(r.Notes),
	}
	if r.Source != "" {
		source := api.AttendanceRosterItemSource(r.Source)
		item.Source = &source
	}
	if r.Blocked {
		blocked := true
		item.Blocked = &blocked
		item.BlockedReason = strPtrOrNil(r.BlockedReason)
	}
	return item
}

func toAPIRosterItems(items []service.RosterItem) []api.AttendanceRosterItem {
	out := make([]api.AttendanceRosterItem, len(items))
	for i, item := range items {
		out[i] = toAPIRosterItem(item)
	}
	return out
}

func toAPISessionDetail(d service.SessionDetail) api.AttendanceSessionDetail {
	sess := d.Session
	out := api.AttendanceSessionDetail{
		Id: sess.ID, ScheduleId: sess.ScheduleID, Date: openapi_types.Date{Time: sess.Date}, ClassId: sess.ClassID,
		SubjectId: sess.SubjectID, TeacherUserId: sess.TeacherUserID, SubstituteUserId: nullUUIDPtr(sess.SubstituteUserID),
		StartPeriodId: sess.StartPeriodID, EndPeriodId: sess.EndPeriodID, IsSubstitute: d.IsSubstitute, SubmittedAt: sess.SubmittedAt,
		MeetingNumber: d.MeetingNumber, PreviousJournalTopic: strPtrOrNil(d.PreviousJournalTopic),
		Statuses: toAPIStatusDefs(d.Statuses), Roster: toAPIRosterItems(d.Roster),
		JournalTopic: strPtrOrNil(d.JournalTopic), JournalActivities: strPtrOrNil(d.JournalActivities), JournalReflection: strPtrOrNil(d.JournalReflection),
	}
	if len(d.SkippedBlockedStudentIDs) > 0 {
		out.SkippedBlockedStudentIds = &d.SkippedBlockedStudentIDs
	}
	return out
}

func toAPICalendarDaySession(s service.CalendarDaySession) api.AttendanceCalendarDaySession {
	out := api.AttendanceCalendarDaySession{
		ScheduleId: s.ScheduleID, SubjectId: s.SubjectID, SubjectName: strPtrOrNil(s.SubjectName),
		TeacherUserId: nilUUIDPtr(s.TeacherUserID), TeacherName: strPtrOrNil(s.TeacherName),
		PeriodLabel: strPtrOrNil(s.PeriodLabel), StatusCode: strPtrOrNil(s.StatusCode), Note: strPtrOrNil(s.Note),
	}
	if s.Source != "" {
		source := api.AttendanceCalendarDaySessionSource(s.Source)
		out.Source = &source
	}
	return out
}

// nilUUIDPtr is nullUUIDPtr's counterpart for a plain uuid.UUID that is
// "unset" as the zero value (CalendarDaySession.TeacherUserID has no
// uuid.NullUUID wrapper), used only where a zero UUID must render as an
// absent field rather than an all-zero one.
func nilUUIDPtr(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

func toAPICalendarDaySessions(sessions []service.CalendarDaySession) *[]api.AttendanceCalendarDaySession {
	if len(sessions) == 0 {
		return nil
	}
	out := make([]api.AttendanceCalendarDaySession, len(sessions))
	for i, s := range sessions {
		out[i] = toAPICalendarDaySession(s)
	}
	return &out
}

func toAPICalendarDay(c service.CalendarDay) api.AttendanceCalendarDay {
	return api.AttendanceCalendarDay{
		Date: openapi_types.Date{Time: c.Date}, StatusCode: c.StatusCode, ExpectedSessions: c.ExpectedSessions,
		SubmittedSessions: c.SubmittedSessions, Complete: c.Complete, Sessions: toAPICalendarDaySessions(c.Sessions),
	}
}

func toAPICalendarDays(days []service.CalendarDay) []api.AttendanceCalendarDay {
	out := make([]api.AttendanceCalendarDay, len(days))
	for i, d := range days {
		out[i] = toAPICalendarDay(d)
	}
	return out
}

func toAPIRosterEntry(r service.RosterEntry) api.AttendanceRosterEntry {
	out := api.AttendanceRosterEntry{
		StudentUserId: r.StudentUserID, Name: r.Name, StatusCode: r.StatusCode,
		ExpectedSessions: r.ExpectedSessions, SubmittedSessions: r.SubmittedSessions, Complete: r.Complete,
	}
	if r.PartialAbsence {
		partial := true
		out.PartialAbsence = &partial
	}
	return out
}

func toAPIRosterEntries(entries []service.RosterEntry) []api.AttendanceRosterEntry {
	out := make([]api.AttendanceRosterEntry, len(entries))
	for i, e := range entries {
		out[i] = toAPIRosterEntry(e)
	}
	return out
}

func toAPIHomeroomEntry(e service.HomeroomEntry) api.AttendanceHomeroomEntry {
	out := api.AttendanceHomeroomEntry{
		StudentUserId: e.StudentUserID, Name: e.Name, StatusCode: e.StatusCode,
		ExpectedSessions: e.ExpectedSessions, SubmittedSessions: e.SubmittedSessions, Complete: e.Complete,
		Nis: strPtrOrNil(e.NIS), GuardianName: strPtrOrNil(e.GuardianName), GuardianPhone: strPtrOrNil(e.GuardianPhone),
	}
	if e.PartialAbsence {
		partial := true
		out.PartialAbsence = &partial
	}
	if e.ViolationCount > 0 || e.ViolationPoints > 0 {
		count, points := e.ViolationCount, e.ViolationPoints
		out.ViolationCount, out.ViolationPoints = &count, &points
	}
	return out
}

func toAPIHomeroomEntries(entries []service.HomeroomEntry) []api.AttendanceHomeroomEntry {
	out := make([]api.AttendanceHomeroomEntry, len(entries))
	for i, e := range entries {
		out[i] = toAPIHomeroomEntry(e)
	}
	return out
}

func toAPIDailyReportSessionEntry(e service.DailyReportSessionEntry) api.AttendanceDailyReportSessionEntry {
	out := api.AttendanceDailyReportSessionEntry{StudentUserId: e.StudentUserID, Name: e.Name, StatusCode: e.StatusCode}
	if e.Notes != "" {
		out.Notes = &e.Notes
	}
	return out
}

func toAPIDailyReportSession(s service.DailyReportSession) api.AttendanceDailyReportSession {
	entries := make([]api.AttendanceDailyReportSessionEntry, len(s.Entries))
	for i, e := range s.Entries {
		entries[i] = toAPIDailyReportSessionEntry(e)
	}
	return api.AttendanceDailyReportSession{
		SessionId: s.SessionID, ClassId: s.ClassID, ClassName: s.ClassName, SubjectId: s.SubjectID, SubjectName: s.SubjectName,
		TeacherUserId: s.TeacherUserID, TeacherName: s.TeacherName, PeriodLabel: s.PeriodLabel, SubmittedAt: s.SubmittedAt, Entries: entries,
	}
}

func toAPIDailyReportSessions(sessions []service.DailyReportSession) []api.AttendanceDailyReportSession {
	out := make([]api.AttendanceDailyReportSession, len(sessions))
	for i, s := range sessions {
		out[i] = toAPIDailyReportSession(s)
	}
	return out
}

func toAPIDailyReport(r service.DailyReport) api.AttendanceDailyReport {
	sessions := toAPIDailyReportSessions(r.Sessions)
	return api.AttendanceDailyReport{
		ClassId: r.ClassID, Date: openapi_types.Date{Time: r.Date}, ExpectedSessions: r.ExpectedSessions,
		SubmittedSessions: r.SubmittedSessions, Complete: r.Complete, Students: toAPIRosterEntries(r.Students), StatusCounts: r.StatusCounts,
		Sessions: &sessions,
	}
}

func ToAPIMonitorSnapshot(m service.MonitorSnapshot) api.MonitorSnapshot {
	sessions := make([]api.MonitorSessionCard, len(m.Sessions))
	for i, c := range m.Sessions {
		card := api.MonitorSessionCard{
			ClassName: c.ClassName, SubjectName: c.SubjectName, TeacherName: c.TeacherName,
			Status: api.MonitorSessionCardStatus(c.Status),
		}
		if c.SubstituteName != "" {
			substitute := c.SubstituteName
			card.SubstituteName = &substitute
		}
		sessions[i] = card
	}
	snapshot := api.MonitorSnapshot{
		GeneratedAt: m.GeneratedAt, Date: openapi_types.Date{Time: m.Date}, DayName: m.DayName,
		StatusCounts: m.StatusCounts, Sessions: sessions,
	}
	if m.CurrentPeriod != nil {
		snapshot.CurrentPeriod = &api.MonitorPeriod{
			Name: m.CurrentPeriod.Name, StartsAt: m.CurrentPeriod.StartsAt, EndsAt: m.CurrentPeriod.EndsAt,
		}
	}
	return snapshot
}
