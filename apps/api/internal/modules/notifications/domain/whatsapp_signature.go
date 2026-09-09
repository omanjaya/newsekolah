package domain

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

const metaSignaturePrefix = "sha256="

// VerifyMetaWebhookSignature checks the X-Hub-Signature-256 header Meta
// sends with every webhook delivery: an HMAC-SHA256 of the raw request
// body, keyed with the WhatsApp app's secret. The body must be the exact
// bytes as received, before any JSON decoding, or the signature will
// never match. An empty secret or header always fails closed.
func VerifyMetaWebhookSignature(appSecret string, body []byte, header string) bool {
	if appSecret == "" || header == "" {
		return false
	}
	hexSig, ok := strings.CutPrefix(header, metaSignaturePrefix)
	if !ok {
		return false
	}
	signature, err := hex.DecodeString(hexSig)
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(appSecret))
	mac.Write(body)
	return hmac.Equal(signature, mac.Sum(nil))
}
