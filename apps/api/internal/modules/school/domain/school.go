// Package domain holds the school module's entities: tenant branding and
// academic years. Pure business rules only, no database or HTTP imports.
package domain

import (
	"regexp"
	"time"

	"github.com/google/uuid"
)

type Branding struct {
	TenantID       uuid.UUID
	Slug           string
	Name           string
	ShortName      string
	Tagline        string
	LogoURL        string
	FaviconURL     string
	AccentColor    string
	Locale         string
	Timezone       string
	ProductName    string
	EducationLevel string
}

// DefaultAccentColor is used when a tenant has not set branding.accent_color.
const DefaultAccentColor = "#1F3A5F"

// DefaultProductName is the fallback when platform_settings has no product_name.
const DefaultProductName = "SION"

var hexColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// BrandingWrite is the text half of a branding update: name, short name,
// tagline, and accent color. Logo/favicon go through the separate
// upload/confirm flow (RequestLogoUpload, ConfirmLogoUpload, and their
// favicon equivalents).
type BrandingWrite struct {
	Name        string
	ShortName   string
	Tagline     string
	AccentColor string
}

// ValidateBrandingWrite mirrors the columns/constraints a school's public
// branding row must satisfy: a name, a plausible-length short name and
// tagline, and a #rrggbb accent color (the format every consumer -- CSS,
// the mobile app's theme -- expects).
func ValidateBrandingWrite(in BrandingWrite) error {
	if len(in.Name) == 0 || len(in.Name) > 160 {
		return ErrBrandingNameTooLong
	}
	if len(in.ShortName) > 40 || len(in.Tagline) > 200 {
		return ErrBrandingNameTooLong
	}
	if in.AccentColor != "" && !hexColorPattern.MatchString(in.AccentColor) {
		return ErrInvalidAccentColor
	}
	return nil
}

// BrandingImageMaxBytes caps a logo/favicon upload. Favicon is smaller: it
// is rendered at a handful of pixels, so there is no legitimate reason for
// one to approach the logo's own limit.
const (
	BrandingLogoMaxBytes    = 2 << 20   // 2 MB
	BrandingFaviconMaxBytes = 512 << 10 // 512 KB
)

// AllowedBrandingImageTypes are the content types a sniffed logo/favicon
// upload must match (docs/analysis/backend-inventory.md section 1.9: the
// old app only ever accepted WebP; this rewrite also allows PNG and SVG
// for a school whose existing logo asset is one of those already).
var AllowedBrandingImageTypes = map[string]bool{
	"image/png":     true,
	"image/webp":    true,
	"image/svg+xml": true,
}

type TenantSummary struct {
	ID   uuid.UUID
	Slug string
	Name string
	City string
}

type AcademicYear struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	Label    string
	StartsOn time.Time
	EndsOn   time.Time
	IsActive bool
}

// ValidatePeriod enforces the ends_on > starts_on constraint already
// present in the database, so the service can reject bad input before a
// round trip.
func ValidatePeriod(startsOn, endsOn time.Time) error {
	if !endsOn.After(startsOn) {
		return ErrInvalidPeriod
	}
	return nil
}
