package http

import (
	"context"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

func (h *AcademicHandler) ListGradeLevels(ctx context.Context, _ api.ListGradeLevelsRequestObject) (api.ListGradeLevelsResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	levels, err := h.service.ListGradeLevels(ctx, tenantID)
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.GradeLevel, len(levels))
	for i, l := range levels {
		data[i] = toAPIGradeLevel(l)
	}
	return api.ListGradeLevels200JSONResponse{Data: data}, nil
}

func (h *AcademicHandler) CreateGradeLevel(ctx context.Context, request api.CreateGradeLevelRequestObject) (api.CreateGradeLevelResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	level, err := h.service.CreateGradeLevel(ctx, tenantID, request.Body.Code, request.Body.Name, int16(request.Body.Sequence)) //nolint:gosec // bounded by schema minimum
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CreateGradeLevel201JSONResponse(toAPIGradeLevel(level)), nil
}

func (h *AcademicHandler) UpdateGradeLevel(ctx context.Context, request api.UpdateGradeLevelRequestObject) (api.UpdateGradeLevelResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	level, err := h.service.UpdateGradeLevel(ctx, tenantID, request.GradeLevelId, request.Body.Code, request.Body.Name, int16(request.Body.Sequence)) //nolint:gosec // bounded by schema minimum
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.UpdateGradeLevel200JSONResponse(toAPIGradeLevel(level)), nil
}

func (h *AcademicHandler) DeleteGradeLevel(ctx context.Context, request api.DeleteGradeLevelRequestObject) (api.DeleteGradeLevelResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.DeleteGradeLevel(ctx, tenantID, request.GradeLevelId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.DeleteGradeLevel204Response{}, nil
}

func (h *AcademicHandler) ApplyGradeLevelTemplate(ctx context.Context, request api.ApplyGradeLevelTemplateRequestObject) (api.ApplyGradeLevelTemplateResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	levels, err := h.service.ApplyGradeLevelTemplate(ctx, tenantID, string(request.Body.Template))
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.GradeLevel, len(levels))
	for i, l := range levels {
		data[i] = toAPIGradeLevel(l)
	}
	return api.ApplyGradeLevelTemplate200JSONResponse{Data: data}, nil
}

func (h *AcademicHandler) ListTracks(ctx context.Context, _ api.ListTracksRequestObject) (api.ListTracksResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	tracks, err := h.service.ListTracks(ctx, tenantID)
	if err != nil {
		return nil, mapDomainError(err)
	}
	data := make([]api.Track, len(tracks))
	for i, t := range tracks {
		data[i] = api.Track{Id: t.ID, Code: t.Code, Name: t.Name}
	}
	return api.ListTracks200JSONResponse{Data: data}, nil
}

func (h *AcademicHandler) CreateTrack(ctx context.Context, request api.CreateTrackRequestObject) (api.CreateTrackResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	track, err := h.service.CreateTrack(ctx, tenantID, request.Body.Code, request.Body.Name)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.CreateTrack201JSONResponse{Id: track.ID, Code: track.Code, Name: track.Name}, nil
}

func (h *AcademicHandler) UpdateTrack(ctx context.Context, request api.UpdateTrackRequestObject) (api.UpdateTrackResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	track, err := h.service.UpdateTrack(ctx, tenantID, request.TrackId, request.Body.Code, request.Body.Name)
	if err != nil {
		return nil, mapDomainError(err)
	}
	return api.UpdateTrack200JSONResponse{Id: track.ID, Code: track.Code, Name: track.Name}, nil
}

func (h *AcademicHandler) DeleteTrack(ctx context.Context, request api.DeleteTrackRequestObject) (api.DeleteTrackResponseObject, error) {
	tenantID := tenantIDFromContext(ctx)
	if err := h.service.DeleteTrack(ctx, tenantID, request.TrackId); err != nil {
		return nil, mapDomainError(err)
	}
	return api.DeleteTrack204Response{}, nil
}

func toAPIGradeLevel(l domain.GradeLevel) api.GradeLevel {
	return api.GradeLevel{Id: l.ID, Code: l.Code, Name: l.Name, Sequence: int(l.Sequence)}
}
