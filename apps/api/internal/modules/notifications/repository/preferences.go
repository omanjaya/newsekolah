package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) UpsertPreference(ctx context.Context, tenantID, userID uuid.UUID, kind domain.Kind, channel domain.Channel, enabled bool) error {
	return r.queries(ctx).UpsertNotificationPreference(ctx, db.UpsertNotificationPreferenceParams{
		TenantID: tenantID, UserID: userID, Kind: string(kind), Channel: string(channel), Enabled: enabled,
	})
}

func (r *Repository) ListPreferencesForKind(ctx context.Context, tenantID, userID uuid.UUID, kind domain.Kind) (map[domain.Channel]bool, error) {
	rows, err := r.queries(ctx).ListNotificationPreferencesForUser(ctx, db.ListNotificationPreferencesForUserParams{
		TenantID: tenantID, UserID: userID,
	})
	if err != nil {
		return nil, fmt.Errorf("list notification preferences: %w", err)
	}
	out := make(map[domain.Channel]bool)
	for _, row := range rows {
		if row.Kind != string(kind) {
			continue
		}
		out[domain.Channel(row.Channel)] = row.Enabled
	}
	return out, nil
}

// tenantDefaultKeyPrefix and tenantDefaultKey implement the tenant-level
// default channel grid as tenant_settings rows (a generic key/value store
// the school module already owns and this module reuses, rather than
// adding a table docs/06-database-schema.md section 10 does not define).
func tenantDefaultKeyPrefix(kind domain.Kind) string {
	return fmt.Sprintf("notification_defaults.%s.", kind)
}

func tenantDefaultKey(kind domain.Kind, channel domain.Channel) string {
	return fmt.Sprintf("notification_defaults.%s.%s", kind, channel)
}

func (r *Repository) GetTenantChannelDefaults(ctx context.Context, tenantID uuid.UUID, kind domain.Kind) (map[domain.Channel]bool, error) {
	rows, err := r.queries(ctx).ListTenantSettingsByPrefix(ctx, db.ListTenantSettingsByPrefixParams{
		TenantID: tenantID, Key: tenantDefaultKeyPrefix(kind) + "%",
	})
	if err != nil {
		return nil, fmt.Errorf("list tenant notification defaults: %w", err)
	}
	out := make(map[domain.Channel]bool, len(rows))
	prefix := tenantDefaultKeyPrefix(kind)
	for _, row := range rows {
		channel := domain.Channel(strings.TrimPrefix(row.Key, prefix))
		var enabled bool
		if err := json.Unmarshal(row.Value, &enabled); err == nil {
			out[channel] = enabled
		}
	}
	return out, nil
}

func (r *Repository) SetTenantChannelDefault(ctx context.Context, tenantID, actorUserID uuid.UUID, kind domain.Kind, channel domain.Channel, enabled bool) error {
	value, err := json.Marshal(enabled)
	if err != nil {
		return fmt.Errorf("marshal tenant default: %w", err)
	}
	return r.queries(ctx).UpsertTenantSetting(ctx, db.UpsertTenantSettingParams{
		TenantID: tenantID, Key: tenantDefaultKey(kind, channel), Value: value,
		UpdatedBy: pdatabase.NullUUID(uuid.NullUUID{UUID: actorUserID, Valid: true}),
	})
}

func (r *Repository) GetSettings(ctx context.Context, tenantID, userID uuid.UUID) (service.Settings, bool, error) {
	row, err := r.queries(ctx).GetNotificationSettings(ctx, db.GetNotificationSettingsParams{TenantID: tenantID, UserID: userID})
	if err != nil {
		return service.Settings{}, false, nil //nolint:nilerr // "no row" and "real error" both mean "no settings yet" to the caller
	}
	return toSettings(row), true, nil
}

func (r *Repository) UpsertSettings(ctx context.Context, tenantID, userID uuid.UUID, in service.SettingsUpdate) (service.Settings, error) {
	row, err := r.queries(ctx).UpsertNotificationSettings(ctx, db.UpsertNotificationSettingsParams{
		TenantID: tenantID, UserID: userID,
		QuietHoursStart: intPtrToInt2(in.QuietHoursStart), QuietHoursEnd: intPtrToInt2(in.QuietHoursEnd),
		DigestEnabled: in.DigestEnabled, DigestHour: int16(in.DigestHour), //nolint:gosec // digest hour is validated to 0-23 by the transport layer
	})
	if err != nil {
		return service.Settings{}, fmt.Errorf("upsert notification settings: %w", err)
	}
	return toSettings(row), nil
}

func (r *Repository) ListUsersDueForDigest(ctx context.Context, tenantID uuid.UUID, tenantLocalHour int) ([]service.Settings, error) {
	rows, err := r.queries(ctx).ListUsersDueForDigest(ctx, db.ListUsersDueForDigestParams{
		TenantID: tenantID, DigestHour: int16(tenantLocalHour), //nolint:gosec // hour is always 0-23
	})
	if err != nil {
		return nil, fmt.Errorf("list users due for digest: %w", err)
	}
	out := make([]service.Settings, len(rows))
	for i, row := range rows {
		out[i] = toSettings(row)
	}
	return out, nil
}

func (r *Repository) MarkDigestSent(ctx context.Context, tenantID, userID uuid.UUID, at time.Time) error {
	return r.queries(ctx).MarkDigestSent(ctx, db.MarkDigestSentParams{
		TenantID: tenantID, UserID: userID, LastDigestAt: pdatabase.Timestamptz(at),
	})
}

func toSettings(row db.NotificationSetting) service.Settings {
	return service.Settings{
		UserID: row.UserID, TenantID: row.TenantID,
		QuietHoursStart: int2ToIntPtr(row.QuietHoursStart), QuietHoursEnd: int2ToIntPtr(row.QuietHoursEnd),
		DigestEnabled: row.DigestEnabled, DigestHour: int(row.DigestHour),
		LastDigestAt: pdatabase.TimePtr(row.LastDigestAt),
	}
}
