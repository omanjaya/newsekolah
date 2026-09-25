// operator_alerts.go implements the platform console's operator alerting
// settings: a single, platform-wide row (migration 0121) the host monitor
// script (infra/scripts/monitor.sh) reads through the internal
// GET /internal/monitor-config endpoint (cmd/api/monitor_config.go), and a
// platform superadmin configures from the console instead of editing files
// on the server. Unlike every other method in this package, these methods
// never call s.guard(): the deployment being monitored exists whether the
// install itself is single-tenant or multi-tenant, so operator alerting
// must work in both (docs/12-roadmap.md's tenancy guard is about the
// cross-tenant tenant-management console, not this).
package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
)

// errSealerNotConfigured is returned when an operator alert Telegram token
// write/read is attempted before wiring passed a crypto.Sealer into
// platform.Dependencies -- a configuration mistake, not a caller-facing
// condition, so it is not a domain error (mirrors
// notifications/service/whatsapp.go's sentinel of the same name in that
// module's own package).
var errSealerNotConfigured = errors.New("operator alerts crypto sealer not configured")

// EncryptedOperatorAlertSettingsRow is the shape operator alert settings
// travel through the Repository boundary in: the sealed Telegram bot token
// ciphertext plus the key id it was sealed with, never the plaintext
// token. The service is the only layer that holds the crypto.Sealer, so
// encryption and decryption happen here, not in the repository -- the same
// split notifications' WhatsApp provider config uses
// (notifications/service/whatsapp.go).
type EncryptedOperatorAlertSettingsRow struct {
	Enabled bool

	TelegramBotTokenEncrypted []byte
	TelegramBotTokenKeyID     string
	TelegramChatID            string

	CheckHealth      bool
	CheckContainers  bool
	CheckDisk        bool
	CheckMemory      bool
	CheckBackup      bool
	CheckCertificate bool
	CheckErrors5xx   bool

	DiskThresholdPercent int
	MemoryThresholdMB    int
	BackupMaxAgeHours    int
	CertExpiryDays       int

	DailySummaryEnabled bool
	DailySummaryHour    int

	UpdatedAt time.Time
	UpdatedBy uuid.NullUUID
}

func (row EncryptedOperatorAlertSettingsRow) toDomain() domain.OperatorAlertSettings {
	return domain.OperatorAlertSettings{
		Enabled: row.Enabled, TelegramChatID: row.TelegramChatID,
		CheckHealth: row.CheckHealth, CheckContainers: row.CheckContainers, CheckDisk: row.CheckDisk,
		CheckMemory: row.CheckMemory, CheckBackup: row.CheckBackup, CheckCertificate: row.CheckCertificate,
		CheckErrors5xx:       row.CheckErrors5xx,
		DiskThresholdPercent: row.DiskThresholdPercent, MemoryThresholdMB: row.MemoryThresholdMB,
		BackupMaxAgeHours: row.BackupMaxAgeHours, CertExpiryDays: row.CertExpiryDays,
		DailySummaryEnabled: row.DailySummaryEnabled, DailySummaryHour: row.DailySummaryHour,
		UpdatedAt: row.UpdatedAt, UpdatedBy: row.UpdatedBy,
	}
}

// testMessageText is the fixed message SendTestOperatorAlert sends; it
// carries no secret and identifies itself so an admin staring at their
// Telegram app knows exactly which system sent it.
const testMessageText = "Pesan uji dari konsol platform newsekolah. Jika Anda menerima pesan ini, notifikasi operator berhasil dikonfigurasi."

// GetOperatorAlertSettings returns the current settings for the console:
// everything except the token, plus whether one is stored and a masked
// hint of it.
func (s *Service) GetOperatorAlertSettings(ctx context.Context) (domain.OperatorAlertSettingsView, error) {
	var view domain.OperatorAlertSettingsView
	err := s.withPlatformTx(ctx, func(ctx context.Context) error {
		row, err := s.repo.GetOperatorAlertSettings(ctx)
		if err != nil {
			return err
		}
		view = s.toOperatorAlertView(row)
		return nil
	})
	return view, err
}

func (s *Service) toOperatorAlertView(row EncryptedOperatorAlertSettingsRow) domain.OperatorAlertSettingsView {
	view := domain.OperatorAlertSettingsView{OperatorAlertSettings: row.toDomain()}
	if len(row.TelegramBotTokenEncrypted) == 0 {
		return view
	}
	view.TelegramTokenSet = true
	if s.alertsSealer == nil {
		return view
	}
	plain, err := s.alertsSealer.Open(row.TelegramBotTokenEncrypted)
	if err != nil || len(plain) == 0 {
		return view
	}
	view.TelegramTokenHint = maskToken(string(plain))
	return view
}

// maskToken returns a masked hint of a stored secret: a fixed run of
// bullets followed by at most the last 4 characters, never enough on its
// own to reconstruct the token.
func maskToken(token string) string {
	const visible = 4
	if len(token) <= visible {
		return "••••"
	}
	return "••••" + token[len(token)-visible:]
}

