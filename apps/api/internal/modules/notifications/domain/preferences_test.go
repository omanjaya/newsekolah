package domain

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestResolveChannels(t *testing.T) {
	tests := []struct {
		name       string
		userPrefs  map[Channel]bool
		tenantDefs map[Channel]bool
		want       []Channel
	}{
		{
			name: "no preferences at all falls back to hardcoded defaults",
			want: []Channel{ChannelInApp, ChannelPush},
		},
		{
			name:      "user preference overrides the hardcoded default",
			userPrefs: map[Channel]bool{ChannelEmail: true},
			want:      []Channel{ChannelInApp, ChannelPush, ChannelEmail},
		},
		{
			name:      "user preference can disable a default-on channel",
			userPrefs: map[Channel]bool{ChannelPush: false},
			want:      []Channel{ChannelInApp},
		},
		{
			name:       "tenant default applies when the user has no explicit preference",
			tenantDefs: map[Channel]bool{ChannelWhatsApp: true},
			want:       []Channel{ChannelInApp, ChannelPush, ChannelWhatsApp},
		},
		{
			name:       "user preference wins over a tenant default",
			userPrefs:  map[Channel]bool{ChannelWhatsApp: false},
			tenantDefs: map[Channel]bool{ChannelWhatsApp: true},
			want:       []Channel{ChannelInApp, ChannelPush},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ResolveChannels(tt.userPrefs, tt.tenantDefs)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestQuietHoursDeferUntil(t *testing.T) {
	loc := time.UTC

	t.Run("disabled window never defers", func(t *testing.T) {
		q := QuietHours{Enabled: false, StartHour: 22, EndHour: 6}
		now := time.Date(2026, 1, 1, 23, 0, 0, 0, loc)
		require.Equal(t, now, q.DeferUntil(now))
	})

	t.Run("outside the window sends immediately", func(t *testing.T) {
		q := QuietHours{Enabled: true, StartHour: 22, EndHour: 6}
		now := time.Date(2026, 1, 1, 12, 0, 0, 0, loc)
		require.Equal(t, now, q.DeferUntil(now))
	})

	t.Run("overnight window defers to the next morning", func(t *testing.T) {
		q := QuietHours{Enabled: true, StartHour: 22, EndHour: 6}
		now := time.Date(2026, 1, 1, 23, 30, 0, 0, loc)
		want := time.Date(2026, 1, 2, 6, 0, 0, 0, loc)
		require.Equal(t, want, q.DeferUntil(now))
	})

	t.Run("overnight window already past midnight defers to the same morning", func(t *testing.T) {
		q := QuietHours{Enabled: true, StartHour: 22, EndHour: 6}
		now := time.Date(2026, 1, 2, 2, 0, 0, 0, loc)
		want := time.Date(2026, 1, 2, 6, 0, 0, 0, loc)
		require.Equal(t, want, q.DeferUntil(now))
	})

	t.Run("same-day window defers to that evening", func(t *testing.T) {
		q := QuietHours{Enabled: true, StartHour: 12, EndHour: 14}
		now := time.Date(2026, 1, 1, 13, 0, 0, 0, loc)
		want := time.Date(2026, 1, 1, 14, 0, 0, 0, loc)
		require.Equal(t, want, q.DeferUntil(now))
	})

	t.Run("zero-width window is treated as disabled", func(t *testing.T) {
		q := QuietHours{Enabled: true, StartHour: 8, EndHour: 8}
		now := time.Date(2026, 1, 1, 8, 0, 0, 0, loc)
		require.Equal(t, now, q.DeferUntil(now))
	})
}

func TestDigestSettingsDue(t *testing.T) {
	now := time.Date(2026, 1, 2, 7, 0, 0, 0, time.UTC)

	t.Run("disabled never fires", func(t *testing.T) {
		d := DigestSettings{Enabled: false, Hour: 7}
		require.False(t, d.Due(now, 7))
	})

	t.Run("wrong hour does not fire", func(t *testing.T) {
		d := DigestSettings{Enabled: true, Hour: 7}
		require.False(t, d.Due(now, 8))
	})

	t.Run("first run with no history fires", func(t *testing.T) {
		d := DigestSettings{Enabled: true, Hour: 7}
		require.True(t, d.Due(now, 7))
	})

	t.Run("already ran within the last 20 hours does not fire again", func(t *testing.T) {
		last := now.Add(-2 * time.Hour)
		d := DigestSettings{Enabled: true, Hour: 7, LastDigestAt: &last}
		require.False(t, d.Due(now, 7))
	})

	t.Run("ran more than 20 hours ago fires again", func(t *testing.T) {
		last := now.Add(-25 * time.Hour)
		d := DigestSettings{Enabled: true, Hour: 7, LastDigestAt: &last}
		require.True(t, d.Due(now, 7))
	})
}
