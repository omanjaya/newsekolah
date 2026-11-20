package domain_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
)

func TestResolveSaveWindow(t *testing.T) {
	sessionDate := time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC)
	periodEnd := time.Date(2026, 3, 2, 15, 15, 0, 0, time.UTC)

	tests := []struct {
		name    string
		in      domain.SaveWindowInput
		mode    domain.SaveMode
		wantErr error
	}{
		{
			name: "normal save before period end",
			in: domain.SaveWindowInput{
				Now: periodEnd.Add(-time.Hour), SessionDate: sessionDate, PeriodEndAt: periodEnd,
			},
			mode: domain.SaveModeNormal,
		},
		{
			name: "normal save before the lesson starts is rejected",
			in: domain.SaveWindowInput{
				Now: periodEnd.Add(-3 * time.Hour), SessionDate: sessionDate,
				PeriodStartAt: periodEnd.Add(-2 * time.Hour), PeriodEndAt: periodEnd, IsScheduleOwner: true,
			},
			mode:    domain.SaveModeNormal,
			wantErr: domain.ErrSessionNotStarted,
		},
		{
			name: "correction before the lesson starts is rejected too",
			in: domain.SaveWindowInput{
				Now: sessionDate.AddDate(0, 0, -3), SessionDate: sessionDate,
				PeriodStartAt: periodEnd.Add(-2 * time.Hour), PeriodEndAt: periodEnd,
				CorrectionDays: 7, IsGlobalCorrector: true,
			},
			mode:    domain.SaveModeCorrection,
			wantErr: domain.ErrSessionNotStarted,
		},
		{
			name: "normal save once the lesson has started",
			in: domain.SaveWindowInput{
				Now: periodEnd.Add(-2 * time.Hour), SessionDate: sessionDate,
				PeriodStartAt: periodEnd.Add(-2 * time.Hour), PeriodEndAt: periodEnd,
			},
			mode: domain.SaveModeNormal,
		},
		{
			name: "normal save after period end is rejected",
			in: domain.SaveWindowInput{
				Now: periodEnd.Add(time.Minute), SessionDate: sessionDate, PeriodEndAt: periodEnd,
			},
			mode:    domain.SaveModeNormal,
			wantErr: domain.ErrSaveWindowClosed,
		},
		{
			name: "correction by non-corrector is rejected regardless of timing",
			in: domain.SaveWindowInput{
				Now: sessionDate, SessionDate: sessionDate, PeriodEndAt: periodEnd,
				CorrectionDays: 7,
			},
			mode:    domain.SaveModeCorrection,
			wantErr: domain.ErrCorrectionNotAllowed,
		},
		{
			name: "global corrector within correction_days succeeds",
			in: domain.SaveWindowInput{
				Now: sessionDate.AddDate(0, 0, 3), SessionDate: sessionDate, PeriodEndAt: periodEnd,
				CorrectionDays: 7, IsGlobalCorrector: true,
			},
			mode: domain.SaveModeCorrection,
		},
		{
			name: "homeroom teacher within correction_days succeeds",
			in: domain.SaveWindowInput{
				Now: sessionDate.AddDate(0, 0, 7), SessionDate: sessionDate, PeriodEndAt: periodEnd,
				CorrectionDays: 7, IsHomeroomOfClass: true,
			},
			mode: domain.SaveModeCorrection,
		},
		{
			name: "correction after the window closes is rejected",
			in: domain.SaveWindowInput{
				Now: sessionDate.AddDate(0, 0, 9), SessionDate: sessionDate, PeriodEndAt: periodEnd,
				CorrectionDays: 7, IsGlobalCorrector: true,
			},
			mode:    domain.SaveModeCorrection,
			wantErr: domain.ErrCorrectionWindowClosed,
		},
		{
			name: "same day still counts as within the correction window",
			in: domain.SaveWindowInput{
				Now: sessionDate.Add(23 * time.Hour), SessionDate: sessionDate, PeriodEndAt: periodEnd,
				CorrectionDays: 0, IsGlobalCorrector: true,
			},
			mode: domain.SaveModeCorrection,
		},
		{
			name: "schedule owner may still save in normal mode after period end, until the correction deadline",
			in: domain.SaveWindowInput{
				Now: sessionDate.AddDate(0, 0, 3), SessionDate: sessionDate, PeriodEndAt: periodEnd,
				CorrectionDays: 7, IsScheduleOwner: true,
			},
			mode: domain.SaveModeNormal,
		},
		{
			name: "schedule owner past the correction deadline in normal mode is rejected",
			in: domain.SaveWindowInput{
				Now: sessionDate.AddDate(0, 0, 9), SessionDate: sessionDate, PeriodEndAt: periodEnd,
				CorrectionDays: 7, IsScheduleOwner: true,
			},
			mode:    domain.SaveModeNormal,
			wantErr: domain.ErrSaveWindowClosed,
		},
		{
			name: "non-owner in normal mode after period end is rejected even within the correction window",
			in: domain.SaveWindowInput{
				Now: sessionDate.AddDate(0, 0, 1), SessionDate: sessionDate, PeriodEndAt: periodEnd,
				CorrectionDays: 7, IsScheduleOwner: false,
			},
			mode:    domain.SaveModeNormal,
			wantErr: domain.ErrSaveWindowClosed,
		},
		{
			name: "a session dated after today cannot be saved ahead of the day",
			in: domain.SaveWindowInput{
				Now: sessionDate.AddDate(0, 0, -1).Add(10 * time.Hour), SessionDate: sessionDate, PeriodEndAt: periodEnd,
				CorrectionDays: 7, IsScheduleOwner: true,
			},
			mode:    domain.SaveModeNormal,
			wantErr: domain.ErrSessionNotStarted,
		},
		{
			name: "nor corrected ahead of the day",
			in: domain.SaveWindowInput{
				Now: sessionDate.AddDate(0, 0, -5), SessionDate: sessionDate, PeriodEndAt: periodEnd,
				CorrectionDays: 7, IsGlobalCorrector: true,
			},
			mode:    domain.SaveModeCorrection,
			wantErr: domain.ErrSessionNotStarted,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := domain.ResolveSaveWindow(tc.in, tc.mode)
			if tc.wantErr == nil {
				require.NoError(t, err)
				return
			}
			require.ErrorIs(t, err, tc.wantErr)
		})
	}
}

