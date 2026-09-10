// Package http adapts the generated strict-server interface to the
// mentoring service.
package http

import (
	"context"
	"errors"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type MentoringHandler struct{ service *service.Service }

func New(svc *service.Service) *MentoringHandler { return &MentoringHandler{service: svc} }

func tenantID(ctx context.Context) uuid.UUID { id, _ := httpx.TenantIDFromContext(ctx); return id }
func userID(ctx context.Context) uuid.UUID   { id, _ := httpx.UserIDFromContext(ctx); return id }

var errorMap = map[error]*httpx.Error{
	domain.ErrGroupNotFound:        httpx.ErrMentorGroupNotFound,
	domain.ErrGroupFull:            httpx.ErrMentorGroupFull,
	domain.ErrMemberAlreadyInGroup: httpx.ErrMentorMemberAlreadyInGroup,
	domain.ErrNoteNotFound:         httpx.ErrMentorNoteNotFound,
	domain.ErrNoteForbidden:        httpx.ErrMentorNoteForbidden,
	domain.ErrSummaryNotFound:      httpx.ErrMentorSummaryNotFound,
	domain.ErrModuleDisabled:       httpx.ErrMentoringModuleDisabled,
	domain.ErrInvalidInput:         httpx.ErrValidation,
	domain.ErrGroupSizeLimitBelow:  httpx.ErrValidation,
	domain.ErrNoActiveAcademicYear: httpx.ErrValidation,
}

func mapError(err error) error {
	for d, h := range errorMap {
		if errors.Is(err, d) {
			return h
		}
	}
	var appErr *httpx.Error
	if errors.As(err, &appErr) {
		return appErr
	}
	return httpx.Internal(err)
}

func toAPIGroup(g domain.MentorGroup) api.MentorGroup {
	return api.MentorGroup{
		Id: openapi_types.UUID(g.ID), AcademicYearId: openapi_types.UUID(g.AcademicYearID),
		MentorUserId: openapi_types.UUID(g.MentorUserID), Name: g.Name, CreatedAt: g.CreatedAt,
	}
}

func toAPIMember(m domain.GroupMember) api.MentorGroupMember {
	return api.MentorGroupMember{
		Id: openapi_types.UUID(m.ID), GroupId: openapi_types.UUID(m.GroupID),
		StudentUserId: openapi_types.UUID(m.StudentUserID), AssignedAt: m.AssignedAt,
	}
}

func toAPINote(n domain.MeetingNote) api.MentorMeetingNote {
	attendees := make([]openapi_types.UUID, len(n.AttendeeUserIDs))
	for i, id := range n.AttendeeUserIDs {
		attendees[i] = openapi_types.UUID(id)
	}
	mentor := openapi_types.UUID(n.MentorUserID)
	return api.MentorMeetingNote{
		Id: openapi_types.UUID(n.ID), GroupId: openapi_types.UUID(n.GroupID), MentorUserId: &mentor,
		MetAt: n.MetAt, Kind: api.MentorMeetingNoteKind(n.Kind), AttendeeUserIds: attendees,
		Topic: n.Topic, Content: n.Content, AgreedActions: n.AgreedActions,
	}
}

func toAPISummary(s domain.TermSummary) api.MentorTermSummary {
	mentor := openapi_types.UUID(s.MentorUserID)
	return api.MentorTermSummary{
		Id: openapi_types.UUID(s.ID), TermId: openapi_types.UUID(s.TermID), GroupId: openapi_types.UUID(s.GroupID),
		StudentUserId: openapi_types.UUID(s.StudentUserID), MentorUserId: &mentor, Summary: s.Summary,
	}
}

// Group-size limit.

func (h *MentoringHandler) GetMentorGroupSizeLimit(ctx context.Context, _ api.GetMentorGroupSizeLimitRequestObject) (api.GetMentorGroupSizeLimitResponseObject, error) {
	limit, err := h.service.GroupSizeLimit(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetMentorGroupSizeLimit200JSONResponse{Limit: limit}, nil
}

func (h *MentoringHandler) SetMentorGroupSizeLimit(ctx context.Context, request api.SetMentorGroupSizeLimitRequestObject) (api.SetMentorGroupSizeLimitResponseObject, error) {
	limit, err := h.service.SetGroupSizeLimit(ctx, tenantID(ctx), request.Body.Limit)
	if err != nil {
		return nil, mapError(err)
	}
	return api.SetMentorGroupSizeLimit200JSONResponse{Limit: limit}, nil
}

// Groups.

func (h *MentoringHandler) ListMentorGroups(ctx context.Context, _ api.ListMentorGroupsRequestObject) (api.ListMentorGroupsResponseObject, error) {
	groups, err := h.service.ListGroupsForYear(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.MentorGroup, len(groups))
	for i, g := range groups {
		data[i] = toAPIGroup(g)
	}
	return api.ListMentorGroups200JSONResponse{Data: data}, nil
}

func (h *MentoringHandler) ListMyMentorGroups(ctx context.Context, _ api.ListMyMentorGroupsRequestObject) (api.ListMyMentorGroupsResponseObject, error) {
	groups, err := h.service.ListGroupsForMentor(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.MentorGroup, len(groups))
	for i, g := range groups {
		data[i] = toAPIGroup(g)
	}
	return api.ListMyMentorGroups200JSONResponse{Data: data}, nil
}

func (h *MentoringHandler) CreateMentorGroup(ctx context.Context, request api.CreateMentorGroupRequestObject) (api.CreateMentorGroupResponseObject, error) {
	b := request.Body
	group, err := h.service.CreateGroup(ctx, tenantID(ctx), service.GroupInput{MentorUserID: uuid.UUID(b.MentorUserId), Name: b.Name})
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateMentorGroup201JSONResponse(toAPIGroup(group)), nil
}

func (h *MentoringHandler) GetMentorGroup(ctx context.Context, request api.GetMentorGroupRequestObject) (api.GetMentorGroupResponseObject, error) {
	group, err := h.service.GetGroup(ctx, tenantID(ctx), request.GroupId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetMentorGroup200JSONResponse(toAPIGroup(group)), nil
}

func (h *MentoringHandler) UpdateMentorGroup(ctx context.Context, request api.UpdateMentorGroupRequestObject) (api.UpdateMentorGroupResponseObject, error) {
	b := request.Body
	group, err := h.service.UpdateGroup(ctx, tenantID(ctx), request.GroupId, service.GroupInput{MentorUserID: uuid.UUID(b.MentorUserId), Name: b.Name})
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateMentorGroup200JSONResponse(toAPIGroup(group)), nil
}

func (h *MentoringHandler) DeleteMentorGroup(ctx context.Context, request api.DeleteMentorGroupRequestObject) (api.DeleteMentorGroupResponseObject, error) {
	if err := h.service.DeleteGroup(ctx, tenantID(ctx), request.GroupId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteMentorGroup204Response{}, nil
}

// Members.

func (h *MentoringHandler) ListMentorGroupMembers(ctx context.Context, request api.ListMentorGroupMembersRequestObject) (api.ListMentorGroupMembersResponseObject, error) {
	members, err := h.service.ListMembers(ctx, tenantID(ctx), request.GroupId)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.MentorGroupMember, len(members))
	for i, m := range members {
		data[i] = toAPIMember(m)
	}
	return api.ListMentorGroupMembers200JSONResponse{Data: data}, nil
}

func (h *MentoringHandler) AssignMentorGroupMember(ctx context.Context, request api.AssignMentorGroupMemberRequestObject) (api.AssignMentorGroupMemberResponseObject, error) {
	member, err := h.service.AssignStudent(ctx, tenantID(ctx), request.GroupId, uuid.UUID(request.Body.StudentUserId))
	if err != nil {
		return nil, mapError(err)
	}
	return api.AssignMentorGroupMember201JSONResponse(toAPIMember(member)), nil
}

func (h *MentoringHandler) RemoveMentorGroupMember(ctx context.Context, request api.RemoveMentorGroupMemberRequestObject) (api.RemoveMentorGroupMemberResponseObject, error) {
	if err := h.service.RemoveStudent(ctx, tenantID(ctx), request.GroupId, request.StudentId); err != nil {
		return nil, mapError(err)
	}
	return api.RemoveMentorGroupMember204Response{}, nil
}

// Meeting notes.

func (h *MentoringHandler) ListMentorMeetingNotes(ctx context.Context, request api.ListMentorMeetingNotesRequestObject) (api.ListMentorMeetingNotesResponseObject, error) {
	notes, err := h.service.ListMeetingNotesForGroup(ctx, tenantID(ctx), request.GroupId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.MentorMeetingNote, len(notes))
	for i, n := range notes {
		data[i] = toAPINote(n)
	}
	return api.ListMentorMeetingNotes200JSONResponse{Data: data}, nil
}

func (h *MentoringHandler) CreateMentorMeetingNote(ctx context.Context, request api.CreateMentorMeetingNoteRequestObject) (api.CreateMentorMeetingNoteResponseObject, error) {
	b := request.Body
	attendees := make([]uuid.UUID, len(b.AttendeeUserIds))
	for i, id := range b.AttendeeUserIds {
		attendees[i] = uuid.UUID(id)
	}
	note, err := h.service.CreateMeetingNote(ctx, tenantID(ctx), userID(ctx), service.MeetingNoteInput{
		GroupID: request.GroupId, MetAt: b.MetAt, Kind: domain.MeetingKind(b.Kind), AttendeeUserIDs: attendees,
		Topic: b.Topic, Content: b.Content, AgreedActions: strOr(b.AgreedActions),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateMentorMeetingNote201JSONResponse(toAPINote(note)), nil
}

func (h *MentoringHandler) GetMentorMeetingNote(ctx context.Context, request api.GetMentorMeetingNoteRequestObject) (api.GetMentorMeetingNoteResponseObject, error) {
	note, err := h.service.GetMeetingNote(ctx, tenantID(ctx), request.NoteId, userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetMentorMeetingNote200JSONResponse(toAPINote(note)), nil
}

func (h *MentoringHandler) UpdateMentorMeetingNote(ctx context.Context, request api.UpdateMentorMeetingNoteRequestObject) (api.UpdateMentorMeetingNoteResponseObject, error) {
	b := request.Body
	attendees := make([]uuid.UUID, len(b.AttendeeUserIds))
	for i, id := range b.AttendeeUserIds {
		attendees[i] = uuid.UUID(id)
	}
	note, err := h.service.UpdateMeetingNote(ctx, tenantID(ctx), request.NoteId, userID(ctx), service.MeetingNoteInput{
		MetAt: b.MetAt, Kind: domain.MeetingKind(b.Kind), AttendeeUserIDs: attendees,
		Topic: b.Topic, Content: b.Content, AgreedActions: strOr(b.AgreedActions),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateMentorMeetingNote200JSONResponse(toAPINote(note)), nil
}

func (h *MentoringHandler) DeleteMentorMeetingNote(ctx context.Context, request api.DeleteMentorMeetingNoteRequestObject) (api.DeleteMentorMeetingNoteResponseObject, error) {
	if err := h.service.DeleteMeetingNote(ctx, tenantID(ctx), request.NoteId, userID(ctx)); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteMentorMeetingNote204Response{}, nil
}

// Student snapshot and term summaries.

func (h *MentoringHandler) GetMentorStudentSnapshot(ctx context.Context, request api.GetMentorStudentSnapshotRequestObject) (api.GetMentorStudentSnapshotResponseObject, error) {
	snapshot, err := h.service.StudentSnapshot(ctx, tenantID(ctx), request.StudentId)
	if err != nil {
		return nil, mapError(err)
	}
	subjects := make([]struct {
		Score     float32            `json:"score"`
		SubjectId openapi_types.UUID `json:"subject_id"`
	}, len(snapshot.PublishedSubjects))
	for i, s := range snapshot.PublishedSubjects {
		subjects[i].SubjectId = openapi_types.UUID(s.SubjectID)
		subjects[i].Score = float32(s.Score)
	}
	return api.GetMentorStudentSnapshot200JSONResponse{
		StudentUserId: openapi_types.UUID(snapshot.StudentUserID), StudentName: snapshot.StudentName, ClassName: snapshot.ClassName,
		AttendanceByStatus: snapshot.AttendanceByStatus, DisciplinePoints: snapshot.DisciplinePoints,
		DisciplineActiveCount: snapshot.DisciplineActiveCount, PublishedSubjects: subjects,
	}, nil
}

func (h *MentoringHandler) GetMentorTermSummary(ctx context.Context, request api.GetMentorTermSummaryRequestObject) (api.GetMentorTermSummaryResponseObject, error) {
	summary, err := h.service.GetTermSummary(ctx, tenantID(ctx), request.TermId, request.StudentId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetMentorTermSummary200JSONResponse(toAPISummary(summary)), nil
}

func (h *MentoringHandler) WriteMentorTermSummary(ctx context.Context, request api.WriteMentorTermSummaryRequestObject) (api.WriteMentorTermSummaryResponseObject, error) {
	summary, err := h.service.WriteTermSummary(ctx, tenantID(ctx), userID(ctx), service.TermSummaryInput{
		TermID: request.TermId, GroupID: request.GroupId, StudentUserID: request.StudentId, Summary: request.Body.Summary,
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.WriteMentorTermSummary200JSONResponse(toAPISummary(summary)), nil
}

func strOr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
