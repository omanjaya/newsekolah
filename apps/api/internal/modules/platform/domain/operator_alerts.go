package domain

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	// ErrTelegramTokenMissing is returned by DetectTelegramChats and
	// SendTestOperatorAlert when no bot token is stored and none was
	// submitted alongside the call.
	ErrTelegramTokenMissing = errors.New("telegram bot token is not configured")
	// ErrTelegramChatMissing is returned by SendTestOperatorAlert when no
	// chat id is stored.
	ErrTelegramChatMissing = errors.New("telegram chat id is not configured")
	// ErrTelegramRequest wraps a failure to reach api.telegram.org at all
	// (network/timeout); never carries the token.
	ErrTelegramRequest = errors.New("could not reach telegram")
	// ErrTelegramAPI wraps a well-formed Telegram error response (bad
	// token, chat not found, bot blocked, ...); its message is the
	// Telegram-provided description, safe to show the caller verbatim.
	ErrTelegramAPI = errors.New("telegram rejected the request")
)

// OperatorAlertSettings is the platform-wide operator alerting
// configuration (migration 0121): what the host monitor script
// (infra/scripts/monitor.sh) checks and where it sends Telegram messages.
// The bot token never travels through this type in plaintext -- see
// OperatorAlertSettingsView (masked, for the console) and
// OperatorAlertConfig (decrypted, for the internal monitor endpoint only).
type OperatorAlertSettings struct {
	Enabled bool

	TelegramChatID string

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

// OperatorAlertSettingsPatch is a partial update: every field a caller did
// not set stays unchanged. TelegramToken/ClearTelegramToken follow the same
// write-only convention as notifications' WhatsApp provider config
// (service/whatsapp.go): a non-nil TelegramToken seals and stores a new
// token, ClearTelegramToken=true removes the stored one, and leaving both
// unset keeps whatever is already stored. Setting both is rejected by
// Validate.
type OperatorAlertSettingsPatch struct {
	Enabled *bool

	TelegramToken      *string
	ClearTelegramToken bool
	TelegramChatID     *string

	CheckHealth      *bool
	CheckContainers  *bool
	CheckDisk        *bool
	CheckMemory      *bool
	CheckBackup      *bool
	CheckCertificate *bool
	CheckErrors5xx   *bool

	DiskThresholdPercent *int
	MemoryThresholdMB    *int
	BackupMaxAgeHours    *int
	CertExpiryDays       *int

	DailySummaryEnabled *bool
	DailySummaryHour    *int
}

// Validate enforces the same bounds as operator_alert_settings' check
// constraints, so a bad request fails with a translated message instead of
// a raw constraint-violation error.
func (p OperatorAlertSettingsPatch) Validate() error {
	if p.TelegramToken != nil && p.ClearTelegramToken {
		return ErrInvalidInput
	}
	if p.DiskThresholdPercent != nil && (*p.DiskThresholdPercent < 1 || *p.DiskThresholdPercent > 100) {
		return ErrInvalidInput
	}
	if p.MemoryThresholdMB != nil && *p.MemoryThresholdMB <= 0 {
		return ErrInvalidInput
	}
	if p.BackupMaxAgeHours != nil && *p.BackupMaxAgeHours <= 0 {
		return ErrInvalidInput
	}
	if p.CertExpiryDays != nil && *p.CertExpiryDays <= 0 {
		return ErrInvalidInput
	}
	if p.DailySummaryHour != nil && (*p.DailySummaryHour < 0 || *p.DailySummaryHour > 23) {
		return ErrInvalidInput
	}
	return nil
}

// OperatorAlertSettingsView is what GET/PUT return to the console: every
// field of OperatorAlertSettings plus a masked hint of the stored token,
// never the token itself.
type OperatorAlertSettingsView struct {
	OperatorAlertSettings
	TelegramTokenSet  bool
	TelegramTokenHint string
}

// OperatorAlertConfig is the fully decrypted configuration handed to the
// internal monitor endpoint (GET /internal/monitor-config) only -- the one
// caller allowed to see the plaintext bot token.
type OperatorAlertConfig struct {
	OperatorAlertSettings
	TelegramBotToken string
}

// TelegramChatCandidate is one chat DetectTelegramChats found in the bot's
// recent updates, for the console to list so an admin can pick one.
type TelegramChatCandidate struct {
	ID    int64
	Type  string
	Title string
}
