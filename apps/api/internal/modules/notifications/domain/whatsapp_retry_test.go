package domain_test

import (
	"testing"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
)

func TestWhatsAppRetryBackoff(t *testing.T) {
	cases := []struct {
		attempt int
		want    time.Duration
	}{
		{attempt: 0, want: 30 * time.Second}, // treated as attempt 1
		{attempt: 1, want: 30 * time.Second},
		{attempt: 2, want: 60 * time.Second},
		{attempt: 3, want: 120 * time.Second},
		{attempt: 4, want: 240 * time.Second},
		{attempt: 5, want: 480 * time.Second},
		{attempt: 6, want: 960 * time.Second},
		{attempt: 7, want: 1920 * time.Second},
		{attempt: 8, want: time.Hour}, // would be 3840s uncapped
		{attempt: 100, want: time.Hour},
	}
	for _, tc := range cases {
		if got := domain.WhatsAppRetryBackoff(tc.attempt); got != tc.want {
			t.Errorf("WhatsAppRetryBackoff(%d) = %v, want %v", tc.attempt, got, tc.want)
		}
	}
}

func TestWhatsAppRetryBackoff_Monotonic(t *testing.T) {
	prev := time.Duration(0)
	for attempt := 1; attempt <= 12; attempt++ {
		got := domain.WhatsAppRetryBackoff(attempt)
		if got < prev {
			t.Fatalf("WhatsAppRetryBackoff(%d) = %v, less than previous %v", attempt, got, prev)
		}
		prev = got
	}
}