// TestCorrectionDeadlineFollowsTenantZone: a DATE column arrives as
// midnight UTC, but the deadline is the end of the day on the tenant's
// wall clock (audit S11): 21 Dec 23:59:59 WITA, not 07:59:59 the next
// morning.
func TestCorrectionDeadlineFollowsTenantZone(t *testing.T) {
	wita, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	sessionDate := time.Date(2026, 12, 14, 0, 0, 0, 0, time.UTC)
	periodEnd := time.Date(2026, 12, 14, 8, 30, 59, 0, wita)

	for _, tc := range []struct {
		name    string
		now     time.Time
		wantErr error
	}{
		{name: "last minute of the seventh day", now: time.Date(2026, 12, 21, 23, 59, 0, 0, wita)},
		{name: "the next morning in the tenant zone", now: time.Date(2026, 12, 22, 7, 55, 0, 0, wita), wantErr: domain.ErrCorrectionWindowClosed},
	} {
		t.Run(tc.name, func(t *testing.T) {
			in := domain.SaveWindowInput{
				Now: tc.now, SessionDate: sessionDate, PeriodEndAt: periodEnd, CorrectionDays: 7, IsHomeroomOfClass: true,
			}
			err := domain.ResolveSaveWindow(in, domain.SaveModeCorrection)
			if tc.wantErr == nil {
				require.NoError(t, err)
			} else {
				require.ErrorIs(t, err, tc.wantErr)
			}
			in.IsScheduleOwner = true
			err = domain.ResolveSaveWindow(in, domain.SaveModeNormal)
			if tc.wantErr == nil {
				require.NoError(t, err, "the owner's normal save has the same deadline")
			} else {
				require.ErrorIs(t, err, domain.ErrSaveWindowClosed)
			}
		})
	}

	// West of UTC the day must not slip back either.
	nyc, err := time.LoadLocation("America/New_York")
	require.NoError(t, err)
	deadline := domain.CorrectionDeadline(sessionDate, 0, nyc)
	require.Equal(t, time.Date(2026, 12, 14, 23, 59, 59, 0, nyc), deadline)
}

// TestEditableUntil: the editor is told when this viewer's save closes, so
// a locked session says so before anything is filled in (audit S20/T18).
func TestEditableUntil(t *testing.T) {
	wita, err := time.LoadLocation("Asia/Makassar")
	require.NoError(t, err)
	sessionDate := time.Date(2027, 1, 4, 0, 0, 0, 0, time.UTC)
	periodEnd := time.Date(2027, 1, 4, 8, 30, 59, 0, wita)
	deadline := time.Date(2027, 1, 11, 23, 59, 59, 0, wita)
	now := time.Date(2027, 1, 12, 9, 0, 0, 0, wita)
	base := domain.SaveWindowInput{Now: now, SessionDate: sessionDate, PeriodEndAt: periodEnd, CorrectionDays: 7}

	owner := base
	owner.IsScheduleOwner = true
	until, ok := domain.EditableUntil(owner, domain.SaveModeNormal)
	require.True(t, ok)
	require.True(t, until.Equal(deadline), "the owner keeps normal mode until the correction deadline")

	until, ok = domain.EditableUntil(base, domain.SaveModeNormal)
	require.True(t, ok)
	require.True(t, until.Equal(periodEnd), "anyone else's normal save ends with the lesson")

	_, ok = domain.EditableUntil(base, domain.SaveModeCorrection)
	require.False(t, ok, "only correctors may correct")

	homeroom := base
	homeroom.IsHomeroomOfClass = true
	until, ok = domain.EditableUntil(homeroom, domain.SaveModeCorrection)
	require.True(t, ok)
	require.True(t, until.Equal(deadline))
}
