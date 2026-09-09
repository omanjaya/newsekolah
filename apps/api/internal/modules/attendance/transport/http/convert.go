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
	return api.AttendanceSessionDetail{
		Id: sess.ID, ScheduleId: sess.ScheduleID, Date: openapi_types.Date{Time: sess.Date}, ClassId: sess.ClassID,
		SubjectId: sess.SubjectID, TeacherUserId: sess.TeacherUserID, SubstituteUserId: nullUUIDPtr(sess.SubstituteUserID),
		StartPeriodId: sess.StartPeriodID, EndPeriodId: sess.EndPeriodID, IsSubstitute: d.IsSubstitute, SubmittedAt: sess.SubmittedAt,
		MeetingNumber: d.MeetingNumber, PreviousJournalTopic: strPtrOrNil(d.PreviousJournalTopic),
		Statuses: toAPIStatusDefs(d.Statuses), Roster: toAPIRosterItems(d.Roster),
		JournalTopic: strPtrOrNil(d.JournalTopic), JournalActivities: strPtrOrNil(d.JournalActivities), JournalReflection: strPtrOrNil(d.JournalReflection),
	}
}

func toAPICalendarDaySessions(sessions []service.CalendarDaySession) *[]struct {
	ScheduleId openapi_types.UUID `json:"schedule_id"`
	StatusCode *string            `json:"status_code,omitempty"`
	SubjectId  openapi_types.UUID `json:"subject_id"`
} {
	if len(sessions) == 0 {
		return nil
	}
	out := make([]struct {
		ScheduleId openapi_types.UUID `json:"schedule_id"`
		StatusCode *string            `json:"status_code,omitempty"`
		SubjectId  openapi_types.UUID `json:"subject_id"`
	}, len(sessions))
	for i, s := range sessions {
		out[i].ScheduleId = s.ScheduleID
		out[i].SubjectId = s.SubjectID
		out[i].StatusCode = strPtrOrNil(s.StatusCode)
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
	return api.AttendanceRosterEntry{
		StudentUserId: r.StudentUserID, Name: r.Name, StatusCode: r.StatusCode,
		ExpectedSessions: r.ExpectedSessions, SubmittedSessions: r.SubmittedSessions, Complete: r.Complete,
	}
}

func toAPIRosterEntries(entries []service.RosterEntry) []api.AttendanceRosterEntry {
	out := make([]api.AttendanceRosterEntry, len(entries))
	for i, e := range entries {
		out[i] = toAPIRosterEntry(e)
	}
	return out
}

func toAPIDailyReport(r service.DailyReport) api.AttendanceDailyReport {
	return api.AttendanceDailyReport{
		ClassId: r.ClassID, Date: openapi_types.Date{Time: r.Date}, ExpectedSessions: r.ExpectedSessions,
		SubmittedSessions: r.SubmittedSessions, Complete: r.Complete, Students: toAPIRosterEntries(r.Students), StatusCounts: r.StatusCounts,
	}
}

func toAPIMonitorSnapshot(m service.MonitorSnapshot) api.MonitorSnapshot {
	sessions := make([]api.MonitorSessionCard, len(m.Sessions))
	for i, c := range m.Sessions {
		sessions[i] = api.MonitorSessionCard{
			ClassName: c.ClassName, SubjectName: c.SubjectName, TeacherName: c.TeacherName,
			Status: api.MonitorSessionCardStatus(c.Status),
		}
	}
	return api.MonitorSnapshot{GeneratedAt: m.GeneratedAt, StatusCounts: m.StatusCounts, Sessions: sessions}
}
