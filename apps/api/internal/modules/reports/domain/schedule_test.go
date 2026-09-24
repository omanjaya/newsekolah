package domain_test

import (
	"testing"
	"time"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

func mustLoadLocation(t *testing.T, name string) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation(name)
	if err != nil {
		t.Fatalf("load location %s: %v", name, err)
	}
	return loc
}

func weekday(n int) *int    { return &n }
func dayOfMonth(n int) *int { return &n }

func TestIsDueAt_Daily(t *testing.T) {
	loc := mustLoadLocation(t, "Asia/Jakarta")
	s := domain.Schedule{Cadence: domain.CadenceDaily, Hour: 7}

	// Frozen at 00:30 UTC == 07:30 in Jakarta (UTC+7): the fake clock never
	// calls time.Now itself, it just hands back a fixed instant.
	frozen := clock.Frozen{At: time.Date(2026, 3, 10, 0, 30, 0, 0, time.UTC)}
	local := frozen.Now().In(loc)

	if !s.IsDueAt(local) {
		t.Fatalf("expected daily schedule at hour 7 to be due at local time %v", local)
	}
	if s.IsDueAt(local.Add(time.Hour)) {
		t.Fatalf("did not expect the same schedule due one hour later")
	}
}

func TestIsDueAt_Weekly(t *testing.T) {
	loc := mustLoadLocation(t, "Asia/Makassar")
	// Monday = 1 in time.Weekday.
	s := domain.Schedule{Cadence: domain.CadenceWeekly, Hour: 6, Weekday: weekday(1)}

	// 2026-03-09 is a Monday. Freeze at 22:15 UTC the day before (Sunday),
	// which is already Monday 06:15 in Makassar (UTC+8) -- a case where
	// the tenant-local day differs from the UTC calendar day.
	frozen := clock.Frozen{At: time.Date(2026, 3, 8, 22, 15, 0, 0, time.UTC)}
	local := frozen.Now().In(loc)

	if local.Weekday() != time.Monday {
		t.Fatalf("test setup: expected local time to fall on Monday, got %v (%v)", local.Weekday(), local)
	}
	if !s.IsDueAt(local) {
		t.Fatalf("expected weekly Monday 06:00 schedule to be due at %v", local)
	}

	tuesday := local.AddDate(0, 0, 1)
	if s.IsDueAt(tuesday) {
		t.Fatalf("did not expect the Monday-only schedule due on %v", tuesday)
	}
}

func TestIsDueAt_MonthlyClampsToLastDay(t *testing.T) {
	loc := mustLoadLocation(t, "Asia/Jakarta")
	s := domain.Schedule{Cadence: domain.CadenceMonthly, Hour: 9, DayOfMonth: dayOfMonth(31)}

	// February 2026 has 28 days; a schedule configured for the 31st must
	// still fire once, on the last real day of the month.
	feb28 := time.Date(2026, 2, 28, 9, 0, 0, 0, loc)
	if !s.IsDueAt(feb28) {
		t.Fatalf("expected day-31 schedule to clamp to Feb 28, got not due at %v", feb28)
	}

	feb27 := feb28.AddDate(0, 0, -1)
	if s.IsDueAt(feb27) {
		t.Fatalf("did not expect the clamped schedule due a day early: %v", feb27)
	}

	// March has 31 days, so the same schedule runs on the 31st there.
	mar31 := time.Date(2026, 3, 31, 9, 0, 0, 0, loc)
	if !s.IsDueAt(mar31) {
		t.Fatalf("expected day-31 schedule due on March 31 (a full 31-day month), got %v", mar31)
	}
}

func TestNextRunAfter_Daily(t *testing.T) {
	loc := mustLoadLocation(t, "Asia/Jakarta")
	s := domain.Schedule{Cadence: domain.CadenceDaily, Hour: 7}

	frozen := clock.Frozen{At: time.Date(2026, 3, 10, 1, 0, 0, 0, time.UTC)} // 08:00 in Jakarta
	next := s.NextRunAfter(frozen.Now(), loc)

	wantLocal := time.Date(2026, 3, 11, 7, 0, 0, 0, loc)
	if !next.Equal(wantLocal.UTC()) {
		t.Fatalf("expected next run at %v, got %v", wantLocal.UTC(), next)
	}
}

func TestNextRunAfter_WeeklyAcrossTimezone(t *testing.T) {
	loc := mustLoadLocation(t, "Asia/Makassar")
	s := domain.Schedule{Cadence: domain.CadenceWeekly, Hour: 6, Weekday: weekday(1)} // Monday

	// Freeze right after a Monday run has already happened this week.
	frozen := clock.Frozen{At: time.Date(2026, 3, 9, 0, 0, 0, 0, time.UTC)} // 08:00 Monday in Makassar
	next := s.NextRunAfter(frozen.Now(), loc)

	wantLocal := time.Date(2026, 3, 16, 6, 0, 0, 0, loc) // the following Monday
	if !next.Equal(wantLocal.UTC()) {
		t.Fatalf("expected next weekly run at %v, got %v", wantLocal.UTC(), next)
	}
}

