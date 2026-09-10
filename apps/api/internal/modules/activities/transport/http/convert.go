package http

import (
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/service"
)

func toAPIClub(c domain.Extracurricular) api.Extracurricular {
	out := api.Extracurricular{
		Id: c.ID, AcademicYearId: c.AcademicYearID, Name: c.Name, Description: c.Description,
		CoachUserId: uuidPtr(c.CoachUserID), Capacity: c.Capacity, Location: c.Location, IsActive: c.IsActive,
		MeetingStart: c.MeetingStart, MeetingEnd: c.MeetingEnd,
	}
	if c.MeetingDay != nil {
		d := int(*c.MeetingDay)
		out.MeetingDay = &d
	}
	return out
}

func toAPIMembership(m domain.Membership) api.Membership {
	out := api.Membership{
		Id: m.ID, ExtracurricularId: m.ExtracurricularID, StudentUserId: m.StudentUserID,
		JoinedOn: openapi_types.Date{Time: m.JoinedOn}, Status: api.MembershipStatus(m.Status),
	}
	if m.LeftOn != nil {
		out.LeftOn = &openapi_types.Date{Time: *m.LeftOn}
	}
	return out
}

func toAPIMemberships(list []domain.Membership) []api.Membership {
	out := make([]api.Membership, len(list))
	for i, m := range list {
		out[i] = toAPIMembership(m)
	}
	return out
}

func toAPIStudentMembership(m service.StudentMembership) api.StudentMembership {
	out := api.StudentMembership{
		Id: m.ID, ExtracurricularId: m.ExtracurricularID, StudentUserId: m.StudentUserID,
		JoinedOn: openapi_types.Date{Time: m.JoinedOn}, Status: api.StudentMembershipStatus(m.Status), ClubName: m.ClubName,
	}
	if m.LeftOn != nil {
		out.LeftOn = &openapi_types.Date{Time: *m.LeftOn}
	}
	return out
}

func toAPIMeeting(m domain.Meeting) api.Meeting {
	return api.Meeting{Id: m.ID, ExtracurricularId: m.ExtracurricularID, MeetingDate: openapi_types.Date{Time: m.MeetingDate}, Notes: m.Notes}
}

func toAPIAttendance(a domain.AttendanceEntry) api.AttendanceEntry {
	return api.AttendanceEntry{
		Id: a.ID, MeetingId: a.MeetingID, StudentUserId: a.StudentUserID, StatusCode: api.AttendanceStatus(a.StatusCode), Notes: a.Notes,
	}
}

func toAPIAttendanceList(list []domain.AttendanceEntry) []api.AttendanceEntry {
	out := make([]api.AttendanceEntry, len(list))
	for i, a := range list {
		out[i] = toAPIAttendance(a)
	}
	return out
}

func toAPIParticipant(p domain.Participant) api.Participant {
	return api.Participant{
		Id: p.ID, Scope: api.ParticipantScope(p.Scope), ClassId: uuidPtr(p.ClassID),
		GradeLevelId: uuidPtr(p.GradeLevelID), StudentUserId: uuidPtr(p.StudentID),
	}
}

func toAPIParticipants(list []domain.Participant) []api.Participant {
	out := make([]api.Participant, len(list))
	for i, p := range list {
		out[i] = toAPIParticipant(p)
	}
	return out
}

func toAPIActivity(a domain.Activity) api.ActivityEvent {
	out := api.ActivityEvent{
		Id: a.ID, AcademicYearId: a.AcademicYearID, Name: a.Name, Description: a.Description, Location: a.Location,
		StartDate: openapi_types.Date{Time: a.StartDate}, EndDate: openapi_types.Date{Time: a.EndDate}, OrganiserUserId: uuidPtr(a.OrganiserID),
	}
	if a.Participants != nil {
		participants := toAPIParticipants(a.Participants)
		out.Participants = &participants
	}
	return out
}

func toAPIAchievement(a domain.Achievement) api.Achievement {
	var notes *string
	if a.Notes != "" {
		notes = &a.Notes
	}
	return api.Achievement{
		Id: a.ID, StudentUserId: a.StudentUserID, CompetitionName: a.CompetitionName, Level: api.AchievementLevel(a.Level),
		Placement: a.Placing, AchievedOn: openapi_types.Date{Time: a.AchievedOn}, Notes: notes,
	}
}
