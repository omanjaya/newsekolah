package domain_test

import (
	"testing"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/domain"
)

func TestCatchUpSlots(t *testing.T) {
	loc := mustLoadLocation(t, "Asia/Makassar")
	now := time.Date(2026, 11, 20, 11, 26, 0, 0, loc)
	slots := domain.CatchUpSlots(now, loc)
	want := []int{8, 9, 10, 11}
	if len(slots) != len(want) {
		t.Fatalf("got %d slots, want %d", len(slots), len(want))
	}
	for i, slot := range slots {
		if slot.Hour() != want[i] || slot.Minute() != 0 || slot.Location() != loc {
			t.Errorf("slot %d = %s, want %02d:00 in %s", i, slot, want[i], loc)
		}
	}
}

func TestDueAtSlot_IgnoresSlotsBeforeTheLastChange(t *testing.T) {
	loc := mustLoadLocation(t, "Asia/Makassar")
	s := domain.Schedule{
		Cadence: domain.CadenceDaily, Hour: 11,
		UpdatedAt: time.Date(2026, 11, 20, 10, 17, 0, 0, loc),
	}
	if !s.DueAtSlot(time.Date(2026, 11, 20, 11, 0, 0, 0, loc)) {
		t.Fatal("the 11:00 slot after the schedule was created must be due")
	}
	created := domain.Schedule{Cadence: domain.CadenceDaily, Hour: 10, UpdatedAt: s.UpdatedAt}
	if created.DueAtSlot(time.Date(2026, 11, 20, 10, 0, 0, 0, loc)) {
		t.Fatal("a schedule created at 10:17 must not run its 10:00 slot retroactively")
	}
}

// TestNextRun_ShowsTheWaitingSlot covers the list's "next run" while the
// current hour's slot has not been claimed yet: it stays on today's slot
// instead of jumping to tomorrow, and moves on once a run row exists.
func TestNextRun_ShowsTheWaitingSlot(t *testing.T) {
	loc := mustLoadLocation(t, "Asia/Makassar")
	s := domain.Schedule{
		Cadence: domain.CadenceDaily, Hour: 11,
		UpdatedAt: time.Date(2026, 11, 20, 10, 17, 0, 0, loc),
	}
	now := time.Date(2026, 11, 20, 11, 2, 0, 0, loc)
	today := time.Date(2026, 11, 20, 11, 0, 0, 0, loc).UTC()
	tomorrow := time.Date(2026, 11, 21, 11, 0, 0, 0, loc).UTC()

	if got := s.NextRun(now, loc, time.Time{}); !got.Equal(today) {
		t.Fatalf("unclaimed: next run = %s, want %s", got, today)
	}
	if got := s.NextRun(now, loc, today); !got.Equal(tomorrow) {
		t.Fatalf("claimed: next run = %s, want %s", got, tomorrow)
	}
	// Before the slot, it is simply the next one.
	if got := s.NextRun(time.Date(2026, 11, 20, 10, 30, 0, 0, loc), loc, time.Time{}); !got.Equal(today) {
		t.Fatalf("before the slot: next run = %s, want %s", got, today)
	}
}
