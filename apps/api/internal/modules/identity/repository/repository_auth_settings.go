package repository

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// authSessionDaysKey and authSingleDeviceKey are tenant_settings rows,
// the same generic key/value store the school and notifications modules
// already use for their own per-tenant settings (see
// notifications/repository/preferences.go's comment on that choice).
const (
	authSessionDaysKey  = "auth.session_days"
	authSingleDeviceKey = "auth.single_device"
)

// GetAuthSettings reads the tenant's session policy, defaulting
// session_days to domain.DefaultSessionDays and single_device to false
// when either row has never been set.
func (r *Repository) GetAuthSettings(ctx context.Context, tenantID uuid.UUID) (domain.AuthSettings, error) {
	out := domain.AuthSettings{SessionDays: domain.DefaultSessionDays, SingleDevice: false}

	if raw, err := r.queries(ctx).GetTenantSettingValue(ctx, db.GetTenantSettingValueParams{TenantID: tenantID, Key: authSessionDaysKey}); err == nil {
		var days int
		if json.Unmarshal(raw, &days) == nil && days > 0 {
			out.SessionDays = days
		}
	}
	if raw, err := r.queries(ctx).GetTenantSettingValue(ctx, db.GetTenantSettingValueParams{TenantID: tenantID, Key: authSingleDeviceKey}); err == nil {
		var single bool
		if json.Unmarshal(raw, &single) == nil {
			out.SingleDevice = single
		}
	}
	return out, nil
}

// SetAuthSettings upserts both rows.
func (r *Repository) SetAuthSettings(ctx context.Context, tenantID, actorID uuid.UUID, in domain.AuthSettings) error {
	updatedBy := pdatabase.NullUUID(uuid.NullUUID{UUID: actorID, Valid: actorID != uuid.Nil})

	daysValue, err := json.Marshal(in.SessionDays)
	if err != nil {
		return err
	}
	if err := r.queries(ctx).UpsertTenantSetting(ctx, db.UpsertTenantSettingParams{
		TenantID: tenantID, Key: authSessionDaysKey, Value: daysValue, UpdatedBy: updatedBy,
	}); err != nil {
		return err
	}

	singleValue, err := json.Marshal(in.SingleDevice)
	if err != nil {
		return err
	}
	return r.queries(ctx).UpsertTenantSetting(ctx, db.UpsertTenantSettingParams{
		TenantID: tenantID, Key: authSingleDeviceKey, Value: singleValue, UpdatedBy: updatedBy,
	})
}
