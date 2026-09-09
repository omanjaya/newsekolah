package domain

import "errors"

var (
	ErrTenantNotFound       = errors.New("tenant not found")
	ErrInvalidPeriod        = errors.New("ends_on must be after starts_on")
	ErrAcademicYearExists   = errors.New("academic year label already exists")
	ErrAcademicYearNotFound = errors.New("academic year not found")
)
