// monitor_config.go mounts GET /internal/monitor-config: the one endpoint
// infra/scripts/monitor.sh (a host cron job on the VPS, outside Docker)
// reads its operator-alert configuration from, including the decrypted
// Telegram bot token -- the platform console (platform/transport/http)
// never returns that token to anyone.
//
// This route is deliberately outside openapi/openapi.yaml: it is not part
// of the platform_superadmin console API, has no user session, and is
// authenticated by a single shared secret instead
// (config.Config.MonitorAPIToken, compared in constant time against the
// request's X-Monitor-Token header). It is also outside /v1, and the
// system Caddy on a shared VPS only proxies /v1, /health and /ws to the
// API (infra/README.md "Shared system Caddy (VPS)") -- so on that
// deployment shape this endpoint is reachable only through the API
// container's own loopback-published port (compose.vps.yml:
// 127.0.0.1:8081:8080), never the public internet. The shared secret is a
// second, independent layer on top of that network boundary, and the one
// thing standing between the internet and this endpoint on any deployment
// that publishes the API port more broadly.
//
// MONITOR_API_TOKEN empty (the default) disables the endpoint outright
// with a 404, matching the rest of this codebase's "unconfigured means
// off, not open" stance (e.g. permits/attendance/discipline all degrade
// the same way when S3 is not configured) -- a deployment that never runs
// the host monitor script carries no extra attack surface for it.
package main

import (
	"crypto/subtle"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/platform/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// monitorConfigResponse is the JSON body GET /internal/monitor-config
// returns: every operator alert setting, plus the decrypted Telegram bot
// token. Field names match the platform console's own PlatformOperatorAlertSettings
// schema (openapi/modules/platform.yaml) wherever a field exists on both,
// so infra/scripts/monitor.sh and the console agree on vocabulary, with
// telegram_bot_token added and telegram_token_set/telegram_token_hint
// dropped (the monitor script needs the token itself, not a hint of it).
type monitorConfigResponse struct {
	Enabled bool `json:"enabled"`

	TelegramBotToken string `json:"telegram_bot_token"`
	TelegramChatID   string `json:"telegram_chat_id"`

	CheckHealth      bool `json:"check_health"`
	CheckContainers  bool `json:"check_containers"`
	CheckDisk        bool `json:"check_disk"`
	CheckMemory      bool `json:"check_memory"`
	CheckBackup      bool `json:"check_backup"`
	CheckCertificate bool `json:"check_certificate"`
	CheckErrors5xx   bool `json:"check_errors_5xx"`

	DiskThresholdPercent int `json:"disk_threshold_percent"`
	MemoryThresholdMB    int `json:"memory_threshold_mb"`
	BackupMaxAgeHours    int `json:"backup_max_age_hours"`
	CertExpiryDays       int `json:"cert_expiry_days"`

	DailySummaryEnabled bool `json:"daily_summary_enabled"`
	DailySummaryHour    int  `json:"daily_summary_hour"`
}

func toMonitorConfigResponse(cfg domain.OperatorAlertConfig) monitorConfigResponse {
	return monitorConfigResponse{
		Enabled: cfg.Enabled,

		TelegramBotToken: cfg.TelegramBotToken,
		TelegramChatID:   cfg.TelegramChatID,

		CheckHealth: cfg.CheckHealth, CheckContainers: cfg.CheckContainers, CheckDisk: cfg.CheckDisk,
		CheckMemory: cfg.CheckMemory, CheckBackup: cfg.CheckBackup, CheckCertificate: cfg.CheckCertificate,
		CheckErrors5xx: cfg.CheckErrors5xx,

		DiskThresholdPercent: cfg.DiskThresholdPercent, MemoryThresholdMB: cfg.MemoryThresholdMB,
		BackupMaxAgeHours: cfg.BackupMaxAgeHours, CertExpiryDays: cfg.CertExpiryDays,

		DailySummaryEnabled: cfg.DailySummaryEnabled, DailySummaryHour: cfg.DailySummaryHour,
	}
}

// mountMonitorConfigRoute wires GET /internal/monitor-config onto router
// when token is non-empty; it registers nothing at all when token is
// empty, so the route 404s (chi's default for an unmatched path) rather
// than existing in a permanently-locked-out state.
func mountMonitorConfigRoute(router chi.Router, svc *service.Service, token string) {
	if token == "" {
		return
	}
	router.Get("/internal/monitor-config", monitorConfigHandler(svc, token))
}

func monitorConfigHandler(svc *service.Service, token string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		supplied := r.Header.Get("X-Monitor-Token")
		if supplied == "" || subtle.ConstantTimeCompare([]byte(supplied), []byte(token)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		cfg, err := svc.OperatorAlertConfigForMonitor(r.Context())
		if err != nil {
			http.Error(w, "could not load operator alert configuration", http.StatusInternalServerError)
			return
		}

		httpx.WriteJSON(w, http.StatusOK, toMonitorConfigResponse(cfg))
	}
}
