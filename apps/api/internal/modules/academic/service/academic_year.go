package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

// yearRepository is the data-access boundary for academic years, terms,
// the calendar, and school days. academic_years already has a writer in
// modules/school (used there to scope duty-derived permissions); this
// module owns its own queries against the same table for the HTTP surface
// this scope requires (list/create/update/activate/archive), per the
// module's ownership notes -- the unique partial index on is_active still
// guarantees at most one active year regardless of which module writes it.
type yearRepository interface {
	CreateYear(ctx context.Context, tenantID uuid.UUID, label string, startsOn, endsOn time.Time) (domain.AcademicYear, error)
	UpdateYear(ctx context.Context, tenantID, id uuid.UUID, label string, startsOn, endsOn time.Time) (domain.AcademicYear, error)
	GetYearByID(ctx context.Context, tenantID, id uuid.UUID) (domain.AcademicYear, error)
	GetActiveYear(ctx context.Context, tenantID uuid.UUID) (domain.AcademicYear, bool, error)
	ListYears(ctx context.Context, tenantID uuid.UUID, search string, includeArchived bool, page Page) ([]domain.AcademicYear, int64, error)
	DeactivateAllYears(ctx context.Context, tenantID uuid.UUID) error
	ActivateYear(ctx context.Context, tenantID, id uuid.UUID) error
	ArchiveYear(ctx context.Context, tenantID, id uuid.UUID) error
	CountClassesForYear(ctx context.Context, tenantID, yearID uuid.UUID) (int64, error)
	CountEnrollmentsForYear(ctx context.Context, tenantID, yearID uuid.UUID) (int64, error)

	CreateTerm(ctx context.Context, t domain.Term) (domain.Term, error)
	UpdateTerm(ctx context.Context, tenantID, id uuid.UUID, name string, startsOn, endsOn time.Time) (domain.Term, error)
	GetTermByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Term, error)
	ListTermsByYear(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.Term, error)
	DeleteTerm(ctx context.Context, tenantID, id uuid.UUID) error
	ActivateTerm(ctx context.Context, tenantID, id, yearID uuid.UUID) error

	CreateCalendarEvent(ctx context.Context, e domain.CalendarEvent) (domain.CalendarEvent, error)
	UpdateCalendarEvent(ctx context.Context, tenantID, id uuid.UUID, date, endDate time.Time, kind, name string, gradeLevelIDs []uuid.UUID) (domain.CalendarEvent, error)
	GetCalendarEventByID(ctx context.Context, tenantID, id uuid.UUID) (domain.CalendarEvent, error)
	DeleteCalendarEvent(ctx context.Context, tenantID, id uuid.UUID) error
	ListCalendarEvents(ctx context.Context, tenantID, yearID uuid.UUID, kind string, page Page) ([]domain.CalendarEvent, int64, error)
	ListCalendarEventsForDate(ctx context.Context, tenantID, yearID uuid.UUID, date time.Time) ([]domain.CalendarEvent, error)

	UpsertSchoolDay(ctx context.Context, tenantID, yearID uuid.UUID, dayOfWeek int16, isActive bool) error
	ListSchoolDays(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.SchoolDay, error)
}

// policyRepository reads tenant_policies (owned by the platform/tenant
// domain) read-only, for the "calendar.terms" policy that decides how many
// terms to seed for a new academic year.
type policyRepository interface {
	GetCalendarPolicyConfig(ctx context.Context, tenantID uuid.UUID, asOf time.Time) ([]byte, bool, error)
}

// CreateAcademicYear validates the period, creates the year, and seeds its
// terms from the tenant's "calendar.terms" policy (default two semesters),
// all in one transaction.
func (s *Service) CreateAcademicYear(ctx context.Context, tenantID uuid.UUID, label string, startsOn, endsOn time.Time) (domain.AcademicYear, error) {
	if err := domain.ValidatePeriod(startsOn, endsOn); err != nil {
		return domain.AcademicYear{}, err
	}
	if err := domain.ValidateMaxLength(label, domain.MaxAcademicYearLabelLength); err != nil {
		return domain.AcademicYear{}, err
	}

	var year domain.AcademicYear
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		year, err = s.repo.CreateYear(ctx, tenantID, label, startsOn, endsOn)
		if err != nil {
			return mapCheckViolation(mapUniqueViolation(err, domain.ErrAcademicYearNameExists), domain.ErrFieldTooLong)
		}

		termCount := s.termCountPolicy(ctx, tenantID)
		for _, t := range domain.BuildDefaultTerms(year.ID, tenantID, startsOn, endsOn, termCount) {
			if _, err := s.repo.CreateTerm(ctx, t); err != nil {
				return err
			}
		}
		return nil
	})
	return year, err
}

