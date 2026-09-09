package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
)

// PreferencesForKinds is a caller-supplied list of kinds to resolve
// preferences for (the inbox only ever needs a handful of kinds at a
// time, e.g. rendering a settings screen grouped by kind).
func (s *Service) PreferencesForKinds(ctx context.Context, tenantID, userID uuid.UUID, kinds []domain.Kind) (map[domain.Kind]map[domain.Channel]bool, error) {
	out := make(map[domain.Kind]map[domain.Channel]bool, len(kinds))
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		for _, kind := range kinds {
			prefs, err := s.repo.ListPreferencesForKind(ctx, tenantID, userID, kind)
			if err != nil {
				return fmt.Errorf("list preferences for kind %s: %w", kind, err)
			}
			out[kind] = prefs
		}
		return nil
	})
	return out, err
}

func (s *Service) SetPreference(ctx context.Context, tenantID, userID uuid.UUID, kind domain.Kind, channel domain.Channel, enabled bool) error {
	if !channel.Valid() {
		return domain.ErrInvalidChannel
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.UpsertPreference(ctx, tenantID, userID, kind, channel, enabled)
	})
}

func (s *Service) GetSettings(ctx context.Context, tenantID, userID uuid.UUID) (Settings, error) {
	var settings Settings
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var ok bool
		var err error
		settings, ok, err = s.repo.GetSettings(ctx, tenantID, userID)
		if err != nil {
			return err
		}
		if !ok {
			settings = Settings{UserID: userID, TenantID: tenantID, DigestHour: 7}
		}
		return nil
	})
	return settings, err
}

func (s *Service) UpdateSettings(ctx context.Context, tenantID, userID uuid.UUID, in SettingsUpdate) (Settings, error) {
	var settings Settings
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		settings, err = s.repo.UpsertSettings(ctx, tenantID, userID, in)
		return err
	})
	return settings, err
}

// TenantChannelDefaults reads the tenant-wide default for every channel of
// one kind (an admin's notification settings screen).
func (s *Service) TenantChannelDefaults(ctx context.Context, tenantID uuid.UUID, kind domain.Kind) (map[domain.Channel]bool, error) {
	var defaults map[domain.Channel]bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		defaults, err = s.repo.GetTenantChannelDefaults(ctx, tenantID, kind)
		return err
	})
	return defaults, err
}

// SetTenantChannelDefault requires authz.PermManageNotificationSettings at
// the transport layer; the service itself does not check permissions.
func (s *Service) SetTenantChannelDefault(ctx context.Context, tenantID, actorUserID uuid.UUID, kind domain.Kind, channel domain.Channel, enabled bool) error {
	if !channel.Valid() {
		return domain.ErrInvalidChannel
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.SetTenantChannelDefault(ctx, tenantID, actorUserID, kind, channel, enabled)
	})
}
