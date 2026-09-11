package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

type periodRepository interface {
	CreatePeriodTemplate(ctx context.Context, tenantID uuid.UUID, name string, isDefault bool) (domain.PeriodTemplate, error)
	UpdatePeriodTemplate(ctx context.Context, tenantID, id uuid.UUID, name string, isDefault bool) (domain.PeriodTemplate, error)
	GetPeriodTemplateByID(ctx context.Context, tenantID, id uuid.UUID) (domain.PeriodTemplate, error)
	GetDefaultPeriodTemplate(ctx context.Context, tenantID uuid.UUID) (domain.PeriodTemplate, error)
	ListPeriodTemplates(ctx context.Context, tenantID uuid.UUID) ([]domain.PeriodTemplate, error)
	DeletePeriodTemplate(ctx context.Context, tenantID, id uuid.UUID) error
	ClearDefaultPeriodTemplate(ctx context.Context, tenantID uuid.UUID) error
	CountWeekdayAssignmentsForTemplate(ctx context.Context, tenantID, id uuid.UUID) (int64, error)

	CreatePeriod(ctx context.Context, p domain.Period) (domain.Period, error)
	UpdatePeriod(ctx context.Context, p domain.Period) (domain.Period, error)
	GetPeriodByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Period, error)
	ListPeriodsByTemplate(ctx context.Context, tenantID, templateID uuid.UUID) ([]domain.Period, error)
	DeletePeriod(ctx context.Context, tenantID, id uuid.UUID) error

	UpsertWeekdayAssignment(ctx context.Context, a domain.WeekdayAssignment) error
	ListWeekdayAssignments(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.WeekdayAssignment, error)
	GetWeekdayAssignment(ctx context.Context, tenantID, yearID uuid.UUID, dayOfWeek int16) (domain.WeekdayAssignment, error)
}

func (s *Service) ListPeriodTemplates(ctx context.Context, tenantID uuid.UUID) ([]domain.PeriodTemplate, error) {
	var templates []domain.PeriodTemplate
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		templates, err = s.repo.ListPeriodTemplates(ctx, tenantID)
		return err
	})
	return templates, err
}

// CreatePeriodTemplate clears any existing default before setting a new
// one, so "is_default" is enforced application-side (the schema has no
// partial unique index for it, unlike is_active on academic_years).
func (s *Service) CreatePeriodTemplate(ctx context.Context, tenantID uuid.UUID, name string, isDefault bool) (domain.PeriodTemplate, error) {
	var template domain.PeriodTemplate
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if isDefault {
			if err := s.repo.ClearDefaultPeriodTemplate(ctx, tenantID); err != nil {
				return err
			}
		}
		var err error
		template, err = s.repo.CreatePeriodTemplate(ctx, tenantID, name, isDefault)
		return err
	})
	return template, err
}

func (s *Service) UpdatePeriodTemplate(ctx context.Context, tenantID, id uuid.UUID, name string, isDefault bool) (domain.PeriodTemplate, error) {
	var template domain.PeriodTemplate
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if isDefault {
			if err := s.repo.ClearDefaultPeriodTemplate(ctx, tenantID); err != nil {
				return err
			}
		}
		var err error
		template, err = s.repo.UpdatePeriodTemplate(ctx, tenantID, id, name, isDefault)
		return mapNotFound(err, domain.ErrPeriodTemplateNotFound)
	})
	return template, err
}

// DeletePeriodTemplate refuses to remove a template a weekday still points
// to (409 ACADEMIC_HAS_DEPENDENTS); its periods cascade at the database
// level once that check passes.
func (s *Service) DeletePeriodTemplate(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		count, err := s.repo.CountWeekdayAssignmentsForTemplate(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if count > 0 {
			return domain.ErrHasDependents
		}
		return s.repo.DeletePeriodTemplate(ctx, tenantID, id)
	})
}