// UpdateOperatorAlertSettings applies a partial update and records an
// audit_logs entry describing the change, never the token (auditSnapshot
// below only ever carries TelegramTokenSet, never the token or its hint).
//
//nolint:gocyclo // one flat optional-field patch: each nil check is independent and reads best inline
func (s *Service) UpdateOperatorAlertSettings(ctx context.Context, actorUserID uuid.UUID, patch domain.OperatorAlertSettingsPatch) (domain.OperatorAlertSettingsView, error) {
	if err := patch.Validate(); err != nil {
		return domain.OperatorAlertSettingsView{}, err
	}

	var view domain.OperatorAlertSettingsView
	err := s.withPlatformTx(ctx, func(ctx context.Context) error {
		existing, err := s.repo.GetOperatorAlertSettings(ctx)
		if err != nil {
			return err
		}
		before := s.toOperatorAlertView(existing)

		updated := existing
		if patch.Enabled != nil {
			updated.Enabled = *patch.Enabled
		}
		switch {
		case patch.ClearTelegramToken:
			updated.TelegramBotTokenEncrypted = nil
			updated.TelegramBotTokenKeyID = ""
		case patch.TelegramToken != nil:
			if s.alertsSealer == nil {
				return fmt.Errorf("operator alerts: %w", errSealerNotConfigured)
			}
			sealed, err := s.alertsSealer.Seal([]byte(*patch.TelegramToken))
			if err != nil {
				return fmt.Errorf("seal operator alert telegram token: %w", err)
			}
			updated.TelegramBotTokenEncrypted, updated.TelegramBotTokenKeyID = sealed, s.alertsSealer.KeyID
		}
		if patch.TelegramChatID != nil {
			updated.TelegramChatID = *patch.TelegramChatID
		}
		if patch.CheckHealth != nil {
			updated.CheckHealth = *patch.CheckHealth
		}
		if patch.CheckContainers != nil {
			updated.CheckContainers = *patch.CheckContainers
		}
		if patch.CheckDisk != nil {
			updated.CheckDisk = *patch.CheckDisk
		}
		if patch.CheckMemory != nil {
			updated.CheckMemory = *patch.CheckMemory
		}
		if patch.CheckBackup != nil {
			updated.CheckBackup = *patch.CheckBackup
		}
		if patch.CheckCertificate != nil {
			updated.CheckCertificate = *patch.CheckCertificate
		}
		if patch.CheckErrors5xx != nil {
			updated.CheckErrors5xx = *patch.CheckErrors5xx
		}
		if patch.DiskThresholdPercent != nil {
			updated.DiskThresholdPercent = *patch.DiskThresholdPercent
		}
		if patch.MemoryThresholdMB != nil {
			updated.MemoryThresholdMB = *patch.MemoryThresholdMB
		}
		if patch.BackupMaxAgeHours != nil {
			updated.BackupMaxAgeHours = *patch.BackupMaxAgeHours
		}
		if patch.CertExpiryDays != nil {
			updated.CertExpiryDays = *patch.CertExpiryDays
		}
		if patch.DailySummaryEnabled != nil {
			updated.DailySummaryEnabled = *patch.DailySummaryEnabled
		}
		if patch.DailySummaryHour != nil {
			updated.DailySummaryHour = *patch.DailySummaryHour
		}
		if actorUserID != uuid.Nil {
			updated.UpdatedBy = uuid.NullUUID{UUID: actorUserID, Valid: true}
		}

		saved, err := s.repo.UpdateOperatorAlertSettings(ctx, updated)
		if err != nil {
			return err
		}
		view = s.toOperatorAlertView(saved)

		return audit.RecordPlatform(ctx, "operator_alerts.update", "operator_alert_settings",
			auditSnapshot(before), auditSnapshot(view))
	})
	return view, err
}

// operatorAlertAuditSnapshot is what an audit_logs before/after payload for
// an operator alerts change carries: every non-secret field, plus whether
// a token is stored, but never the token itself or even its masked hint.
type operatorAlertAuditSnapshot struct {
	Enabled              bool `json:"enabled"`
	TelegramTokenSet     bool `json:"telegram_token_set"`
	TelegramChatIDSet    bool `json:"telegram_chat_id_set"`
	CheckHealth          bool `json:"check_health"`
	CheckContainers      bool `json:"check_containers"`
	CheckDisk            bool `json:"check_disk"`
	CheckMemory          bool `json:"check_memory"`
	CheckBackup          bool `json:"check_backup"`
	CheckCertificate     bool `json:"check_certificate"`
	CheckErrors5xx       bool `json:"check_errors_5xx"`
	DiskThresholdPercent int  `json:"disk_threshold_percent"`
	MemoryThresholdMB    int  `json:"memory_threshold_mb"`
	BackupMaxAgeHours    int  `json:"backup_max_age_hours"`
	CertExpiryDays       int  `json:"cert_expiry_days"`
	DailySummaryEnabled  bool `json:"daily_summary_enabled"`
	DailySummaryHour     int  `json:"daily_summary_hour"`
}

