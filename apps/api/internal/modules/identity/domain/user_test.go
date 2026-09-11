package domain

import (
	"errors"
	"strings"
	"testing"
)

func TestValidatePasswordPolicy(t *testing.T) {
	tests := []struct {
		name     string
		password string
		wantErr  error
	}{
		{"too short", "short1", ErrPasswordTooShort},
		{"exactly minimum", "12345678", nil},
		{"too long", strings.Repeat("a", 129), ErrPasswordTooLong},
		{"exactly maximum", strings.Repeat("a", 128), nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePasswordPolicy(tt.password)
			if !errors.Is(err, tt.wantErr) {
				t.Errorf("ValidatePasswordPolicy(%d chars) = %v, want %v", len(tt.password), err, tt.wantErr)
			}
		})
	}
}

func TestNormalizeUsername(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"Budi", "budi"},
		{"  budi  ", "budi"},
		{"BUDI.SANTOSO", "budi.santoso"},
		{"budi", "budi"},
	}
	for _, tt := range tests {
		if got := NormalizeUsername(tt.in); got != tt.want {
			t.Errorf("NormalizeUsername(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestNormalizeEmail(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"Budi@Example.com", "budi@example.com"},
		{"  budi@example.com ", "budi@example.com"},
		{"", ""},
	}
	for _, tt := range tests {
		if got := NormalizeEmail(tt.in); got != tt.want {
			t.Errorf("NormalizeEmail(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestUserCanAuthenticate(t *testing.T) {
	tests := []struct {
		status UserStatus
		want   bool
	}{
		{UserActive, true},
		{UserInactive, false},
		{UserInvited, false},
	}

	for _, tt := range tests {
		u := User{Status: tt.status}
		if got := u.CanAuthenticate(); got != tt.want {
			t.Errorf("User{Status: %q}.CanAuthenticate() = %v, want %v", tt.status, got, tt.want)
		}
	}
}