func (s *Service) GetPeriod(ctx context.Context, tenantID, id uuid.UUID) (domain.Period, error) {
	var period domain.Period
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		period, err = s.repo.GetPeriodByID(ctx, tenantID, id)
		return mapNotFound(err, domain.ErrPeriodNotFound)
	})
	return period, err
}

func (s *Service) ListPeriods(ctx context.Context, tenantID, templateID uuid.UUID) ([]domain.Period, error) {
	var periods []domain.Period
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		periods, err = s.repo.ListPeriodsByTemplate(ctx, tenantID, templateID)
		return err
	})
	return periods, err
}

func (s *Service) CreatePeriod(ctx context.Context, p domain.Period) (domain.Period, error) {
	if err := domain.ValidatePeriodTimes(p.StartsAt, p.EndsAt); err != nil {
		return domain.Period{}, err
	}
	var period domain.Period
	err := s.withTx(ctx, p.TenantID, func(ctx context.Context) error {
		var err error
		period, err = s.repo.CreatePeriod(ctx, p)
		return mapUniqueViolation(err, domain.ErrPeriodSequenceTaken)
	})
	return period, err
}

func (s *Service) UpdatePeriod(ctx context.Context, p domain.Period) (domain.Period, error) {
	if err := domain.ValidatePeriodTimes(p.StartsAt, p.EndsAt); err != nil {
		return domain.Period{}, err
	}
	var period domain.Period
	err := s.withTx(ctx, p.TenantID, func(ctx context.Context) error {
		var err error
		period, err = s.repo.UpdatePeriod(ctx, p)
		return mapNotFound(mapUniqueViolation(err, domain.ErrPeriodSequenceTaken), domain.ErrPeriodNotFound)
	})
	return period, err
}

// DeletePeriod maps the schedules table's "on delete restrict" foreign key
// (start_period_id / end_period_id) to the same 409 ACADEMIC_HAS_DEPENDENTS
// every other "still referenced" deletion in this module returns, instead
// of letting the raw constraint violation fall through as a 500.
func (s *Service) DeletePeriod(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return mapForeignKeyViolation(s.repo.DeletePeriod(ctx, tenantID, id), domain.ErrHasDependents)
	})
}

func (s *Service) ListWeekdayAssignments(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.WeekdayAssignment, error) {
	var assignments []domain.WeekdayAssignment
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		assignments, err = s.repo.ListWeekdayAssignments(ctx, tenantID, yearID)
		return err
	})
	return assignments, err
}

func (s *Service) SetWeekdayAssignment(ctx context.Context, tenantID, yearID, templateID uuid.UUID, dayOfWeek int16) error {
	if err := domain.ValidateDayOfWeek(dayOfWeek); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.UpsertWeekdayAssignment(ctx, domain.WeekdayAssignment{
			TenantID: tenantID, AcademicYearID: yearID, DayOfWeek: dayOfWeek, TemplateID: templateID,
		})
	})
}

// PeriodsToday resolves which period is in session right now: the weekday
// assignment picks the template in effect for dayOfWeek, and
// domain.CurrentPeriod finds the period whose window contains now. The
// caller (transport) resolves dayOfWeek and now in the tenant's timezone
// via platform/clock before calling this -- the service stays timezone-
// agnostic, working only in wall-clock terms.
func (s *Service) PeriodsToday(ctx context.Context, tenantID, yearID uuid.UUID, dayOfWeek int16, now domain.ClockTime) (domain.Period, bool, error) {
	var (
		period domain.Period
		found  bool
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		assignment, err := s.repo.GetWeekdayAssignment(ctx, tenantID, yearID, dayOfWeek)
		if err != nil {
			return nil // no template assigned to this weekday: not found, not an error
		}
		periods, err := s.repo.ListPeriodsByTemplate(ctx, tenantID, assignment.TemplateID)
		if err != nil {
			return err
		}
		period, found = domain.CurrentPeriod(periods, now)
		return nil
	})
	return period, found, err
}
