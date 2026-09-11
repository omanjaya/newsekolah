package domain

import "errors"

var (
	ErrTenantNotFound       = errors.New("tenant not found")
	ErrInvalidProfile       = errors.New("school profile is incomplete")
	ErrInvalidPeriod        = errors.New("ends_on must be after starts_on")
	ErrAcademicYearExists   = errors.New("academic year label already exists")
	ErrAcademicYearNotFound = errors.New("academic year not found")

	ErrOnboardingUnavailable = errors.New("onboarding wizard dependencies are not configured")
	ErrTenantHasData         = errors.New("tenant already has real data; sample data seeding refused")
	ErrNoActiveAcademicYear  = errors.New("tenant has no active academic year")

	// Branding
	ErrInvalidAccentColor   = errors.New("accent_color must be a #rrggbb hex color")
	ErrBrandingNameTooLong  = errors.New("name/short_name/tagline exceed their length limit")
	ErrUploadNotConfigured  = errors.New("file storage is not configured")
	ErrUploadInvalidType    = errors.New("logo/favicon must be PNG, WebP, or SVG")
	ErrUploadTooLarge       = errors.New("file exceeds the allowed size")
	ErrUploadObjectNotOwned = errors.New("uploaded object does not belong to this tenant")
)