// termCountPolicy reads the tenant's "calendar" policy config for a
// "terms" integer field, defaulting to domain.DefaultTermCount (two
// semesters) when the policy is absent or malformed -- seeding terms
// should never block year creation.
func (s *Service) termCountPolicy(ctx context.Context, tenantID uuid.UUID) int {
	raw, ok, err := s.repo.GetCalendarPolicyConfig(ctx, tenantID, s.clock.Now())
	if err != nil || !ok {
		return domain.DefaultTermCount
	}
	var cfg struct {
		Terms int `json:"terms"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil || cfg.Terms <= 0 {
		return domain.DefaultTermCount
	}
	return cfg.Terms
}

// UpdateAcademicYear checks the year exists and is not archived before
// writing: the update query itself filters out archived rows
// (archived_at is null), so without this check both "no such year" and
// "year is archived" would surface as the same pgx.ErrNoRows -- and the
// caller needs to tell a 404 (recreate the request with a valid id) apart
// from a 409 (the id is valid but the year is closed to edits).
func (s *Service) UpdateAcademicYear(ctx context.Context, tenantID, id uuid.UUID, label string, startsOn, endsOn time.Time) (domain.AcademicYear, error) {
	if err := domain.ValidatePeriod(startsOn, endsOn); err != nil {
		return domain.AcademicYear{}, err
	}
	if err := domain.ValidateMaxLength(label, domain.MaxAcademicYearLabelLength); err != nil {
		return domain.AcademicYear{}, err
	}
	var year domain.AcademicYear
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		existing, err := s.repo.GetYearByID(ctx, tenantID, id)
		if err != nil {
			return mapNotFound(err, domain.ErrAcademicYearNotFound)
		}
		if existing.IsArchived() {
			return domain.ErrAcademicYearArchived
		}
		year, err = s.repo.UpdateYear(ctx, tenantID, id, label, startsOn, endsOn)
		return mapNotFound(mapCheckViolation(mapUniqueViolation(err, domain.ErrAcademicYearNameExists), domain.ErrFieldTooLong), domain.ErrAcademicYearNotFound)
	})
	return year, err
}

// requireYearNotArchived refuses a mutation scoped to an archived academic
// year: classes, enrollments, teaching assignments, and schedules must not
// be created or changed once a year is closed, the same rule
// UpdateAcademicYear enforces on the year record itself. Called from every
// other service file in this module (Service.repo already satisfies
// yearRepository through the module-wide Repository union), so it lives
// here alongside the rest of the year lifecycle rules.
func (s *Service) requireYearNotArchived(ctx context.Context, tenantID, yearID uuid.UUID) error {
	year, err := s.repo.GetYearByID(ctx, tenantID, yearID)
	if err != nil {
		return mapNotFound(err, domain.ErrAcademicYearNotFound)
	}
	if year.IsArchived() {
		return domain.ErrAcademicYearArchived
	}
	return nil
}

func (s *Service) GetAcademicYear(ctx context.Context, tenantID, id uuid.UUID) (domain.AcademicYear, error) {
	var year domain.AcademicYear
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		year, err = s.repo.GetYearByID(ctx, tenantID, id)
		return mapNotFound(err, domain.ErrAcademicYearNotFound)
	})
	return year, err
}

func (s *Service) ListAcademicYears(ctx context.Context, tenantID uuid.UUID, search string, includeArchived bool, page Page) ([]domain.AcademicYear, int64, error) {
	page = normalizePage(page)
	var (
		years []domain.AcademicYear
		total int64
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		years, total, err = s.repo.ListYears(ctx, tenantID, search, includeArchived, page)
		return err
	})
	return years, total, err
}

// ActivateAcademicYear guarantees at most one active academic year per
// tenant: it deactivates every other year before activating the requested
// one, in the same transaction.
func (s *Service) ActivateAcademicYear(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		year, err := s.repo.GetYearByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrAcademicYearNotFound
		}
		if year.IsArchived() {
			return domain.ErrAcademicYearArchived
		}
		if err := s.repo.DeactivateAllYears(ctx, tenantID); err != nil {
			return err
		}
		return s.repo.ActivateYear(ctx, tenantID, id)
	})
}

// ArchiveAcademicYear closes out a year: it must not be the active year,
// and it can never contain the tenant's only class/enrollment history that
// is still being edited, so this only flips the flag -- classes and
// enrollments already carry their own academic_year_id and are untouched.
func (s *Service) ArchiveAcademicYear(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		year, err := s.repo.GetYearByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrAcademicYearNotFound
		}
		if year.IsActive {
			return domain.ErrHasDependents
		}
		return s.repo.ArchiveYear(ctx, tenantID, id)
	})
}

func (s *Service) ListTerms(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.Term, error) {
	var terms []domain.Term
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		terms, err = s.repo.ListTermsByYear(ctx, tenantID, yearID)
		return err
	})
	return terms, err
}

func (s *Service) CreateTerm(ctx context.Context, tenantID, yearID uuid.UUID, name string, sequence int16, startsOn, endsOn time.Time) (domain.Term, error) {
	if err := domain.ValidatePeriod(startsOn, endsOn); err != nil {
		return domain.Term{}, err
	}
	if err := domain.ValidateMaxLength(name, domain.MaxTermNameLength); err != nil {
		return domain.Term{}, err
	}
	var term domain.Term
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		term, err = s.repo.CreateTerm(ctx, domain.Term{
			TenantID: tenantID, AcademicYearID: yearID, Name: name, Sequence: sequence, StartsOn: startsOn, EndsOn: endsOn,
		})
		return mapCheckViolation(mapUniqueViolation(err, domain.ErrTermSequenceTaken), domain.ErrFieldTooLong)
	})
	return term, err
}

func (s *Service) UpdateTerm(ctx context.Context, tenantID, id uuid.UUID, name string, startsOn, endsOn time.Time) (domain.Term, error) {
	if err := domain.ValidatePeriod(startsOn, endsOn); err != nil {
		return domain.Term{}, err
	}
	if err := domain.ValidateMaxLength(name, domain.MaxTermNameLength); err != nil {
		return domain.Term{}, err
	}
	var term domain.Term
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		term, err = s.repo.UpdateTerm(ctx, tenantID, id, name, startsOn, endsOn)
		return mapNotFound(mapCheckViolation(err, domain.ErrFieldTooLong), domain.ErrTermNotFound)
	})
	return term, err
}

func (s *Service) DeleteTerm(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteTerm(ctx, tenantID, id)
	})
}

// ActivateTerm guarantees at most one active term per academic year, the
// same single-active pattern used for academic years.
func (s *Service) ActivateTerm(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		term, err := s.repo.GetTermByID(ctx, tenantID, id)
		if err != nil {
			return domain.ErrTermNotFound
		}
		return s.repo.ActivateTerm(ctx, tenantID, id, term.AcademicYearID)
	})
}

func (s *Service) ListCalendarEvents(ctx context.Context, tenantID, yearID uuid.UUID, kind string, page Page) ([]domain.CalendarEvent, int64, error) {
	page = normalizePage(page)
	var (
		events []domain.CalendarEvent
		total  int64
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		events, total, err = s.repo.ListCalendarEvents(ctx, tenantID, yearID, kind, page)
		return err
	})
	return events, total, err
}

func (s *Service) CreateCalendarEvent(ctx context.Context, tenantID, yearID uuid.UUID, date, endDate time.Time, kind, name string, gradeLevelIDs []uuid.UUID) (domain.CalendarEvent, error) {
	if err := domain.ValidateCalendarEventRange(date, endDate); err != nil {
		return domain.CalendarEvent{}, err
	}
	if err := domain.ValidateMaxLength(name, domain.MaxCalendarEventNameLength); err != nil {
		return domain.CalendarEvent{}, err
	}
	var event domain.CalendarEvent
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		event, err = s.repo.CreateCalendarEvent(ctx, domain.CalendarEvent{
			TenantID: tenantID, AcademicYearID: yearID, Date: date, EndDate: endDate, Kind: kind, Name: name, GradeLevelIDs: gradeLevelIDs,
		})
		return mapCheckViolation(err, domain.ErrFieldTooLong)
	})
	return event, err
}

func (s *Service) UpdateCalendarEvent(ctx context.Context, tenantID, id uuid.UUID, date, endDate time.Time, kind, name string, gradeLevelIDs []uuid.UUID) (domain.CalendarEvent, error) {
	if err := domain.ValidateCalendarEventRange(date, endDate); err != nil {
		return domain.CalendarEvent{}, err
	}
	if err := domain.ValidateMaxLength(name, domain.MaxCalendarEventNameLength); err != nil {
		return domain.CalendarEvent{}, err
	}
	var event domain.CalendarEvent
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		event, err = s.repo.UpdateCalendarEvent(ctx, tenantID, id, date, endDate, kind, name, gradeLevelIDs)
		return mapNotFound(mapCheckViolation(err, domain.ErrFieldTooLong), domain.ErrCalendarEventNotFound)
	})
	return event, err
}

// IsSchoolDay answers whether date is a teaching day in yearID, for
// gradeLevelID (pass nil for a whole-school check): the weekly pattern
// (school_days) combined with the year's calendar events, via the single
// domain.IsSchoolDay rule. This is the method the CalendarReader interface
// (readers.go) exposes to other modules, e.g. attendance's daily-status
// algorithm.
func (s *Service) IsSchoolDay(ctx context.Context, tenantID, yearID uuid.UUID, date time.Time, gradeLevelID *uuid.UUID) (bool, error) {
	var result bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		days, err := s.repo.ListSchoolDays(ctx, tenantID, yearID)
		if err != nil {
			return err
		}
		weeklyActive := false
		dayOfWeek := domain.IsoWeekday(date)
		for _, d := range days {
			if d.DayOfWeek == dayOfWeek {
				weeklyActive = d.IsActive
				break
			}
		}

		events, err := s.repo.ListCalendarEventsForDate(ctx, tenantID, yearID, date)
		if err != nil {
			return err
		}

		result = domain.IsSchoolDay(date, weeklyActive, events, gradeLevelID)
		return nil
	})
	return result, err
}

// NonTeachingEventName is IsSchoolDay's counterpart for display: names the
// holiday/no-school-day/semester-break event covering date, if any -- see
// domain.NonTeachingEventName. The CalendarReader interface (readers.go)
// exposes this to other modules the same way IsSchoolDay is exposed.
func (s *Service) NonTeachingEventName(ctx context.Context, tenantID, yearID uuid.UUID, date time.Time, gradeLevelID *uuid.UUID) (string, bool, error) {
	var (
		name  string
		found bool
	)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		events, err := s.repo.ListCalendarEventsForDate(ctx, tenantID, yearID, date)
		if err != nil {
			return err
		}
		name, found = domain.NonTeachingEventName(date, events, gradeLevelID)
		return nil
	})
	return name, found, err
}

func (s *Service) DeleteCalendarEvent(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteCalendarEvent(ctx, tenantID, id)
	})
}

func (s *Service) ListSchoolDays(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.SchoolDay, error) {
	var days []domain.SchoolDay
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		days, err = s.repo.ListSchoolDays(ctx, tenantID, yearID)
		return err
	})
	return days, err
}

func (s *Service) SetSchoolDay(ctx context.Context, tenantID, yearID uuid.UUID, dayOfWeek int16, isActive bool) error {
	if err := domain.ValidateDayOfWeek(dayOfWeek); err != nil {
		return err
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.UpsertSchoolDay(ctx, tenantID, yearID, dayOfWeek, isActive)
	})
}
