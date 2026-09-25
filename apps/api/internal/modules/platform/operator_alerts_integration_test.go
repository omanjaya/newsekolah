package platform

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/config"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// newTestPlatformModule wires the platform module against appPool -- the
// least-privilege app_rw role, so row level security applies exactly like
// production -- never AdminPool, mirroring
// discipline/discipline_audit_integration_test.go's newTestDisciplineModule.
// Mode is TenancyMulti so a test could exercise the tenant-CRUD guard too,
// though operator alerts' own methods never call it (see
// service/operator_alerts.go's package doc comment).
func newTestPlatformModule(t *testing.T, appPool *pgxpool.Pool) *Module {
	t.Helper()
	sealer, err := crypto.NewSealer("v1", "a-test-secret-of-at-least-32-bytes!")
	require.NoError(t, err)
	return Register(Dependencies{
		Pool: appPool, Clock: clock.Real{}, Mode: config.TenancyMulti, Sealer: sealer,
	})
}

type operatorAlertAuditRow struct {
	Action     string
	EntityType string
	Before     []byte
	After      []byte
}

// operatorAlertAuditLogs loads every audit_logs row this module's platform
// actions wrote: tenant_id is NULL for all of them (audit.RecordPlatform, called from
// service/operator_alerts.go), so platform/identity's own ListAuditLogs
// query (tenant_id = $1, a required equality) cannot find them -- this
// reads audit_logs directly instead, the same way a one-off admin query
// would.
func operatorAlertAuditLogs(t *testing.T, pool *pgxpool.Pool) []operatorAlertAuditRow {
	t.Helper()
	rows, err := pool.Query(context.Background(), `
		select action, entity_type, before, after
		from audit_logs
		where tenant_id is null and entity_type = 'operator_alert_settings'
		order by id desc`)
	require.NoError(t, err)
	defer rows.Close()

	var out []operatorAlertAuditRow
	for rows.Next() {
		var r operatorAlertAuditRow
		require.NoError(t, rows.Scan(&r.Action, &r.EntityType, &r.Before, &r.After))
		out = append(out, r)
	}
	require.NoError(t, rows.Err())
	return out
}

// TestOperatorAlertSettings_SealMaskAndPartialUpdate covers the full
// lifecycle the platform console's operator-alerts page depends on:
// storing a token seals it, GetOperatorAlertSettings never returns the
// plaintext (only telegram_token_set and a masked hint), a partial update
// leaves every field it did not touch alone, and clearing the token
// removes it.
func TestOperatorAlertSettings_SealMaskAndPartialUpdate(t *testing.T) {
	pg := dbtest.Start(t)
	mod := newTestPlatformModule(t, pg.AppPool)
	ctx := context.Background()
	actorID := uuid.New()

	// The migration seeds exactly one row (id = 1): confirm the starting
	// state before mutating it.
	initial, err := mod.Service.GetOperatorAlertSettings(ctx)
	require.NoError(t, err)
	require.False(t, initial.TelegramTokenSet)
	require.Empty(t, initial.TelegramTokenHint)
	require.False(t, initial.Enabled)

	trueVal, chatID, token := true, "-1009876543210", "123456:AAEE_super_secret_bot_token"
	updated, err := mod.Service.UpdateOperatorAlertSettings(ctx, actorID, domain.OperatorAlertSettingsPatch{
		Enabled: &trueVal, TelegramToken: &token, TelegramChatID: &chatID,
	})
	require.NoError(t, err)
	require.True(t, updated.Enabled)
	require.Equal(t, chatID, updated.TelegramChatID)
	require.True(t, updated.TelegramTokenSet, "a stored token must be reported as set")
	require.NotEmpty(t, updated.TelegramTokenHint)
	require.NotContains(t, updated.TelegramTokenHint, "super_secret", "the hint must never contain the full token")
	require.Contains(t, token, updated.TelegramTokenHint[len(updated.TelegramTokenHint)-4:],
		"the hint's visible suffix must be the token's own last characters")

	// Default check toggles/thresholds survive a partial update that never
	// mentions them.
	require.True(t, updated.CheckHealth)
	require.Equal(t, 85, updated.DiskThresholdPercent)

	// Partial update: only the disk threshold changes. Everything else,
	// including the stored token, is untouched.
	newThreshold := 90
	afterThreshold, err := mod.Service.UpdateOperatorAlertSettings(ctx, actorID, domain.OperatorAlertSettingsPatch{
		DiskThresholdPercent: &newThreshold,
	})
	require.NoError(t, err)
	require.Equal(t, 90, afterThreshold.DiskThresholdPercent)
	require.True(t, afterThreshold.Enabled, "a field not in the patch must keep its previous value")
	require.Equal(t, chatID, afterThreshold.TelegramChatID)
	require.True(t, afterThreshold.TelegramTokenSet, "an update that does not mention the token must keep it stored")

	// Clear: the token is removed, everything else stays.
	cleared, err := mod.Service.UpdateOperatorAlertSettings(ctx, actorID, domain.OperatorAlertSettingsPatch{
		ClearTelegramToken: true,
	})
	require.NoError(t, err)
	require.False(t, cleared.TelegramTokenSet)
	require.Empty(t, cleared.TelegramTokenHint)
	require.Equal(t, chatID, cleared.TelegramChatID, "clearing the token must not touch the chat id")
	require.Equal(t, 90, cleared.DiskThresholdPercent)

	// Every one of the three updates above wrote an audit_logs row, none
	// of which may ever carry the token or even its masked hint.
	logs := operatorAlertAuditLogs(t, pg.AdminPool)
	require.Len(t, logs, 3, "three UpdateOperatorAlertSettings calls must write three audit_logs rows")
	for _, l := range logs {
		require.Equal(t, "operator_alerts.update", l.Action)
		require.Equal(t, "operator_alert_settings", l.EntityType)
		require.NotContains(t, string(l.Before), "super_secret")
		require.NotContains(t, string(l.After), "super_secret")
		require.NotContains(t, string(l.Before), "•", "the audit payload must not even carry the masked hint")
		require.NotContains(t, string(l.After), "•")
	}
}

// TestOperatorAlertSettings_TokenAndChatMustBeConfiguredForTelegramActions
// covers the guard rails around the two Telegram-calling actions: neither
// can run without the configuration they depend on, and the resulting
// errors identify exactly what is missing.
func TestOperatorAlertSettings_TokenAndChatMustBeConfiguredForTelegramActions(t *testing.T) {
	pg := dbtest.Start(t)
	mod := newTestPlatformModule(t, pg.AppPool)
	ctx := context.Background()

	_, err := mod.Service.DetectOperatorAlertChats(ctx, "")
	require.ErrorIs(t, err, domain.ErrTelegramTokenMissing)

	err = mod.Service.SendTestOperatorAlert(ctx)
	require.ErrorIs(t, err, domain.ErrTelegramTokenMissing)

	token := "123456:AAEE_another_secret_token"
	_, err = mod.Service.UpdateOperatorAlertSettings(ctx, uuid.Nil, domain.OperatorAlertSettingsPatch{
		TelegramToken: &token,
	})
	require.NoError(t, err)

	// Token is set but no chat id: SendTestOperatorAlert must refuse with
	// the chat-specific error, not the token one.
	err = mod.Service.SendTestOperatorAlert(ctx)
	require.ErrorIs(t, err, domain.ErrTelegramChatMissing)
}
