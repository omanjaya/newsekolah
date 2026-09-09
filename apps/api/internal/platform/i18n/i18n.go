// Package i18n resolves server-generated error and status messages to the
// caller's language from the Accept-Language header, defaulting to
// Indonesian. It is not a general-purpose translation library: message keys
// are the stable error codes used across the API (see httpx/errors.go).
package i18n

import "strings"

const (
	Indonesian = "id"
	English    = "en"

	DefaultLocale = Indonesian
)

var supported = map[string]bool{Indonesian: true, English: true}

// catalog maps a stable code to its message per locale. Every code used by
// httpx/errors.go must have an Indonesian and an English entry.
var catalog = map[string]map[string]string{
	"AUTH_INVALID_CREDENTIALS": {
		Indonesian: "Username atau kata sandi salah.",
		English:    "Incorrect username or password.",
	},
	"AUTH_TOKEN_EXPIRED": {
		Indonesian: "Sesi telah berakhir, silakan masuk kembali.",
		English:    "Your session has expired, please sign in again.",
	},
	"AUTH_TOKEN_INVALID": {
		Indonesian: "Token tidak valid.",
		English:    "Invalid token.",
	},
	"AUTH_SESSION_REVOKED": {
		Indonesian: "Sesi ini telah dicabut.",
		English:    "This session has been revoked.",
	},
	"TENANT_NOT_FOUND": {
		Indonesian: "Sekolah tidak ditemukan.",
		English:    "School not found.",
	},
	"VALIDATION_FAILED": {
		Indonesian: "Data yang dikirim tidak valid.",
		English:    "The submitted data is invalid.",
	},
	"RATE_LIMITED": {
		Indonesian: "Terlalu banyak percobaan, coba lagi nanti.",
		English:    "Too many attempts, please try again later.",
	},
	"FORBIDDEN": {
		Indonesian: "Anda tidak memiliki akses untuk aksi ini.",
		English:    "You do not have access to perform this action.",
	},
	"NOT_FOUND": {
		Indonesian: "Data tidak ditemukan.",
		English:    "Not found.",
	},
	"INTERNAL_ERROR": {
		Indonesian: "Terjadi kesalahan pada server.",
		English:    "An internal server error occurred.",
	},
	"AUTHZ_NOT_CONFIGURED": {
		Indonesian: "Operasi ini belum memiliki konfigurasi izin.",
		English:    "This operation has no permission configured.",
	},
}

// Message returns the localized message for code in the given
// Accept-Language header value, falling back to Indonesian.
func Message(code, acceptLanguage string) string {
	locale := Resolve(acceptLanguage)
	entry, ok := catalog[code]
	if !ok {
		entry = catalog["INTERNAL_ERROR"]
	}
	if msg, ok := entry[locale]; ok {
		return msg
	}
	return entry[DefaultLocale]
}

// Resolve picks the best supported locale for an Accept-Language header,
// e.g. "en-US,en;q=0.9,id;q=0.8" resolves to "en".
func Resolve(acceptLanguage string) string {
	for _, part := range strings.Split(acceptLanguage, ",") {
		tag := strings.TrimSpace(strings.SplitN(part, ";", 2)[0])
		tag = strings.ToLower(strings.SplitN(tag, "-", 2)[0])
		if supported[tag] {
			return tag
		}
	}
	return DefaultLocale
}
