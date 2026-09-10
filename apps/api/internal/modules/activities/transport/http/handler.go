// Package http adapts the generated strict-server interface to the
// activities service.
package http

import (
	"context"
	"errors"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

type ActivitiesHandler struct{ service *service.Service }

func New(svc *service.Service) *ActivitiesHandler { return &ActivitiesHandler{service: svc} }

func tenantID(ctx context.Context) uuid.UUID { id, _ := httpx.TenantIDFromContext(ctx); return id }
func userID(ctx context.Context) uuid.UUID   { id, _ := httpx.UserIDFromContext(ctx); return id }

var errorMap = map[error]*httpx.Error{
	domain.ErrClubNotFound:         httpx.ErrClubNotFound,
	domain.ErrClubNameExists:       httpx.ErrClubNameExists,
	domain.ErrClubInactive:         httpx.ErrClubInactive,
	domain.ErrClubFull:             httpx.ErrClubFull,
	domain.ErrClubLimitReached:     httpx.ErrClubLimitReached,
	domain.ErrMembershipNotFound:   httpx.ErrMembershipNotFound,
	domain.ErrMembershipNotActive:  httpx.ErrMembershipInactive,
	domain.ErrAlreadyMember:        httpx.ErrAlreadyMember,
	domain.ErrMeetingNotFound:      httpx.ErrMeetingNotFound,
	domain.ErrMeetingExists:        httpx.ErrMeetingExists,
	domain.ErrNotAMember:           httpx.ErrNotAMember,
	domain.ErrActivityNotFound:     httpx.ErrActivityNotFound,
	domain.ErrAchievementNotFound:  httpx.ErrAchievementNotFound,
	domain.ErrInvalidParticipant:   httpx.ErrInvalidParticipant,
	domain.ErrInvalidInput:         httpx.ErrValidation,
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

func nullUUID(p *openapi_types.UUID) uuid.NullUUID {
	if p == nil {
		return uuid.NullUUID{}
	}
	return uuid.NullUUID{UUID: *p, Valid: true}
}

func uuidPtr(n uuid.NullUUID) *openapi_types.UUID {
	if !n.Valid {
		return nil
	}
	id := openapi_types.UUID(n.UUID)
	return &id
}

func strOr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func boolOr(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}
