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

// ClassRef names a class without pulling in the academic module's types.
type ClassRef struct {
	ID   uuid.UUID
	Name string
}

// StudentClassRepository resolves the classes /v1/me names: a student's own
// active class, and the class each class-scoped duty (a homeroom) covers.
type StudentClassRepository interface {
	ActiveClassForStudent(ctx context.Context, tenantID, studentID, yearID uuid.UUID) (ClassRef, bool, error)
	// ClassNames maps each live class among ids to its name; unknown or
	// deleted classes are left out.
	ClassNames(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) (map[uuid.UUID]string, error)
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
	Locale             string
	ProfileKind        domain.ProfileKind
	Detail             UserProfileFields
	Roles              []domain.Role
	Permissions        []string
	Duties             []DutyView
	ActiveAcademicYear *AcademicYearView
	// CurrentClass is the student's active enrollment in the active
	// academic year; nil for non-students and unenrolled students.
	CurrentClass       *ClassRef
	MustChangePassword bool
	ImpersonatedBy     *ImpersonatorView
}

// ImpersonatorView identifies the real admin behind an impersonation
// session, for the UI banner docs/08-security.md section 2 requires
// ("ditandai di UI").
type ImpersonatorView struct {
	UserID uuid.UUID
	Name   string
}

// Me builds the current-user view. actorID is the real admin's ID when the
// caller's session is an impersonation session (from the access token's
// `act` claim), or an invalid uuid.NullUUID otherwise; the transport layer
// is what reads the claim (service must not depend on platform/httpx), so
// it is passed in rather than read from ctx here.
func (s *Service) Me(ctx context.Context, tenantID, userID uuid.UUID, actorID uuid.NullUUID) (MeResult, error) {
	var result MeResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		user, err := s.repo.GetUserByID(ctx, tenantID, userID)
		if err != nil {
			return domain.ErrUserNotFound
		}
		result, err = s.me(ctx, user)
		if err != nil {
			return err
		}
		if actorID.Valid {
			actor, err := s.repo.GetUserByID(ctx, tenantID, actorID.UUID)
			if err != nil {
				return domain.ErrUserNotFound
			}
			result.ImpersonatedBy = &ImpersonatorView{UserID: actor.ID, Name: actor.Name}
		}
		return nil
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

	duties, err := s.dutyViews(ctx, user.TenantID, principal.Duties)
	if err != nil {
		return MeResult{}, err
	}

	result := MeResult{
		UserID:             user.ID,
		Username:           user.Username,
		Email:              user.Email,
		Name:               user.Name,
		AvatarURL:          user.AvatarURL,
		Locale:             user.Locale,
		Roles:              roles,
		Permissions:        principal.Effective().Slice(),
		Duties:             duties,
		MustChangePassword: user.MustChangePassword,
	}

	if yearID, ok, err := s.years.GetActiveAcademicYearID(ctx, user.TenantID); err == nil && ok {
		label, _ := s.years.ActiveAcademicYearLabel(ctx, user.TenantID, yearID)
		result.ActiveAcademicYear = &AcademicYearView{ID: yearID, Label: label}
	}

	if row, err := s.repo.GetUserAdminByID(ctx, user.TenantID, user.ID); err == nil && row.ProfileKind.Valid() {
		result.ProfileKind = row.ProfileKind
		if detail, found, err := s.loadProfileFields(ctx, user.TenantID, user.ID, row.ProfileKind); err == nil && found {
			result.Detail = detail
		}
	}

	if result.ProfileKind == domain.ProfileStudent && result.ActiveAcademicYear != nil {
		class, found, err := s.repo.ActiveClassForStudent(ctx, user.TenantID, user.ID, result.ActiveAcademicYear.ID)
		if err != nil {
			return MeResult{}, err
		}
		if found {
			result.CurrentClass = &class
		}
	}

	return result, nil
}

// dutyViews turns the principal's duties into Me's view, naming the class
// of every class-scoped duty (a homeroom teacher's "X-A") in one lookup so
// clients can say "Wali kelas X-A" without fetching the class themselves.
func (s *Service) dutyViews(ctx context.Context, tenantID uuid.UUID, duties []authz.Duty) ([]DutyView, error) {
	views := make([]DutyView, 0, len(duties))
	var classIDs []uuid.UUID
	for _, d := range duties {
		view := DutyView{Slug: d.Slug, ScopeKind: string(d.ScopeKind), ScopeID: pickScopeID(d)}
		if d.ScopeKind == authz.ScopeClass && view.ScopeID.Valid {
			classIDs = append(classIDs, view.ScopeID.UUID)
		}
		views = append(views, view)
	}
	if len(classIDs) == 0 {
		return views, nil
	}
	names, err := s.repo.ClassNames(ctx, tenantID, classIDs)
	if err != nil {
		return nil, err
	}
	for i := range views {
		if views[i].ScopeKind == string(authz.ScopeClass) && views[i].ScopeID.Valid {
			views[i].ScopeLabel = names[views[i].ScopeID.UUID]
		}
	}
	return views, nil
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
