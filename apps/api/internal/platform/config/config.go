// Package config parses process environment into a validated Config, failing
// fast when a required variable is missing. No other package reads os.Getenv;
// everything downstream receives values through struct fields.
package config

import (
	"fmt"
	"net/url"
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

	// AppDBPassword is the login password for the least-privilege app_rw
	// database role (apps/api/migrations/0004_db_roles.up.sql). Only
	// cmd/migrate reads this, to rotate app_rw off its migration-time
	// default password via ALTER ROLE on every run; api and worker connect
	// using DatabaseURL, which in production is already built from this
	// same value (see infra/docker/docker-compose.prod.yml). Optional:
	// empty on a managed Postgres where app_rw is provisioned out of band.
	AppDBPassword string

	JWTSigningKey   string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration

	// DocumentSigningKey is a dedicated HMAC secret for issued_documents
	// verification codes (docs/08-security.md): a compromise of one key
	// must not unlock the other, so this is never JWTSigningKey.
	DocumentSigningKey string
	// DataEncryptionKey seals fields that must stay unreadable to database
	// operators (counseling notes). Falls back to DocumentSigningKey so a
	// single-school deployment needs no extra secret.
	DataEncryptionKey string

	TrustedProxies []string
	BodyLimitBytes int64

	S3Endpoint  string
	S3Bucket    string
	S3AccessKey string
	S3SecretKey string
	S3UseSSL    bool
	// S3PublicEndpoint, when set, is the absolute URL (scheme + host, e.g.
	// "https://sion.nouma.id") that presigned URLs handed to browsers are
	// signed against instead of S3Endpoint. Needed whenever S3Endpoint is
	// not itself reachable from the browser -- e.g. a Docker-internal host
	// such as "minio:9000" behind a shared system Caddy that never
	// publishes MinIO's port (infra/README.md "Shared system Caddy
	// (VPS)"). Server-side object operations always keep using S3Endpoint.
	// Optional: empty keeps today's single-endpoint behaviour exactly.
	S3PublicEndpoint string
	// S3Region avoids an implicit GetBucketLocation call when presigning
	// (platform/storage.DefaultRegion documents why). Optional: defaults
	// to "us-east-1", also MinIO's own default bucket region.
	S3Region string

	SMTPURL string

	WhatsAppProvider string
	WhatsAppToken    string
	WhatsAppPhoneID  string
	// WhatsAppAppSecret verifies the X-Hub-Signature-256 header on the
	// inbound WhatsApp status webhook. WhatsAppWebhookVerifyToken answers
	// Meta's GET verification handshake when first registering the webhook
	// URL. Both are optional: a deployment that never sets them cannot use
	// the webhook, but per-tenant WhatsApp sending still works.
	WhatsAppAppSecret          string
	WhatsAppWebhookVerifyToken string

	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string

	APNSKeyP8      string
	APNSKeyID      string
	APNSTeamID     string
	APNSTopic      string
	APNSProduction bool

	FCMProjectID          string
	FCMServiceAccountJSON string

	// WorkerInline runs every River worker inside cmd/api instead of
	// requiring a separate cmd/worker process, per docs/10-mobile-strategy.md
	// and the notifications module's brief: a single small school should not
	// need to operate two processes. Defaults to true; a deployment running
	// cmd/worker separately should set it false in cmd/api's environment to
	// avoid double-registering the same job kinds.
	WorkerInline bool

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
//
//nolint:gocyclo // flat list of env lookups, intentionally linear
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

		AppDBPassword: lookup("APP_DB_PASSWORD"),

		JWTSigningKey:      req("JWT_SIGNING_KEY"),
		DocumentSigningKey: req("DOCUMENT_SIGNING_KEY"),
		DataEncryptionKey:  lookup("DATA_ENCRYPTION_KEY"),

		S3Endpoint:       lookup("S3_ENDPOINT"),
		S3Bucket:         lookup("S3_BUCKET"),
		S3AccessKey:      lookup("S3_ACCESS_KEY"),
		S3SecretKey:      lookup("S3_SECRET_KEY"),
		S3UseSSL:         lookup("S3_USE_SSL") == "true",
		S3PublicEndpoint: lookup("S3_PUBLIC_ENDPOINT"),
		S3Region:         orDefault(lookup("S3_REGION"), "us-east-1"),

		SMTPURL: lookup("SMTP_URL"),

		WhatsAppProvider:           orDefault(lookup("WHATSAPP_PROVIDER"), "noop"),
		WhatsAppToken:              lookup("WHATSAPP_TOKEN"),
		WhatsAppPhoneID:            lookup("WHATSAPP_PHONE_ID"),
		WhatsAppAppSecret:          lookup("WHATSAPP_APP_SECRET"),
		WhatsAppWebhookVerifyToken: lookup("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),

		VAPIDPublicKey:  lookup("VAPID_PUBLIC_KEY"),
		VAPIDPrivateKey: lookup("VAPID_PRIVATE_KEY"),
		VAPIDSubject:    orDefault(lookup("VAPID_SUBJECT"), "mailto:admin@newsekolah.invalid"),

		APNSKeyP8:  lookup("APNS_KEY_P8"),
		APNSKeyID:  lookup("APNS_KEY_ID"),
		APNSTeamID: lookup("APNS_TEAM_ID"),
		APNSTopic:  lookup("APNS_TOPIC"),

		FCMProjectID:          lookup("FCM_PROJECT_ID"),
		FCMServiceAccountJSON: lookup("FCM_SERVICE_ACCOUNT_JSON"),

		OTelExporterEndpoint: lookup("OTEL_EXPORTER_OTLP_ENDPOINT"),

		SeedPassword: orDefault(lookup("SEED_PASSWORD"), "Password123!"),
	}

	if c.TenancyMode != TenancySingle && c.TenancyMode != TenancyMulti {
		errs = append(errs, "TENANCY_MODE (must be single or multi)")
	}

	if c.DocumentSigningKey != "" && len(c.DocumentSigningKey) < 32 {
		errs = append(errs, "DOCUMENT_SIGNING_KEY (must be at least 32 characters)")
	}

	if c.S3PublicEndpoint != "" {
		if u, err := url.Parse(c.S3PublicEndpoint); err != nil || u.Scheme == "" || u.Host == "" {
			errs = append(errs, "S3_PUBLIC_ENDPOINT (must be an absolute URL, e.g. https://sekolah-anda.sch.id)")
		}
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

	apnsProduction := orDefault(lookup("APNS_PRODUCTION"), "false")
	if b, err := strconv.ParseBool(apnsProduction); err == nil {
		c.APNSProduction = b
	} else {
		errs = append(errs, "APNS_PRODUCTION (must be true or false)")
	}

	workerInline := orDefault(lookup("WORKER_INLINE"), "true")
	if b, err := strconv.ParseBool(workerInline); err == nil {
		c.WorkerInline = b
	} else {
		errs = append(errs, "WORKER_INLINE (must be true or false)")
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
		// #nosec G304 G703 -- operator-controlled secrets-file path from *_FILE env vars, not user input
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

// EncryptionSecret is the key material for field-level encryption.
func (c Config) EncryptionSecret() string {
	if c.DataEncryptionKey != "" {
		return c.DataEncryptionKey
	}
	return c.DocumentSigningKey
}
