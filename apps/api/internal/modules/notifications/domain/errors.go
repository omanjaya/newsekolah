package domain

import "errors"

var (
	ErrNotificationNotFound = errors.New("notification not found")
	ErrPushDeviceNotFound   = errors.New("push device not found")
	ErrInvalidChannel       = errors.New("invalid notification channel")
	ErrInvalidPlatform      = errors.New("invalid push device platform")
)
