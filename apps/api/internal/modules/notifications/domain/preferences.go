package domain

import "time"

// DefaultChannelEnabled is the hardcoded fallback used when neither the
// user nor the tenant has an explicit preference row for a (kind, channel)
// pair: in-app and push are on by default, email and WhatsApp are opt-in
// (they carry a per-message cost and are easier to find intrusive).
func DefaultChannelEnabled(channel Channel) bool {
	switch channel {
	case ChannelInApp, ChannelPush:
		return true
	case ChannelEmail, ChannelWhatsApp:
		return false
	default:
		return false
	}
}

// ResolveChannels computes which channels should receive a notification of
// kind for one user: an explicit user preference wins, then the tenant's
// default for that channel, then the hardcoded fallback above.
func ResolveChannels(userPrefs map[Channel]bool, tenantDefaults map[Channel]bool) []Channel {
	out := make([]Channel, 0, len(AllChannels))
	for _, ch := range AllChannels {
		enabled, ok := userPrefs[ch]
		if !ok {
			enabled, ok = tenantDefaults[ch]
		}
		if !ok {
			enabled = DefaultChannelEnabled(ch)
		}
		if enabled {
			out = append(out, ch)
		}
	}
	return out
}

// QuietHours is a same-day or overnight window (hours in the tenant's local
// timezone; the caller is responsible for the conversion) during which
// push and WhatsApp sends are deferred rather than delivered immediately.
type QuietHours struct {
	Enabled   bool
	StartHour int // 0-23
	EndHour   int // 0-23
}

// DeferUntil returns when a send occurring at now should actually happen:
// now itself outside the window, or the window's end (today or, for an
// overnight window already past its end today, tomorrow) inside it.
func (q QuietHours) DeferUntil(now time.Time) time.Time {
	if !q.Enabled || q.StartHour == q.EndHour {
		return now
	}
	if !q.contains(now.Hour()) {
		return now
	}
	end := time.Date(now.Year(), now.Month(), now.Day(), q.EndHour, 0, 0, 0, now.Location())
	if !end.After(now) {
		end = end.AddDate(0, 0, 1)
	}
	return end
}

func (q QuietHours) contains(hour int) bool {
	if q.StartHour < q.EndHour {
		return hour >= q.StartHour && hour < q.EndHour
	}
	// Overnight window, e.g. 22 -> 6.
	return hour >= q.StartHour || hour < q.EndHour
}

// DigestSettings is a user's daily-digest configuration.
type DigestSettings struct {
	Enabled      bool
	Hour         int // 0-23, tenant-local
	LastDigestAt *time.Time
}

// Due reports whether a digest should fire right now, given the tenant's
// current local hour: the user's chosen hour must match, and at least 20
// hours must have passed since the last one (guards against the hourly
// periodic job double-firing within the same hour it already ran).
func (d DigestSettings) Due(now time.Time, tenantLocalHour int) bool {
	if !d.Enabled || d.Hour != tenantLocalHour {
		return false
	}
	if d.LastDigestAt == nil {
		return true
	}
	return now.Sub(*d.LastDigestAt) >= 20*time.Hour
}
