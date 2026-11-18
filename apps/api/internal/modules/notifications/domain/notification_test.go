package domain

import (
	"slices"
	"testing"
)

func TestKindModule(t *testing.T) {
	want := map[Kind]string{
		KindAttendanceSubmitted:        "",
		KindSubstitutionRequested:      "",
		KindSubstitutionResponded:      "",
		KindLeaveRequestSubmitted:      ModulePermits,
		KindLeaveRequestReviewed:       ModulePermits,
		KindLeaveRequestIssued:         ModulePermits,
		KindExitPermitStageChanged:     ModulePermits,
		KindExitPermitIssued:           ModulePermits,
		KindExitPermitExited:           ModulePermits,
		KindLateArrivalOpened:          ModulePermits,
		KindLateArrivalUpdated:         ModulePermits,
		KindWarningLetterIssued:        ModuleDiscipline,
		KindDisciplineThresholdReached: ModuleDiscipline,
		KindAnnouncementPublished:      ModuleAnnouncements,
		KindLibraryReservationReady:    ModuleLibrary,
		KindLibraryLoanDueReminder:     ModuleLibrary,
	}
	if len(AllKinds) != len(want) {
		t.Fatalf("AllKinds has %d kinds, this test maps %d: add the new kind to both", len(AllKinds), len(want))
	}
	for _, k := range AllKinds {
		module, ok := want[k]
		if !ok {
			t.Errorf("kind %q has no expected module in this test", k)
			continue
		}
		if got := k.Module(); got != module {
			t.Errorf("%s.Module() = %q, want %q", k, got, module)
		}
	}
	if got := Kind("unknown_kind").Module(); got != "" {
		t.Errorf("an unknown kind must never be hidden, got module %q", got)
	}
}

func TestNotificationModules(t *testing.T) {
	want := []string{ModulePermits, ModuleDiscipline, ModuleAnnouncements, ModuleLibrary}
	if got := NotificationModules(); !slices.Equal(got, want) {
		t.Errorf("NotificationModules() = %v, want %v", got, want)
	}
}

func TestHiddenKinds(t *testing.T) {
	if got := HiddenKinds(nil); got == nil || len(got) != 0 {
		t.Errorf("HiddenKinds(nil) = %#v, want an empty non-nil slice", got)
	}
	if got := HiddenKinds([]string{"visitors", "billing"}); len(got) != 0 {
		t.Errorf("modules without notifications hide nothing, got %v", got)
	}

	got := HiddenKinds([]string{ModuleAnnouncements, ModuleLibrary})
	want := []string{
		string(KindAnnouncementPublished),
		string(KindLibraryReservationReady), string(KindLibraryLoanDueReminder),
	}
	if !slices.Equal(got, want) {
		t.Errorf("HiddenKinds(announcements, library) = %v, want %v", got, want)
	}
	if slices.Contains(got, string(KindAttendanceSubmitted)) {
		t.Error("a core kind must never be hidden")
	}
}
