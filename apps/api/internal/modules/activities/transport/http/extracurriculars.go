package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/service"
)

func toInput(b api.ExtracurricularWrite) service.ExtracurricularInput {
	in := service.ExtracurricularInput{
		Name: b.Name, Description: strOr(b.Description), CoachUserID: nullUUID(b.CoachUserId),
		Capacity: b.Capacity, MeetingStart: b.MeetingStart, MeetingEnd: b.MeetingEnd,
		Location: strOr(b.Location), IsActive: boolOr(b.IsActive, true),
	}
	if b.MeetingDay != nil && *b.MeetingDay >= 0 && *b.MeetingDay <= 6 {
		d := int16(*b.MeetingDay) //nolint:gosec // bounds-checked above
		in.MeetingDay = &d
	}
	return in
}

func (h *ActivitiesHandler) ListExtracurriculars(ctx context.Context, request api.ListExtracurricularsRequestObject) (api.ListExtracurricularsResponseObject, error) {
	includeInactive := request.Params.IncludeInactive != nil && *request.Params.IncludeInactive
	clubs, err := h.service.ListExtracurriculars(ctx, tenantID(ctx), includeInactive)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.Extracurricular, len(clubs))
	for i, c := range clubs {
		data[i] = toAPIClub(c)
	}
	return api.ListExtracurriculars200JSONResponse{Data: data}, nil
}

func (h *ActivitiesHandler) CreateExtracurricular(ctx context.Context, request api.CreateExtracurricularRequestObject) (api.CreateExtracurricularResponseObject, error) {
	club, err := h.service.CreateExtracurricular(ctx, tenantID(ctx), toInput(*request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateExtracurricular201JSONResponse(toAPIClub(club)), nil
}

func (h *ActivitiesHandler) GetExtracurricular(ctx context.Context, request api.GetExtracurricularRequestObject) (api.GetExtracurricularResponseObject, error) {
	club, err := h.service.GetExtracurricular(ctx, tenantID(ctx), request.ClubId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetExtracurricular200JSONResponse(toAPIClub(club)), nil
}

func (h *ActivitiesHandler) UpdateExtracurricular(ctx context.Context, request api.UpdateExtracurricularRequestObject) (api.UpdateExtracurricularResponseObject, error) {
	club, err := h.service.UpdateExtracurricular(ctx, tenantID(ctx), request.ClubId, toInput(*request.Body))
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateExtracurricular200JSONResponse(toAPIClub(club)), nil
}

func (h *ActivitiesHandler) DeleteExtracurricular(ctx context.Context, request api.DeleteExtracurricularRequestObject) (api.DeleteExtracurricularResponseObject, error) {
	if err := h.service.DeleteExtracurricular(ctx, tenantID(ctx), request.ClubId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteExtracurricular204Response{}, nil
}

func (h *ActivitiesHandler) GetMembershipPolicy(ctx context.Context, _ api.GetMembershipPolicyRequestObject) (api.GetMembershipPolicyResponseObject, error) {
	policy, err := h.service.MembershipPolicy(ctx, tenantID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetMembershipPolicy200JSONResponse{Version: policy.Version, MaxClubsPerStudent: policy.MaxClubsPerStudent}, nil
}

func (h *ActivitiesHandler) UpdateMembershipPolicy(ctx context.Context, request api.UpdateMembershipPolicyRequestObject) (api.UpdateMembershipPolicyResponseObject, error) {
	policy, err := h.service.UpdateMembershipPolicy(ctx, tenantID(ctx), userID(ctx), request.Body.MaxClubsPerStudent)
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateMembershipPolicy200JSONResponse{Version: policy.Version, MaxClubsPerStudent: policy.MaxClubsPerStudent}, nil
}

func (h *ActivitiesHandler) ListClubMembers(ctx context.Context, request api.ListClubMembersRequestObject) (api.ListClubMembersResponseObject, error) {
	includeLeft := request.Params.IncludeLeft != nil && *request.Params.IncludeLeft
	members, err := h.service.ListMembers(ctx, tenantID(ctx), request.ClubId, includeLeft)
	if err != nil {
		return nil, mapError(err)
	}
	return api.ListClubMembers200JSONResponse{Data: toAPIMemberships(members)}, nil
}

func (h *ActivitiesHandler) JoinClub(ctx context.Context, request api.JoinClubRequestObject) (api.JoinClubResponseObject, error) {
	b := request.Body
	membership, err := h.service.JoinClub(ctx, tenantID(ctx), request.ClubId, b.StudentUserId, b.JoinedOn.Time)
	if err != nil {
		return nil, mapError(err)
	}
	return api.JoinClub201JSONResponse(toAPIMembership(membership)), nil
}

func (h *ActivitiesHandler) LeaveClub(ctx context.Context, request api.LeaveClubRequestObject) (api.LeaveClubResponseObject, error) {
	membership, err := h.service.LeaveClub(ctx, tenantID(ctx), request.MembershipId, request.Body.LeftOn.Time)
	if err != nil {
		return nil, mapError(err)
	}
	return api.LeaveClub200JSONResponse(toAPIMembership(membership)), nil
}

func (h *ActivitiesHandler) ListMyClubs(ctx context.Context, _ api.ListMyClubsRequestObject) (api.ListMyClubsResponseObject, error) {
	memberships, err := h.service.ListMyClubs(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.StudentMembership, len(memberships))
	for i, m := range memberships {
		data[i] = toAPIStudentMembership(m)
	}
	return api.ListMyClubs200JSONResponse{Data: data}, nil
}

func (h *ActivitiesHandler) GetClubMembershipReport(ctx context.Context, request api.GetClubMembershipReportRequestObject) (api.GetClubMembershipReportResponseObject, error) {
	members, err := h.service.MembershipReport(ctx, tenantID(ctx), request.ClubId, request.Params.From.Time, request.Params.To.Time)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetClubMembershipReport200JSONResponse{Data: toAPIMemberships(members)}, nil
}

func (h *ActivitiesHandler) GetClubAttendanceReport(ctx context.Context, request api.GetClubAttendanceReportRequestObject) (api.GetClubAttendanceReportResponseObject, error) {
	entries, err := h.service.AttendanceReport(ctx, tenantID(ctx), request.ClubId)
	if err != nil {
		return nil, mapError(err)
	}
	return api.GetClubAttendanceReport200JSONResponse{Data: toAPIAttendanceList(entries)}, nil
}
