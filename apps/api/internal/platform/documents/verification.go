package documents

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"fmt"
)

// codeAlphabetLen matches base32's output length for 16 random bytes
// (26 chars, Crockford-free standard base32 without padding).
var codeEncoding = base32.StdEncoding.WithPadding(base32.NoPadding)

// NewVerificationCode returns a random, human-typeable code (public
// documents.verify/{code} URLs are sometimes typed off a printed letter,
// hence base32 rather than base64: no mixed case, no +/=) and its
// HMAC-SHA256 keyed by signingKey. Only the hash is stored
// (issued_documents.verification_code_hash); the plaintext code is
// returned once, printed/QR-coded on the document itself.
//
// signingKey must be internal/platform/config's DOCUMENT_SIGNING_KEY, a
// secret dedicated to this purpose -- never the JWT signing key
// (docs/08-security.md: a key compromise in one system must not unlock
// the other).
func NewVerificationCode(signingKey []byte) (code string, hash []byte, err error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, fmt.Errorf("generate verification code: %w", err)
	}
	code = codeEncoding.EncodeToString(raw)
	return code, HashVerificationCode(signingKey, code), nil
}

// HashVerificationCode is also how the verify endpoint looks a code up:
// hash the caller-supplied code and query issued_documents by
// (tenant_id, verification_code_hash), an indexed equality lookup rather
// than a fetch-then-compare, so there is no code to compare in variable
// time in the first place.
func HashVerificationCode(signingKey []byte, code string) []byte {
	mac := hmac.New(sha256.New, signingKey)
	mac.Write([]byte(code))
	return mac.Sum(nil)
}
