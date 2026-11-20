package http

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
)

func (h *ActivitiesHandler) ListAchievements(ctx context.Context, request api.ListAchievementsRequestObject) (api.ListAchievementsResponseObject, error) {
	studentID, classID := nullUUID(request.Params.StudentId), nullUUID(request.Params.ClassId)
	list, err := h.service.ListAchievements(ctx, tenantID(ctx), studentID, classID)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.Achievement, len(list))
	for i, a := range list {
		data[i] = toAPIAchievement(a)
	}
	return api.ListAchievements200JSONResponse{Data: data}, nil
}

// ListStudentAchievements is one student's achievements in every academic
// year, for the student profile; view_activities already reads them all.
func (h *ActivitiesHandler) ListStudentAchievements(ctx context.Context, request api.ListStudentAchievementsRequestObject) (api.ListStudentAchievementsResponseObject, error) {
	list, err := h.service.ListStudentAchievements(ctx, tenantID(ctx), request.StudentId)
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.Achievement, len(list))
	for i, a := range list {
		data[i] = toAPIAchievement(a)
	}
	return api.ListStudentAchievements200JSONResponse{Data: data}, nil
}

func (h *ActivitiesHandler) CreateAchievement(ctx context.Context, request api.CreateAchievementRequestObject) (api.CreateAchievementResponseObject, error) {
	b := request.Body
	achievement, err := h.service.CreateAchievement(ctx, tenantID(ctx), domain.Achievement{
		StudentUserID: b.StudentUserId, CompetitionName: b.CompetitionName, Level: domain.AchievementLevel(b.Level),
		Placing: b.Placement, AchievedOn: b.AchievedOn.Time, Notes: strOr(b.Notes), CreatedBy: uuid.NullUUID{UUID: userID(ctx), Valid: true},
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.CreateAchievement201JSONResponse(toAPIAchievement(achievement)), nil
}

func (h *ActivitiesHandler) UpdateAchievement(ctx context.Context, request api.UpdateAchievementRequestObject) (api.UpdateAchievementResponseObject, error) {
	b := request.Body
	achievement, err := h.service.UpdateAchievement(ctx, tenantID(ctx), request.AchievementId, domain.Achievement{
		CompetitionName: b.CompetitionName, Level: domain.AchievementLevel(b.Level), Placing: b.Placement,
		AchievedOn: b.AchievedOn.Time, Notes: strOr(b.Notes),
	})
	if err != nil {
		return nil, mapError(err)
	}
	return api.UpdateAchievement200JSONResponse(toAPIAchievement(achievement)), nil
}

func (h *ActivitiesHandler) DeleteAchievement(ctx context.Context, request api.DeleteAchievementRequestObject) (api.DeleteAchievementResponseObject, error) {
	if err := h.service.DeleteAchievement(ctx, tenantID(ctx), request.AchievementId); err != nil {
		return nil, mapError(err)
	}
	return api.DeleteAchievement204Response{}, nil
}

// ListMyAchievements is the signed-in student's own achievements this year.
func (h *ActivitiesHandler) ListMyAchievements(ctx context.Context, _ api.ListMyAchievementsRequestObject) (api.ListMyAchievementsResponseObject, error) {
	list, err := h.service.ListMyAchievements(ctx, tenantID(ctx), userID(ctx))
	if err != nil {
		return nil, mapError(err)
	}
	data := make([]api.Achievement, len(list))
	for i, a := range list {
		data[i] = toAPIAchievement(a)
	}
	return api.ListMyAchievements200JSONResponse{Data: data}, nil
}
