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
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// PermissionChecker resolves the caller's effective permissions, so a club
// route open to both the activities reader (view_activities) and a coach
// (record_extracurricular_attendance) can tell them apart.
type PermissionChecker interface {
	EffectivePermissions(ctx context.Context, tenantID, userID uuid.UUID) (authz.Set, error)
}

type ActivitiesHandler struct {
	service *service.Service
	perms   PermissionChecker
}

// New wires the handler. perms may be nil, which limits every caller to the
// clubs they coach: the safe side for routes the spec opens to
// record_extracurricular_attendance.
func New(svc *service.Service, perms PermissionChecker) *ActivitiesHandler {
	return &ActivitiesHandler{service: svc, perms: perms}
}

// viewer resolves how far the caller reaches: every club with
// view_activities or manage_extracurriculars (held by the user and, for an
// API key, granted to the key too), otherwise only the clubs they coach.
func (h *ActivitiesHandler) viewer(ctx context.Context) (domain.Viewer, error) {
	v := domain.Viewer{UserID: userID(ctx)}
	if h.perms == nil {
		return v, nil
	}
	set, err := h.perms.EffectivePermissions(ctx, tenantID(ctx), v.UserID)
	if err != nil {
		return domain.Viewer{}, err
	}
	key := authz.IdentityFromContext(ctx).KeyPermissions
	has := func(code string) bool { return set.Has(code) && (key == nil || key.Has(code)) }
	v.AllClubs = has(authz.PermViewActivities) || has(authz.PermManageExtracurriculars)
	return v, nil
}

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
	domain.ErrParticipantExists:    httpx.ErrParticipantExists,
	domain.ErrNotClubCoach:         httpx.ErrNotClubCoach,
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
