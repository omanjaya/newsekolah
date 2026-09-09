package domain

import "errors"

var (
	ErrUserNotFound         = errors.New("user not found")
	ErrInvalidCredentials   = errors.New("invalid credentials")
	ErrAccountNotActive     = errors.New("account is not active")
	ErrPasswordTooShort     = errors.New("password must be at least 8 characters")
	ErrPasswordTooLong      = errors.New("password must be at most 128 characters")
	ErrSessionNotFound      = errors.New("session not found")
	ErrSessionExpired       = errors.New("session expired")
	ErrSessionRevoked       = errors.New("session revoked")
	ErrRefreshReuseDetected = errors.New("refresh token reuse detected")
	ErrRateLimited          = errors.New("rate limited")
)
