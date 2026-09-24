package config

import (
	"os"
	"path/filepath"
	"testing"
)

// clearEnv resets every variable Load reads, so tests do not leak into each
// other or pick up the developer's real shell environment.
func clearEnv(t *testing.T) {
	t.Helper()
	vars := []string{
		"APP_ENV", "TENANCY_MODE", "API_ADDR", "APP_ORIGINS", "APP_TIMEZONE", "BASE_DOMAIN",
		"DATABASE_URL", "REDIS_URL", "JWT_SIGNING_KEY", "JWT_SIGNING_KEY_FILE",
		"DOCUMENT_SIGNING_KEY", "DOCUMENT_SIGNING_KEY_FILE",
		"ACCESS_TOKEN_TTL", "REFRESH_TOKEN_TTL", "TRUSTED_PROXIES", "BODY_LIMIT_BYTES",
		"S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_PUBLIC_ENDPOINT", "S3_REGION", "SMTP_URL",
		"WHATSAPP_PROVIDER", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID",
		"OTEL_EXPORTER_OTLP_ENDPOINT", "SEED_PASSWORD",
	}
	for _, v := range vars {
		t.Setenv(v, "")
		_ = os.Unsetenv(v)
	}
}

func TestLoad_FailsFastWithoutRequiredVars(t *testing.T) {
	clearEnv(t)

	_, err := Load()
	if err == nil {
		t.Fatal("expected Load to fail when DATABASE_URL and JWT_SIGNING_KEY are unset")
	}
}

func TestLoad_SucceedsWithMinimumRequiredVars(t *testing.T) {
	clearEnv(t)
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("JWT_SIGNING_KEY", "base64key")
	t.Setenv("DOCUMENT_SIGNING_KEY", "a-test-document-signing-key-32-chars-long")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.TenancyMode != TenancySingle {
		t.Errorf("expected default TenancyMode single, got %q", cfg.TenancyMode)
	}
	if cfg.AccessTokenTTL.String() != "15m0s" {
		t.Errorf("expected default access token ttl 15m, got %v", cfg.AccessTokenTTL)
	}
}

func TestLoad_RequiresAppOriginsInProduction(t *testing.T) {
	clearEnv(t)
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("JWT_SIGNING_KEY", "base64key")
	t.Setenv("DOCUMENT_SIGNING_KEY", "a-test-document-signing-key-32-chars-long")
	t.Setenv("APP_ENV", "production")

	if _, err := Load(); err == nil {
		t.Fatal("expected Load to fail in production without APP_ORIGINS")
	}

	t.Setenv("APP_ORIGINS", "https://app.example.com")
	if _, err := Load(); err != nil {
		t.Fatalf("expected Load to succeed once APP_ORIGINS is set: %v", err)
	}
}

func TestLoad_RejectsInvalidTenancyMode(t *testing.T) {
	clearEnv(t)
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("JWT_SIGNING_KEY", "base64key")
	t.Setenv("DOCUMENT_SIGNING_KEY", "a-test-document-signing-key-32-chars-long")
	t.Setenv("TENANCY_MODE", "both")

	if _, err := Load(); err == nil {
		t.Fatal("expected Load to reject an unknown TENANCY_MODE")
	}
}

func TestLoad_RequiresWhatsAppCredentialsWhenProviderIsNotNoop(t *testing.T) {
	clearEnv(t)
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("JWT_SIGNING_KEY", "base64key")
	t.Setenv("DOCUMENT_SIGNING_KEY", "a-test-document-signing-key-32-chars-long")
	t.Setenv("WHATSAPP_PROVIDER", "meta")

	if _, err := Load(); err == nil {
		t.Fatal("expected Load to fail when WHATSAPP_PROVIDER != noop without token/phone id")
	}
}

func TestLoad_FileIndirectionForSecrets(t *testing.T) {
	clearEnv(t)
	dir := t.TempDir()
	keyPath := filepath.Join(dir, "jwt_key")
	if err := os.WriteFile(keyPath, []byte("from-file-key\n"), 0o600); err != nil {
		t.Fatalf("write temp key file: %v", err)
	}

	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("JWT_SIGNING_KEY_FILE", keyPath)
	t.Setenv("DOCUMENT_SIGNING_KEY", "a-test-document-signing-key-32-chars-long")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.JWTSigningKey != "from-file-key" {
		t.Errorf("expected JWTSigningKey read from file (trimmed), got %q", cfg.JWTSigningKey)
	}
}

func TestLoad_RejectsShortDocumentSigningKey(t *testing.T) {
	clearEnv(t)
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("JWT_SIGNING_KEY", "base64key")
	t.Setenv("DOCUMENT_SIGNING_KEY", "too-short")

	if _, err := Load(); err == nil {
		t.Fatal("expected Load to reject a DOCUMENT_SIGNING_KEY shorter than 32 characters")
	}
}

func TestLoad_S3PublicEndpointAndRegionDefaults(t *testing.T) {
	clearEnv(t)
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("JWT_SIGNING_KEY", "base64key")
	t.Setenv("DOCUMENT_SIGNING_KEY", "a-test-document-signing-key-32-chars-long")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.S3PublicEndpoint != "" {
		t.Errorf("expected S3PublicEndpoint to default empty, got %q", cfg.S3PublicEndpoint)
	}
	if cfg.S3Region != "us-east-1" {
		t.Errorf("expected S3Region to default to us-east-1, got %q", cfg.S3Region)
	}
}

func TestLoad_S3PublicEndpointOverridesAndValidates(t *testing.T) {
	clearEnv(t)
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("JWT_SIGNING_KEY", "base64key")
	t.Setenv("DOCUMENT_SIGNING_KEY", "a-test-document-signing-key-32-chars-long")
	t.Setenv("S3_PUBLIC_ENDPOINT", "https://sion.nouma.id")
	t.Setenv("S3_REGION", "ap-southeast-1")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.S3PublicEndpoint != "https://sion.nouma.id" {
		t.Errorf("expected S3PublicEndpoint to be set, got %q", cfg.S3PublicEndpoint)
	}
	if cfg.S3Region != "ap-southeast-1" {
		t.Errorf("expected S3Region override, got %q", cfg.S3Region)
	}
}

func TestLoad_RejectsInvalidS3PublicEndpoint(t *testing.T) {
	clearEnv(t)
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("JWT_SIGNING_KEY", "base64key")
	t.Setenv("DOCUMENT_SIGNING_KEY", "a-test-document-signing-key-32-chars-long")
	t.Setenv("S3_PUBLIC_ENDPOINT", "minio:9000")

	if _, err := Load(); err == nil {
		t.Fatal("expected Load to reject an S3_PUBLIC_ENDPOINT without a scheme")
	}
}
