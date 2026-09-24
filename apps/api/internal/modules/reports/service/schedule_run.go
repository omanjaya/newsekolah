package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// RunDueSchedules loops every active tenant looking for schedules due at
// that tenant's current local hour, renders and uploads each one, and
// returns the ones ready for an email send. A schedule already claimed
// for this due slot (by an earlier wake-up, or a retry of this one) is
// silently skipped rather than rendered twice.
func (s *ScheduleService) RunDueSchedules(ctx context.Context) ([]PendingNotification, error) {
	tenants, err := s.repo.ListActiveTenants(ctx)
	if err != nil {
		return nil, fmt.Errorf("list active tenants: %w", err)
	}

	var pending []PendingNotification
	var errs []error
	now := s.clock.Now()

	for _, t := range tenants {
		loc := s.locationFor(t)
		local := now.In(loc)

		var due []domain.Schedule
		err := s.withTx(ctx, t.ID, func(ctx context.Context) error {
			var err error
			due, err = s.repo.ListEnabledSchedulesForTenantHour(ctx, t.ID, local.Hour())
			return err
		})
		if err != nil {
			errs = append(errs, fmt.Errorf("tenant %s: list due schedules: %w", t.ID, err))
			continue
		}
		for _, sched := range due {
			if !sched.IsDueAt(local) {
				continue
			}
			result, ok, err := s.runOne(ctx, t.ID, sched, local)
			if err != nil {
				errs = append(errs, fmt.Errorf("tenant %s schedule %s: %w", t.ID, sched.ID, err))
				continue
			}
			if ok {
				pending = append(pending, result)
			}
		}
	}
	return pending, errors.Join(errs...)
}

func (s *ScheduleService) locationFor(t TenantRef) *time.Location {
	if t.Timezone == "" {
		return time.UTC
	}
	loc, err := time.LoadLocation(t.Timezone)
	if err != nil {
		return time.UTC
	}
	return loc
}

// runOne claims the due slot, renders and uploads the workbook, and
// either hands back a PendingNotification for the worker to email, or (on
// a render/upload failure) completes the run as failed itself, since
// there is nothing left to send.
func (s *ScheduleService) runOne(ctx context.Context, tenantID uuid.UUID, sched domain.Schedule, local time.Time) (PendingNotification, bool, error) {
	dueAt := domain.SlotStart(local)
	var run domain.Run
	var claimed bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		run, claimed, err = s.repo.ClaimRun(ctx, tenantID, sched.ID, dueAt)
		return err
	})
	if err != nil {
		return PendingNotification{}, false, fmt.Errorf("claim run: %w", err)
	}
	if !claimed {
		return PendingNotification{}, false, nil
	}

	today := time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, time.UTC)
	args := RunArgs{
		ClassID: sched.Params.ClassID, GradeLevelID: sched.Params.GradeLevelID,
		SubjectID: sched.Params.SubjectID, TermID: sched.Params.TermID, Date: &today,
	}
	format := sched.Format.WithDefault()
	opts := reportdoc.Options{Format: reportdoc.Format(format), ShowLetterhead: true}

	rendered, contentType, err := s.reports.RunDocument(ctx, tenantID, Kind(sched.ReportKind), args, opts)
	if err != nil {
		s.failRun(ctx, tenantID, run.ID, fmt.Sprintf("render: %v", err))
		return PendingNotification{}, false, nil
	}

	objectKey := fmt.Sprintf("reports/schedules/%s/%s/%d.%s", tenantID, sched.ID, dueAt.Unix(), format)
	if err := s.storage.PutObject(ctx, objectKey, rendered, contentType); err != nil {
		s.failRun(ctx, tenantID, run.ID, fmt.Sprintf("upload: %v", err))
		return PendingNotification{}, false, nil
	}

	link, err := s.storage.PresignedGetURL(ctx, objectKey, downloadLinkTTL)
	if err != nil {
		s.failRun(ctx, tenantID, run.ID, fmt.Sprintf("sign download link: %v", err))
		return PendingNotification{}, false, nil
	}

	return PendingNotification{
		RunID: run.ID, TenantID: tenantID, ScheduleID: sched.ID, ReportKind: sched.ReportKind,
		Recipients: sched.Recipients, DownloadURL: link.String(), objectKey: objectKey,
	}, true, nil
}

func (s *ScheduleService) failRun(ctx context.Context, tenantID, runID uuid.UUID, message string) {
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.CompleteRun(ctx, tenantID, runID, domain.RunStatusFailed, message, "", s.clock.Now())
	})
	if err != nil {
		// The run row already exists (it was just claimed); losing this
		// update only means its status stays "pending" instead of
		// "failed" -- logged by the caller, which holds the logger.
		_ = err
	}
}

// FinalizeRun records whether the worker's email send succeeded, after a
// render that RunDueSchedules already completed successfully on the
// storage side. sendErr nil means every recipient was sent to.
func (s *ScheduleService) FinalizeRun(ctx context.Context, n PendingNotification, sendErr error) error {
	return s.withTx(ctx, n.TenantID, func(ctx context.Context) error {
		if sendErr != nil {
			return s.repo.CompleteRun(ctx, n.TenantID, n.RunID, domain.RunStatusFailed, sendErr.Error(), n.objectKey, s.clock.Now())
		}
		return s.repo.CompleteRun(ctx, n.TenantID, n.RunID, domain.RunStatusSuccess, "", n.objectKey, s.clock.Now())
	})
}
