package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/announcements/domain"
)

// resolveAudience turns the stored targeting into concrete user ids at
// publish time. Roles and classes are resolved against current membership,
// so a class announcement reaches whoever is enrolled today.
func (s *Service) resolveAudience(ctx context.Context, tenantID uuid.UUID, a domain.Audience) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	var err error
	switch a.Type {
	case domain.AudienceAll:
		ids, err = s.repo.ActiveUserIDs(ctx, tenantID)
	case domain.AudienceRoles:
		ids, err = s.repo.UserIDsByRoleSlugs(ctx, tenantID, a.RoleSlugs)
	case domain.AudienceClasses:
		ids, err = s.repo.StudentIDsByClasses(ctx, tenantID, a.ClassIDs)
	case domain.AudienceUsers:
		ids, err = s.repo.ExistingUserIDs(ctx, tenantID, a.UserIDs)
	default:
		return nil, domain.ErrInvalidAudience
	}
	if err != nil {
		return nil, err
	}
	return dedupe(ids), nil
}

// filterVisible keeps the announcements whose audience includes userID.
// Role and class membership are fetched once, lazily, only when an
// announcement actually targets them.
func (s *Service) filterVisible(ctx context.Context, tenantID, userID uuid.UUID, items []domain.Announcement) ([]domain.Announcement, error) {
	reader := &readerMembership{svc: s, tenantID: tenantID, userID: userID}
	out := make([]domain.Announcement, 0, len(items))
	for _, a := range items {
		ok, err := reader.matches(ctx, a.Audience)
		if err != nil {
			return nil, err
		}
		if ok {
			out = append(out, a)
		}
	}
	return out, nil
}

// readerMembership memoises one reader's roles and classes across the
// announcements being filtered.
type readerMembership struct {
	svc      *Service
	tenantID uuid.UUID
	userID   uuid.UUID
	roles    map[string]bool
	classes  map[uuid.UUID]bool
}

func (m *readerMembership) matches(ctx context.Context, a domain.Audience) (bool, error) {
	switch a.Type {
	case domain.AudienceAll:
		return true, nil
	case domain.AudienceRoles:
		return m.hasAnyRole(ctx, a.RoleSlugs)
	case domain.AudienceClasses:
		return m.inAnyClass(ctx, a.ClassIDs)
	case domain.AudienceUsers:
		for _, id := range a.UserIDs {
			if id == m.userID {
				return true, nil
			}
		}
		return false, nil
	default:
		return false, nil
	}
}

func (m *readerMembership) hasAnyRole(ctx context.Context, slugs []string) (bool, error) {
	if m.roles == nil {
		have, err := m.svc.repo.RoleSlugsForUser(ctx, m.tenantID, m.userID)
		if err != nil {
			return false, err
		}
		m.roles = make(map[string]bool, len(have))
		for _, slug := range have {
			m.roles[slug] = true
		}
	}
	for _, slug := range slugs {
		if m.roles[slug] {
			return true, nil
		}
	}
	return false, nil
}

func (m *readerMembership) inAnyClass(ctx context.Context, ids []uuid.UUID) (bool, error) {
	if m.classes == nil {
		have, err := m.svc.repo.ActiveClassIDsForStudent(ctx, m.tenantID, m.userID)
		if err != nil {
			return false, err
		}
		m.classes = make(map[uuid.UUID]bool, len(have))
		for _, id := range have {
			m.classes[id] = true
		}
	}
	for _, id := range ids {
		if m.classes[id] {
			return true, nil
		}
	}
	return false, nil
}

func dedupe(ids []uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{}, len(ids))
	out := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}
