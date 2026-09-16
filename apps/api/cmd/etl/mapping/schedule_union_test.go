package mapping

import "testing"

func TestResolveScheduleUnion_NewestRevisionWinsPerSlot(t *testing.T) {
	// Same shape as the live data this fixed: version 2 covers Selasa and
	// Rabu for one class/period with subjects 17/21, version 3 (a later
	// revision) replaces both with subjects 13/14, and version 2's Kamis
	// row for the same class/period has no version 3 counterpart, so it
	// must survive untouched.
	rank := map[int64]int{2: 0, 3: 1}
	rows := []ScheduleRevisionRow[string]{
		{Slot: ScheduleSlot{ClassID: 53, Weekday: 2, PeriodID: 5}, VersionID: 2, Row: "v2-selasa-subj17"},
		{Slot: ScheduleSlot{ClassID: 53, Weekday: 3, PeriodID: 5}, VersionID: 2, Row: "v2-rabu-subj21"},
		{Slot: ScheduleSlot{ClassID: 53, Weekday: 4, PeriodID: 5}, VersionID: 2, Row: "v2-kamis-subj15"},
		{Slot: ScheduleSlot{ClassID: 53, Weekday: 2, PeriodID: 5}, VersionID: 3, Row: "v3-selasa-subj13"},
		{Slot: ScheduleSlot{ClassID: 53, Weekday: 3, PeriodID: 5}, VersionID: 3, Row: "v3-rabu-subj14"},
	}

	got := ResolveScheduleUnion(rows, rank)

	if len(got) != 3 {
		t.Fatalf("len(got) = %d, want 3 slots", len(got))
	}
	want := map[ScheduleSlot]string{
		{ClassID: 53, Weekday: 2, PeriodID: 5}: "v3-selasa-subj13",
		{ClassID: 53, Weekday: 3, PeriodID: 5}: "v3-rabu-subj14",
		{ClassID: 53, Weekday: 4, PeriodID: 5}: "v2-kamis-subj15",
	}
	for slot, wantRow := range want {
		row, ok := got[slot]
		if !ok {
			t.Errorf("slot %+v missing from union", slot)
			continue
		}
		if row.Row != wantRow {
			t.Errorf("slot %+v = %q, want %q", slot, row.Row, wantRow)
		}
	}
}

func TestResolveScheduleUnion_IgnoresStatusUsesRankOnly(t *testing.T) {
	// The whole point of the fix: a revision's rank comes from the caller
	// (effective_from order), never from a status column ResolveScheduleUnion
	// never even sees.
	rank := map[int64]int{2: 0, 3: 1}
	rows := []ScheduleRevisionRow[string]{
		{Slot: ScheduleSlot{ClassID: 1, Weekday: 1, PeriodID: 1}, VersionID: 2, Row: "active-but-older"},
		{Slot: ScheduleSlot{ClassID: 1, Weekday: 1, PeriodID: 1}, VersionID: 3, Row: "scheduled-but-newer"},
	}

	got := ResolveScheduleUnion(rows, rank)

	slot := ScheduleSlot{ClassID: 1, Weekday: 1, PeriodID: 1}
	if got[slot].Row != "scheduled-but-newer" {
		t.Errorf("got %q, want the higher-rank row regardless of source status", got[slot].Row)
	}
}

func TestResolveScheduleUnion_EmptyInput(t *testing.T) {
	got := ResolveScheduleUnion([]ScheduleRevisionRow[string]{}, map[int64]int{})
	if len(got) != 0 {
		t.Errorf("len(got) = %d, want 0", len(got))
	}
}
