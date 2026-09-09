package domain

import "errors"

var (
	ErrNotFound           = errors.New("announcement not found")
	ErrInvalidStatus      = errors.New("announcement cannot change in its current status")
	ErrAudienceEmpty      = errors.New("announcement audience resolved to no recipients")
	ErrInvalidAudience    = errors.New("announcement audience is invalid")
	ErrInvalidInput       = errors.New("announcement input is invalid")
	ErrScheduleNeedsStart = errors.New("a scheduled announcement needs a future starts_at")
)