func TestNextRunAfter_MonthlyClamp(t *testing.T) {
	loc := mustLoadLocation(t, "Asia/Jakarta")
	s := domain.Schedule{Cadence: domain.CadenceMonthly, Hour: 9, DayOfMonth: dayOfMonth(31)}

	frozen := clock.Frozen{At: time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)}
	next := s.NextRunAfter(frozen.Now(), loc)

	wantLocal := time.Date(2026, 2, 28, 9, 0, 0, 0, loc) // Feb 2026 has 28 days
	if !next.Equal(wantLocal.UTC()) {
		t.Fatalf("expected next monthly run clamped to %v, got %v", wantLocal.UTC(), next)
	}
}

// TestSlotStart_SameSlotAcrossWakeUps is the run-once-per-slot rule the
// hourly job depends on: two wake-ups a few minutes apart within the same
// tenant-local hour must key report_schedule_runs on the same instant, and
// a wake-up in the next hour must key on a different one.
func TestSlotStart_SameSlotAcrossWakeUps(t *testing.T) {
	loc := mustLoadLocation(t, "Asia/Makassar")

	firstWake := clock.Frozen{At: time.Date(2026, 3, 10, 22, 1, 0, 0, time.UTC)}    // 06:01 local
	secondWake := clock.Frozen{At: time.Date(2026, 3, 10, 22, 47, 0, 0, time.UTC)}  // 06:47 local, same slot
	nextHourWake := clock.Frozen{At: time.Date(2026, 3, 10, 23, 5, 0, 0, time.UTC)} // 07:05 local, next slot

	slotOne := domain.SlotStart(firstWake.Now().In(loc))
	slotTwo := domain.SlotStart(secondWake.Now().In(loc))
	slotThree := domain.SlotStart(nextHourWake.Now().In(loc))

	if !slotOne.Equal(slotTwo) {
		t.Fatalf("expected two wake-ups in the same local hour to share a slot key: %v vs %v", slotOne, slotTwo)
	}
	if slotOne.Equal(slotThree) {
		t.Fatalf("expected a wake-up in the next local hour to key a different slot, got %v for both", slotOne)
	}
}

func TestScheduleValidate(t *testing.T) {
	base := domain.Schedule{Recipients: []string{"a@example.com"}}

	cases := []struct {
		name    string
		mutate  func(*domain.Schedule)
		wantErr error
	}{
		{"invalid cadence", func(s *domain.Schedule) { s.Cadence = "yearly" }, domain.ErrInvalidCadence},
		{"invalid format", func(s *domain.Schedule) { s.Cadence = domain.CadenceDaily; s.Format = "docx" }, domain.ErrInvalidFormat},
		{"invalid hour", func(s *domain.Schedule) { s.Cadence = domain.CadenceDaily; s.Hour = 24 }, domain.ErrInvalidHour},
		{"weekly missing weekday", func(s *domain.Schedule) { s.Cadence = domain.CadenceWeekly }, domain.ErrInvalidWeekday},
		{"monthly missing day", func(s *domain.Schedule) { s.Cadence = domain.CadenceMonthly }, domain.ErrInvalidDayOfMonth},
		{"no recipients", func(s *domain.Schedule) { s.Cadence = domain.CadenceDaily; s.Recipients = nil }, domain.ErrNoRecipients},
		{
			"duplicate recipients",
			func(s *domain.Schedule) {
				s.Cadence = domain.CadenceDaily
				s.Recipients = []string{"a@example.com", "a@example.com"}
			},
			domain.ErrDuplicateRecipient,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := base
			tc.mutate(&s)
			err := s.Validate()
			if err != tc.wantErr {
				t.Fatalf("expected %v, got %v", tc.wantErr, err)
			}
		})
	}
}

// TestFormatWithDefault proves a schedule created before the format
// column existed (or a write that omits it) keeps rendering XLSX, its
// only format until the field was added.
func TestFormatWithDefault(t *testing.T) {
	if got := domain.Format("").WithDefault(); got != domain.FormatXLSX {
		t.Fatalf("expected %v, got %v", domain.FormatXLSX, got)
	}
	if got := domain.FormatPDF.WithDefault(); got != domain.FormatPDF {
		t.Fatalf("expected %v, got %v", domain.FormatPDF, got)
	}
}
