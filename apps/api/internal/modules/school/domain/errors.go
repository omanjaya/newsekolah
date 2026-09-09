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
)
