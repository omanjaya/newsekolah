package domain

import (
	"testing"
	"time"
)

func TestEvaluateRefresh(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	past := now.Add(-time.Hour)
	future := now.Add(time.Hour)

	tests := []struct {
		name    string
		session Session
		want    RefreshOutcome
	}{
		{
			name:    "active session within expiry rotates",
			session: Session{ExpiresAt: future},
			want:    RefreshRotate,
		},
		{
			name:    "revoked session is reuse, regardless of expiry",
			session: Session{RevokedAt: &past, ExpiresAt: future},
			want:    RefreshReuseDetected,
		},
		{
			name:    "unrevoked but past expiry",
			session: Session{ExpiresAt: past},
			want:    RefreshExpired,
		},
		{
			name:    "revoked takes priority over expired",
			session: Session{RevokedAt: &past, ExpiresAt: past},
			want:    RefreshReuseDetected,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := EvaluateRefresh(tt.session, now); got != tt.want {
				t.Errorf("EvaluateRefresh() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSessionKindCanRefresh(t *testing.T) {
	if !SessionLogin.CanRefresh() {
		t.Error("a login session must be refreshable")
	}
	if SessionImpersonation.CanRefresh() {
		t.Error("an impersonation session must not be refreshable, per its fixed 30-minute lifetime")
	}
}
