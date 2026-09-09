package domain

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"strconv"
)

// SignatureHeader is the HTTP header a webhook delivery carries its
// signature in (docs/14-public-api.md documents the verification steps for
// receivers).
const SignatureHeader = "X-Newsekolah-Signature"

// SignPayload computes the HMAC-SHA256 signature over "<timestamp>.<body>",
// hex-encoded, the same construction Stripe and GitHub use so an existing
// receiver library can usually verify it unmodified. timestamp is Unix
// seconds, taken from the caller's clock at send time -- never
// time.Now() -- so it is reproducible in tests.
func SignPayload(secret []byte, timestampUnix int64, body []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(strconv.FormatInt(timestampUnix, 10)))
	mac.Write([]byte("."))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// SignatureHeaderValue formats the header value: "t=<timestamp>,v1=<sig>",
// so a receiver can read the timestamp back out to check the replay
// window before recomputing the signature.
func SignatureHeaderValue(secret []byte, timestampUnix int64, body []byte) string {
	return "t=" + strconv.FormatInt(timestampUnix, 10) + ",v1=" + SignPayload(secret, timestampUnix, body)
}

// VerifySignature recomputes the signature and compares it in constant
// time; it does not check the replay window itself (a receiver typically
// bounds that check to its own message queue's needs), only that the
// signature matches what secret and timestamp would produce.
func VerifySignature(secret []byte, timestampUnix int64, body []byte, signatureHex string) bool {
	want := SignPayload(secret, timestampUnix, body)
	return subtle.ConstantTimeCompare([]byte(want), []byte(signatureHex)) == 1
}
