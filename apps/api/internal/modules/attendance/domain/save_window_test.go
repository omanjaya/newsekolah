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
