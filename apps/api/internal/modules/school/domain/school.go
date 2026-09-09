// Package domain holds the school module's entities: tenant branding and
// academic years. Pure business rules only, no database or HTTP imports.
package domain

import (
	"time"

	"github.com/google/uuid"
)

type Branding struct {
	TenantID    uuid.UUID
	Slug        string
	Name        string
	ShortName   string
	Tagline     string
	LogoURL     string
	FaviconURL  string
	AccentColor string
	Locale      string
	Timezone    string
	ProductName string
}

// DefaultAccentColor is used when a tenant has not set branding.accent_color.
const DefaultAccentColor = "#1F3A5F"

// DefaultProductName is the fallback when platform_settings has no product_name.
const DefaultProductName = "SION"

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
