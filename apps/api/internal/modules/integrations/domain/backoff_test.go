package domain

import (
	"testing"
	"time"
)

func TestBackoffDuration_DoublesThenCaps(t *testing.T) {
	cases := []struct {
		attempt int
		want    time.Duration
	}{
		{1, 30 * time.Second},
		{2, time.Minute},
		{3, 2 * time.Minute},
		{4, 4 * time.Minute},
		{5, 8 * time.Minute},
		{6, 16 * time.Minute},
		{7, 32 * time.Minute},
		{8, time.Hour},   // 30s * 2^7 = 64m, capped to 1h
		{9, time.Hour},   // keeps doubling past the cap without ever exceeding it
		{100, time.Hour}, // large attempt numbers stay capped, never overflow
	}
	for _, tc := range cases {
		got := BackoffDuration(tc.attempt)
		if got != tc.want {
			t.Errorf("BackoffDuration(%d) = %v, want %v", tc.attempt, got, tc.want)
		}
	}
}

func TestBackoffDuration_NonPositiveAttemptTreatedAsFirst(t *testing.T) {
	if got, want := BackoffDuration(0), BackoffDuration(1); got != want {
		t.Errorf("BackoffDuration(0) = %v, want same as BackoffDuration(1) = %v", got, want)
	}
	if got, want := BackoffDuration(-5), BackoffDuration(1); got != want {
		t.Errorf("BackoffDuration(-5) = %v, want same as BackoffDuration(1) = %v", got, want)
	}
}