func auditSnapshot(view domain.OperatorAlertSettingsView) operatorAlertAuditSnapshot {
	return operatorAlertAuditSnapshot{
		Enabled: view.Enabled, TelegramTokenSet: view.TelegramTokenSet, TelegramChatIDSet: view.TelegramChatID != "",
		CheckHealth: view.CheckHealth, CheckContainers: view.CheckContainers, CheckDisk: view.CheckDisk,
		CheckMemory: view.CheckMemory, CheckBackup: view.CheckBackup, CheckCertificate: view.CheckCertificate,
		CheckErrors5xx:       view.CheckErrors5xx,
		DiskThresholdPercent: view.DiskThresholdPercent, MemoryThresholdMB: view.MemoryThresholdMB,
		BackupMaxAgeHours: view.BackupMaxAgeHours, CertExpiryDays: view.CertExpiryDays,
		DailySummaryEnabled: view.DailySummaryEnabled, DailySummaryHour: view.DailySummaryHour,
	}
}

// DetectOperatorAlertChats calls Telegram's getUpdates with the stored bot
// token, or tokenOverride when non-empty (so the console can preview
// candidate chats for a token the admin just typed but has not saved yet),
// and returns the distinct chats seen in recent updates.
func (s *Service) DetectOperatorAlertChats(ctx context.Context, tokenOverride string) ([]domain.TelegramChatCandidate, error) {
	token, err := s.resolveTelegramToken(ctx, tokenOverride)
	if err != nil {
		return nil, err
	}
	return telegramGetUpdates(ctx, token)
}

// resolveTelegramToken returns override when set, otherwise the stored
// token decrypted, or domain.ErrTelegramTokenMissing when neither exists.
func (s *Service) resolveTelegramToken(ctx context.Context, override string) (string, error) {
	if override != "" {
		return override, nil
	}
	var token string
	err := s.withPlatformTx(ctx, func(ctx context.Context) error {
		row, err := s.repo.GetOperatorAlertSettings(ctx)
		if err != nil {
			return err
		}
		if len(row.TelegramBotTokenEncrypted) == 0 {
			return domain.ErrTelegramTokenMissing
		}
		if s.alertsSealer == nil {
			return fmt.Errorf("operator alerts: %w", errSealerNotConfigured)
		}
		plain, err := s.alertsSealer.Open(row.TelegramBotTokenEncrypted)
		if err != nil {
			return fmt.Errorf("decrypt operator alert telegram token: %w", err)
		}
		token = string(plain)
		return nil
	})
	return token, err
}

// SendTestOperatorAlert sends testMessageText to the configured chat using
// the stored token, returning domain.ErrTelegramAPI (wrapping Telegram's
// own description, safe to display) when Telegram rejects the request.
func (s *Service) SendTestOperatorAlert(ctx context.Context) error {
	var token, chatID string
	err := s.withPlatformTx(ctx, func(ctx context.Context) error {
		row, err := s.repo.GetOperatorAlertSettings(ctx)
		if err != nil {
			return err
		}
		if len(row.TelegramBotTokenEncrypted) == 0 {
			return domain.ErrTelegramTokenMissing
		}
		if row.TelegramChatID == "" {
			return domain.ErrTelegramChatMissing
		}
		if s.alertsSealer == nil {
			return fmt.Errorf("operator alerts: %w", errSealerNotConfigured)
		}
		plain, err := s.alertsSealer.Open(row.TelegramBotTokenEncrypted)
		if err != nil {
			return fmt.Errorf("decrypt operator alert telegram token: %w", err)
		}
		token, chatID = string(plain), row.TelegramChatID
		return nil
	})
	if err != nil {
		return err
	}
	return telegramSendMessage(ctx, token, chatID, testMessageText)
}

// OperatorAlertConfigForMonitor returns the fully decrypted configuration
// for the internal monitor endpoint (cmd/api/monitor_config.go) -- the one
// caller allowed to see the plaintext bot token.
func (s *Service) OperatorAlertConfigForMonitor(ctx context.Context) (domain.OperatorAlertConfig, error) {
	var cfg domain.OperatorAlertConfig
	err := s.withPlatformTx(ctx, func(ctx context.Context) error {
		row, err := s.repo.GetOperatorAlertSettings(ctx)
		if err != nil {
			return err
		}
		cfg = domain.OperatorAlertConfig{OperatorAlertSettings: row.toDomain()}
		if len(row.TelegramBotTokenEncrypted) == 0 || s.alertsSealer == nil {
			return nil
		}
		plain, err := s.alertsSealer.Open(row.TelegramBotTokenEncrypted)
		if err != nil {
			return fmt.Errorf("decrypt operator alert telegram token: %w", err)
		}
		cfg.TelegramBotToken = string(plain)
		return nil
	})
	return cfg, err
}
