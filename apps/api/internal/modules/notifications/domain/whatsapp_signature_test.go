package domain_test

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
)

func sign(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func TestVerifyMetaWebhookSignature_Valid(t *testing.T) {
	secret := "app-secret-value"
	body := []byte(`{"entry":[{"id":"1"}]}`)

	if !domain.VerifyMetaWebhookSignature(secret, body, sign(secret, body)) {
		t.Fatal("expected valid signature to verify")
	}
}

func TestVerifyMetaWebhookSignature_TamperedBody(t *testing.T) {
	secret := "app-secret-value"
	header := sign(secret, []byte(`{"entry":[{"id":"1"}]}`))

	if domain.VerifyMetaWebhookSignature(secret, []byte(`{"entry":[{"id":"2"}]}`), header) {
		t.Fatal("expected tampered body to fail verification")
	}
}

func TestVerifyMetaWebhookSignature_WrongSecret(t *testing.T) {
	body := []byte(`{"entry":[]}`)
	header := sign("correct-secret", body)

	if domain.VerifyMetaWebhookSignature("wrong-secret", body, header) {
		t.Fatal("expected wrong secret to fail verification")
	}
}

func TestVerifyMetaWebhookSignature_MissingPrefix(t *testing.T) {
	secret := "app-secret-value"
	body := []byte(`{}`)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	header := hex.EncodeToString(mac.Sum(nil)) // no "sha256=" prefix

	if domain.VerifyMetaWebhookSignature(secret, body, header) {
		t.Fatal("expected header without sha256= prefix to fail verification")
	}
}

func TestVerifyMetaWebhookSignature_EmptyInputs(t *testing.T) {
	if domain.VerifyMetaWebhookSignature("", []byte("x"), "sha256=abc") {
		t.Fatal("expected empty secret to fail")
	}
	if domain.VerifyMetaWebhookSignature("secret", []byte("x"), "") {
		t.Fatal("expected empty header to fail")
	}
}
