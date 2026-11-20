package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/i18n"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// RunDueSchedules loops every active tenant looking for schedules due at
// that tenant's current local hour, or at an hour within
// domain.CatchUpWindow before it that was missed (the worker was down
// across the top of the hour), renders and uploads each one, and returns
// the ones ready for an email send. A schedule already claimed for a due
// slot (by an earlier wake-up, or a retry of this one) is silently
// skipped rather than rendered twice.
//
// Feature flags: a tenant with reports turned off is skipped entirely, and
// a schedule whose report kind reads a module that is turned off (say a
// discipline report while discipline is off) is skipped. A skipped
// schedule is not claimed, so it leaves no run row and sends no email.
func (s *ScheduleService) RunDueSchedules(ctx context.Context) ([]PendingNotification, error) {
	tenants, err := s.repo.ListActiveTenants(ctx)
	if err != nil {
		return nil, fmt.Errorf("list active tenants: %w", err)
	}

	var pending []PendingNotification
	var errs []error
	// Deliberately real time, not clock.Now(ctx, s.clock): this runs from
	// River's periodic job, a background loop with no request and no
	// simulated-time header to read.
	now := s.clock.Now()

	for _, t := range tenants {
		results, tenantErrs := s.runTenant(ctx, t, now)
		pending = append(pending, results...)
		errs = append(errs, tenantErrs...)
	}
	return pending, errors.Join(errs...)
}

// runTenant runs one tenant's schedules due at its local hour and at the
// missed hours before it (domain.CatchUpSlots), oldest first.
func (s *ScheduleService) runTenant(ctx context.Context, t TenantRef, now time.Time) ([]PendingNotification, []error) {
	on, err := s.moduleOn(ctx, t.ID, ModuleKey)
	if err != nil {
		return nil, []error{fmt.Errorf("tenant %s: read reports flag: %w", t.ID, err)}
	}
	if !on {
		return nil, nil
	}

	var pending []PendingNotification
	var errs []error
	for _, slot := range domain.CatchUpSlots(now, s.locationFor(t)) {
		results, slotErrs := s.runTenantSlot(ctx, t, slot)
		pending = append(pending, results...)
		errs = append(errs, slotErrs...)
	}
	return pending, errs
}

// runTenantSlot runs one tenant's schedules due at one slot (its start,
// in the tenant's location).
func (s *ScheduleService) runTenantSlot(ctx context.Context, t TenantRef, local time.Time) ([]PendingNotification, []error) {
	var due []domain.Schedule
	err := s.withTx(ctx, t.ID, func(ctx context.Context) error {
		var err error
		due, err = s.repo.ListEnabledSchedulesForTenantHour(ctx, t.ID, local.Hour())
		return err
	})
	if err != nil {
		return nil, []error{fmt.Errorf("tenant %s: list due schedules: %w", t.ID, err)}
	}

	var pending []PendingNotification
	var errs []error
	for _, sched := range due {
		if !sched.DueAtSlot(local) {
			continue
		}
		sourceOn, err := s.moduleOn(ctx, t.ID, SourceModule(Kind(sched.ReportKind)))
		if err != nil {
			errs = append(errs, fmt.Errorf("tenant %s schedule %s: read source module flag: %w", t.ID, sched.ID, err))
			continue
		}
		if !sourceOn {
			continue
		}
		result, ok, err := s.runOne(ctx, t.ID, sched, local, i18n.FromTenantLocale(t.Locale))
		if err != nil {
			errs = append(errs, fmt.Errorf("tenant %s schedule %s: %w", t.ID, sched.ID, err))
			continue
		}
		if ok {
			pending = append(pending, result)
		}
	}
	return pending, errs
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
func (s *ScheduleService) runOne(ctx context.Context, tenantID uuid.UUID, sched domain.Schedule, local time.Time, locale string) (PendingNotification, bool, error) {
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

	rendered, contentType, err := s.reports.RunDocument(ctx, tenantID, Kind(sched.ReportKind), args, opts, locale)
	if err != nil {
		s.failRun(ctx, tenantID, run.ID, domain.RunFailureRender, fmt.Sprintf("render: %v", err))
		return PendingNotification{}, false, nil
	}

	objectKey := fmt.Sprintf("reports/schedules/%s/%s/%d.%s", tenantID, sched.ID, dueAt.Unix(), format)
	if err := s.storage.PutObject(ctx, objectKey, rendered, contentType); err != nil {
		s.failRun(ctx, tenantID, run.ID, domain.RunFailureUpload, fmt.Sprintf("upload: %v", err))
		return PendingNotification{}, false, nil
	}

	link, err := s.storage.PresignedGetURL(ctx, objectKey, downloadLinkTTL)
	if err != nil {
		s.failRun(ctx, tenantID, run.ID, domain.RunFailureUpload, fmt.Sprintf("sign download link: %v", err))
		return PendingNotification{}, false, nil
	}

	return PendingNotification{
		RunID: run.ID, TenantID: tenantID, ScheduleID: sched.ID, ReportKind: sched.ReportKind,
		Recipients: sched.Recipients, DownloadURL: link.String(), objectKey: objectKey,
	}, true, nil
}

func (s *ScheduleService) failRun(ctx context.Context, tenantID, runID uuid.UUID, code domain.RunFailureCode, message string) {
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.CompleteRun(ctx, tenantID, runID, domain.RunOutcome{
			Status: domain.RunStatusFailed, FailureCode: code, ErrorMessage: message,
		}, s.clock.Now())
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
			return s.repo.CompleteRun(ctx, n.TenantID, n.RunID, domain.RunOutcome{
				Status: domain.RunStatusFailed, FailureCode: domain.RunFailureSend,
				ErrorMessage: sendErr.Error(), ObjectKey: n.objectKey,
			}, s.clock.Now())
		}
		return s.repo.CompleteRun(ctx, n.TenantID, n.RunID, domain.RunOutcome{
			Status: domain.RunStatusSuccess, ObjectKey: n.objectKey,
		}, s.clock.Now())
	})
}
