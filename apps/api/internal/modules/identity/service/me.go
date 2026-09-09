package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

type DutyView struct {
	Slug       string
	ScopeKind  string
	ScopeID    uuid.NullUUID
	ScopeLabel string
}

type AcademicYearView struct {
	ID    uuid.UUID
	Label string
}

type SessionView struct {
	ID         uuid.UUID
	Client     string
	DeviceName string
	IP         string
	UserAgent  string
	CreatedAt  time.Time
	LastSeenAt time.Time
}

// MeResult is identity's view of "who is this user"; it deliberately
// excludes tenant branding, which belongs to the school module. The
// transport layer for GET /v1/me composes the two.
type MeResult struct {
	UserID             uuid.UUID
	Username           string
	Email              string
	Name               string
	AvatarURL          string
	Roles              []domain.Role
	Permissions        []string
	Duties             []DutyView
	ActiveAcademicYear *AcademicYearView
	MustChangePassword bool
}

func (s *Service) Me(ctx context.Context, tenantID, userID uuid.UUID) (MeResult, error) {
	var result MeResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		user, err := s.repo.GetUserByID(ctx, tenantID, userID)
		if err != nil {
			return domain.ErrUserNotFound
		}
		result, err = s.me(ctx, user)
		return err
	})
	return result, err
}

func (s *Service) me(ctx context.Context, user domain.User) (MeResult, error) {
	principal, err := s.loadPrincipal(ctx, user.TenantID, user.ID)
	if err != nil {
		return MeResult{}, err
	}

	roles, err := s.repo.ListRolesForUser(ctx, user.TenantID, user.ID)
	if err != nil {
		return MeResult{}, err
	}

	duties := make([]DutyView, 0, len(principal.Duties))
	for _, d := range principal.Duties {
		duties = append(duties, DutyView{
			Slug:      d.Slug,
			ScopeKind: string(d.ScopeKind),
			ScopeID:   pickScopeID(d),
		})
	}

	result := MeResult{
		UserID:             user.ID,
		Username:           user.Username,
		Email:              user.Email,
		Name:               user.Name,
		AvatarURL:          user.AvatarURL,
		Roles:              roles,
		Permissions:        principal.Effective().Slice(),
		Duties:             duties,
		MustChangePassword: user.MustChangePassword,
	}

	if yearID, ok, err := s.years.GetActiveAcademicYearID(ctx, user.TenantID); err == nil && ok {
		label, _ := s.years.ActiveAcademicYearLabel(ctx, user.TenantID, yearID)
		result.ActiveAcademicYear = &AcademicYearView{ID: yearID, Label: label}
	}

	return result, nil
}

func pickScopeID(d authz.Duty) uuid.NullUUID {
	switch d.ScopeKind {
	case authz.ScopeClass:
		return d.ScopeClassID
	case authz.ScopeStudent:
		return d.ScopeStudentID
	default:
		return uuid.NullUUID{}
	}
}
