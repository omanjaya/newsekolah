// Package config parses process environment into a validated Config, failing
// fast when a required variable is missing. No other package reads os.Getenv;
// everything downstream receives values through struct fields.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type TenancyMode string

const (
	TenancySingle TenancyMode = "single"
	TenancyMulti  TenancyMode = "multi"
)

type Config struct {
	AppEnv      string
	TenancyMode TenancyMode
	APIAddr     string
	AppOrigins  []string
	AppTimezone string
	BaseDomain  string

	DatabaseURL string
	RedisURL    string

	JWTSigningKey   string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration

	TrustedProxies []string
	BodyLimitBytes int64

	S3Endpoint  string
	S3Bucket    string
	S3AccessKey string
	S3SecretKey string

	SMTPURL string

	WhatsAppProvider string
	WhatsAppToken    string
	WhatsAppPhoneID  string

	OTelExporterEndpoint string

	SeedPassword string
}

// IsProduction reports whether the process is running with production
// safeguards enabled (origin allowlist required, seeders refuse to run).
func (c Config) IsProduction() bool {
	return c.AppEnv == "production"
}

// Load reads and validates configuration from the process environment,
// resolving `<VAR>_FILE` indirection for secrets (Docker/Kubernetes secrets
// mounted as files) before falling back to `<VAR>`.
func Load() (Config, error) {
	var errs []string
	req := func(name string) string {
		v := lookup(name)
		if v == "" {
			errs = append(errs, name)
		}
		return v
	}

	c := Config{
		AppEnv:      orDefault(lookup("APP_ENV"), "development"),
		TenancyMode: TenancyMode(orDefault(lookup("TENANCY_MODE"), string(TenancySingle))),
		APIAddr:     orDefault(lookup("API_ADDR"), ":8080"),
		AppTimezone: orDefault(lookup("APP_TIMEZONE"), "Asia/Makassar"),
		BaseDomain:  lookup("BASE_DOMAIN"),

		DatabaseURL: req("DATABASE_URL"),
		RedisURL:    lookup("REDIS_URL"),

		JWTSigningKey: req("JWT_SIGNING_KEY"),

		S3Endpoint:  lookup("S3_ENDPOINT"),
		S3Bucket:    lookup("S3_BUCKET"),
		S3AccessKey: lookup("S3_ACCESS_KEY"),
		S3SecretKey: lookup("S3_SECRET_KEY"),

		SMTPURL: lookup("SMTP_URL"),

		WhatsAppProvider: orDefault(lookup("WHATSAPP_PROVIDER"), "noop"),
		WhatsAppToken:    lookup("WHATSAPP_TOKEN"),
		WhatsAppPhoneID:  lookup("WHATSAPP_PHONE_ID"),

		OTelExporterEndpoint: lookup("OTEL_EXPORTER_OTLP_ENDPOINT"),

		SeedPassword: orDefault(lookup("SEED_PASSWORD"), "Password123!"),
	}

	if c.TenancyMode != TenancySingle && c.TenancyMode != TenancyMulti {
		errs = append(errs, "TENANCY_MODE (must be single or multi)")
	}

	origins := lookup("APP_ORIGINS")
	if origins != "" {
		c.AppOrigins = splitAndTrim(origins)
	}
	if c.IsProduction() && len(c.AppOrigins) == 0 {
		errs = append(errs, "APP_ORIGINS (required when APP_ENV=production)")
	}

	c.TrustedProxies = splitAndTrim(lookup("TRUSTED_PROXIES"))

	bodyLimit := orDefault(lookup("BODY_LIMIT_BYTES"), "1048576")
	if n, err := strconv.ParseInt(bodyLimit, 10, 64); err == nil {
		c.BodyLimitBytes = n
	} else {
		errs = append(errs, "BODY_LIMIT_BYTES (must be an integer)")
	}

	accessTTL := orDefault(lookup("ACCESS_TOKEN_TTL"), "15m")
	if d, err := time.ParseDuration(accessTTL); err == nil {
		c.AccessTokenTTL = d
	} else {
		errs = append(errs, "ACCESS_TOKEN_TTL (must be a Go duration, e.g. 15m)")
	}

	refreshTTL := orDefault(lookup("REFRESH_TOKEN_TTL"), "720h")
	if d, err := time.ParseDuration(refreshTTL); err == nil {
		c.RefreshTokenTTL = d
	} else {
		errs = append(errs, "REFRESH_TOKEN_TTL (must be a Go duration, e.g. 720h)")
	}

	if c.WhatsAppProvider != "noop" {
		if c.WhatsAppToken == "" {
			errs = append(errs, "WHATSAPP_TOKEN (required when WHATSAPP_PROVIDER != noop)")
		}
		if c.WhatsAppPhoneID == "" {
			errs = append(errs, "WHATSAPP_PHONE_ID (required when WHATSAPP_PROVIDER != noop)")
		}
	}

	if len(errs) > 0 {
		return Config{}, fmt.Errorf("config: missing or invalid: %s", strings.Join(errs, ", "))
	}
	return c, nil
}

// lookup resolves `<name>_FILE` first (reading the referenced file's trimmed
// contents), then falls back to the plain `<name>` env var.
func lookup(name string) string {
	if path := os.Getenv(name + "_FILE"); path != "" {
		data, err := os.ReadFile(path) //nolint:gosec // operator-controlled secrets-file path from *_FILE env vars, not user input
		if err == nil {
			return strings.TrimSpace(string(data))
		}
	}
	return os.Getenv(name)
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func splitAndTrim(v string) []string {
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
