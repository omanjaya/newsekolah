package repository

import (
	"context"
	"fmt"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func toOperatorAlertRow(row db.OperatorAlertSetting) service.EncryptedOperatorAlertSettingsRow {
	return service.EncryptedOperatorAlertSettingsRow{
		Enabled: row.Enabled,

		TelegramBotTokenEncrypted: row.TelegramBotTokenEncrypted,
		TelegramBotTokenKeyID:     row.TelegramBotTokenKeyID,
		TelegramChatID:            row.TelegramChatID,

		CheckHealth:      row.CheckHealth,
		CheckContainers:  row.CheckContainers,
		CheckDisk:        row.CheckDisk,
		CheckMemory:      row.CheckMemory,
		CheckBackup:      row.CheckBackup,
		CheckCertificate: row.CheckCertificate,
		CheckErrors5xx:   row.CheckErrors5xx,

		DiskThresholdPercent: int(row.DiskThresholdPercent),
		MemoryThresholdMB:    int(row.MemoryThresholdMb),
		BackupMaxAgeHours:    int(row.BackupMaxAgeHours),
		CertExpiryDays:       int(row.CertExpiryDays),

		DailySummaryEnabled: row.DailySummaryEnabled,
		DailySummaryHour:    int(row.DailySummaryHour),

		UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
		UpdatedBy: pdatabase.UUIDOrNil(row.UpdatedBy),
	}
}

func (r *Repository) GetOperatorAlertSettings(ctx context.Context) (service.EncryptedOperatorAlertSettingsRow, error) {
	row, err := r.queries(ctx).PlatformGetOperatorAlertSettings(ctx)
	if err != nil {
		return service.EncryptedOperatorAlertSettingsRow{}, fmt.Errorf("get operator alert settings: %w", err)
	}
	return toOperatorAlertRow(row), nil
}

func (r *Repository) UpdateOperatorAlertSettings(ctx context.Context, in service.EncryptedOperatorAlertSettingsRow) (service.EncryptedOperatorAlertSettingsRow, error) {
	row, err := r.queries(ctx).PlatformUpdateOperatorAlertSettings(ctx, db.PlatformUpdateOperatorAlertSettingsParams{
		Enabled: in.Enabled,

		TelegramBotTokenEncrypted: in.TelegramBotTokenEncrypted,
		TelegramBotTokenKeyID:     in.TelegramBotTokenKeyID,
		TelegramChatID:            in.TelegramChatID,

		CheckHealth:      in.CheckHealth,
		CheckContainers:  in.CheckContainers,
		CheckDisk:        in.CheckDisk,
		CheckMemory:      in.CheckMemory,
		CheckBackup:      in.CheckBackup,
		CheckCertificate: in.CheckCertificate,
		CheckErrors5xx:   in.CheckErrors5xx,

		DiskThresholdPercent: int16(in.DiskThresholdPercent),
		MemoryThresholdMb:    int32(in.MemoryThresholdMB),
		BackupMaxAgeHours:    int32(in.BackupMaxAgeHours),
		CertExpiryDays:       int32(in.CertExpiryDays),

		DailySummaryEnabled: in.DailySummaryEnabled,
		DailySummaryHour:    int16(in.DailySummaryHour),

		UpdatedBy: pdatabase.NullUUID(in.UpdatedBy),
	})
	if err != nil {
		return service.EncryptedOperatorAlertSettingsRow{}, fmt.Errorf("update operator alert settings: %w", err)
	}
	return toOperatorAlertRow(row), nil
}
