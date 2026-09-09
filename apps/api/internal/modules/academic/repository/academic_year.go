package repository

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateYear(ctx context.Context, tenantID uuid.UUID, label string, startsOn, endsOn time.Time) (domain.AcademicYear, error) {
	row, err := r.queries(ctx).AcademicCreateYear(ctx, db.AcademicCreateYearParams{
		TenantID: tenantID, Label: label, StartsOn: pdatabase.Date(startsOn), EndsOn: pdatabase.Date(endsOn),
	})
	if err != nil {
		return domain.AcademicYear{}, err
	}
	return toAcademicYear(row), nil
}

func (r *Repository) UpdateYear(ctx context.Context, tenantID, id uuid.UUID, label string, startsOn, endsOn time.Time) (domain.AcademicYear, error) {
	row, err := r.queries(ctx).AcademicUpdateYear(ctx, db.AcademicUpdateYearParams{
		TenantID: tenantID, ID: id, Label: label, StartsOn: pdatabase.Date(startsOn), EndsOn: pdatabase.Date(endsOn),
	})
	if err != nil {
		return domain.AcademicYear{}, err
	}
	return toAcademicYear(row), nil
}

func (r *Repository) GetYearByID(ctx context.Context, tenantID, id uuid.UUID) (domain.AcademicYear, error) {
	row, err := r.queries(ctx).AcademicGetYearByID(ctx, db.AcademicGetYearByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.AcademicYear{}, err
	}
	return toAcademicYear(row), nil
}

func (r *Repository) GetActiveYear(ctx context.Context, tenantID uuid.UUID) (domain.AcademicYear, bool, error) {
	row, err := r.queries(ctx).AcademicGetActiveYear(ctx, tenantID)
	if err != nil {
		return domain.AcademicYear{}, false, nil //nolint:nilerr // "no active year" is a valid, common state
	}
	return toAcademicYear(row), true, nil
}

func (r *Repository) ListYears(ctx context.Context, tenantID uuid.UUID, search string, includeArchived bool, page service.Page) ([]domain.AcademicYear, int64, error) {
	rows, err := r.queries(ctx).AcademicListYears(ctx, db.AcademicListYearsParams{
		TenantID: tenantID, Limit: page.Limit, Offset: page.Offset,
		Search: pdatabase.Text(search), IncludeArchived: includeArchived,
	})
	if err != nil {
		return nil, 0, err
	}
	years := make([]domain.AcademicYear, len(rows))
	var total int64
	for i, row := range rows {
		years[i] = toAcademicYear(row.AcademicYear)
		total = row.TotalCount
	}
	return years, total, nil
}

func (r *Repository) DeactivateAllYears(ctx context.Context, tenantID uuid.UUID) error {
	return r.queries(ctx).AcademicDeactivateAllYears(ctx, tenantID)
}

func (r *Repository) ActivateYear(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).AcademicActivateYear(ctx, db.AcademicActivateYearParams{TenantID: tenantID, ID: id})
}

func (r *Repository) ArchiveYear(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).AcademicArchiveYear(ctx, db.AcademicArchiveYearParams{TenantID: tenantID, ID: id})
}

func (r *Repository) CountClassesForYear(ctx context.Context, tenantID, yearID uuid.UUID) (int64, error) {
	return r.queries(ctx).AcademicCountClassesForYear(ctx, db.AcademicCountClassesForYearParams{TenantID: tenantID, AcademicYearID: yearID})
}

func (r *Repository) CountEnrollmentsForYear(ctx context.Context, tenantID, yearID uuid.UUID) (int64, error) {
	return r.queries(ctx).AcademicCountEnrollmentsForYear(ctx, db.AcademicCountEnrollmentsForYearParams{TenantID: tenantID, AcademicYearID: yearID})
}

func (r *Repository) CreateTerm(ctx context.Context, t domain.Term) (domain.Term, error) {
	row, err := r.queries(ctx).AcademicCreateTerm(ctx, db.AcademicCreateTermParams{
		TenantID: t.TenantID, AcademicYearID: t.AcademicYearID, Name: t.Name, Sequence: t.Sequence,
		StartsOn: pdatabase.Date(t.StartsOn), EndsOn: pdatabase.Date(t.EndsOn),
	})
	if err != nil {
		return domain.Term{}, err
	}
	return toTerm(row), nil
}

func (r *Repository) UpdateTerm(ctx context.Context, tenantID, id uuid.UUID, name string, startsOn, endsOn time.Time) (domain.Term, error) {
	row, err := r.queries(ctx).AcademicUpdateTerm(ctx, db.AcademicUpdateTermParams{
		TenantID: tenantID, ID: id, Name: name, StartsOn: pdatabase.Date(startsOn), EndsOn: pdatabase.Date(endsOn),
	})
	if err != nil {
		return domain.Term{}, err
	}
	return toTerm(row), nil
}

func (r *Repository) GetTermByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Term, error) {
	row, err := r.queries(ctx).AcademicGetTermByID(ctx, db.AcademicGetTermByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.Term{}, err
	}
	return toTerm(row), nil
}

func (r *Repository) ListTermsByYear(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.Term, error) {
	rows, err := r.queries(ctx).AcademicListTermsByYear(ctx, db.AcademicListTermsByYearParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, err
	}
	terms := make([]domain.Term, len(rows))
	for i, row := range rows {
		terms[i] = toTerm(row)
	}
	return terms, nil
}

func (r *Repository) DeleteTerm(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).AcademicDeleteTerm(ctx, db.AcademicDeleteTermParams{TenantID: tenantID, ID: id})
}

func (r *Repository) ActivateTerm(ctx context.Context, tenantID, id, yearID uuid.UUID) error {
	q := r.queries(ctx)
	if err := q.AcademicDeactivateAllTermsForYear(ctx, db.AcademicDeactivateAllTermsForYearParams{TenantID: tenantID, AcademicYearID: yearID}); err != nil {
		return err
	}
	return q.AcademicActivateTerm(ctx, db.AcademicActivateTermParams{TenantID: tenantID, ID: id})
}

func (r *Repository) CreateCalendarEvent(ctx context.Context, e domain.CalendarEvent) (domain.CalendarEvent, error) {
	row, err := r.queries(ctx).AcademicCreateCalendarEvent(ctx, db.AcademicCreateCalendarEventParams{
		TenantID: e.TenantID, AcademicYearID: e.AcademicYearID,
		Date: pdatabase.Date(e.Date), EndDate: pdatabase.Date(e.EndDate), Kind: e.Kind, Name: e.Name,
	})
	if err != nil {
		return domain.CalendarEvent{}, err
	}
	if err := r.replaceCalendarEventGradeLevels(ctx, e.TenantID, row.ID, e.GradeLevelIDs); err != nil {
		return domain.CalendarEvent{}, err
	}
	event := toCalendarEvent(row)
	event.GradeLevelIDs = e.GradeLevelIDs
	return event, nil
}

func (r *Repository) UpdateCalendarEvent(ctx context.Context, tenantID, id uuid.UUID, date, endDate time.Time, kind, name string, gradeLevelIDs []uuid.UUID) (domain.CalendarEvent, error) {
	row, err := r.queries(ctx).AcademicUpdateCalendarEvent(ctx, db.AcademicUpdateCalendarEventParams{
		TenantID: tenantID, ID: id, Date: pdatabase.Date(date), EndDate: pdatabase.Date(endDate), Kind: kind, Name: name,
	})
	if err != nil {
		return domain.CalendarEvent{}, err
	}
	if err := r.replaceCalendarEventGradeLevels(ctx, tenantID, id, gradeLevelIDs); err != nil {
		return domain.CalendarEvent{}, err
	}
	event := toCalendarEvent(row)
	event.GradeLevelIDs = gradeLevelIDs
	return event, nil
}

func (r *Repository) replaceCalendarEventGradeLevels(ctx context.Context, tenantID, eventID uuid.UUID, gradeLevelIDs []uuid.UUID) error {
	q := r.queries(ctx)
	if err := q.AcademicReplaceCalendarEventGradeLevels(ctx, db.AcademicReplaceCalendarEventGradeLevelsParams{
		TenantID: tenantID, CalendarEventID: eventID,
	}); err != nil {
		return err
	}
	for _, gradeLevelID := range gradeLevelIDs {
		if err := q.AcademicAddCalendarEventGradeLevel(ctx, db.AcademicAddCalendarEventGradeLevelParams{
			TenantID: tenantID, CalendarEventID: eventID, GradeLevelID: gradeLevelID,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) GetCalendarEventByID(ctx context.Context, tenantID, id uuid.UUID) (domain.CalendarEvent, error) {
	row, err := r.queries(ctx).AcademicGetCalendarEventByID(ctx, db.AcademicGetCalendarEventByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.CalendarEvent{}, err
	}
	event := toCalendarEvent(row)
	gradeLevelIDs, err := r.queries(ctx).AcademicListCalendarEventGradeLevels(ctx, db.AcademicListCalendarEventGradeLevelsParams{
		TenantID: tenantID, CalendarEventID: id,
	})
	if err != nil {
		return domain.CalendarEvent{}, err
	}
	event.GradeLevelIDs = gradeLevelIDs
	return event, nil
}

func (r *Repository) DeleteCalendarEvent(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).AcademicDeleteCalendarEvent(ctx, db.AcademicDeleteCalendarEventParams{TenantID: tenantID, ID: id})
}

func (r *Repository) ListCalendarEvents(ctx context.Context, tenantID, yearID uuid.UUID, kind string, page service.Page) ([]domain.CalendarEvent, int64, error) {
	rows, err := r.queries(ctx).AcademicListCalendarEvents(ctx, db.AcademicListCalendarEventsParams{
		TenantID: tenantID, AcademicYearID: yearID, Kind: pdatabase.Text(kind), Limit: page.Limit, Offset: page.Offset,
	})
	if err != nil {
		return nil, 0, err
	}
	events := make([]domain.CalendarEvent, len(rows))
	var total int64
	for i, row := range rows {
		event := toCalendarEvent(row.AcademicCalendarEvent)
		gradeLevelIDs, err := r.queries(ctx).AcademicListCalendarEventGradeLevels(ctx, db.AcademicListCalendarEventGradeLevelsParams{
			TenantID: tenantID, CalendarEventID: event.ID,
		})
		if err != nil {
			return nil, 0, err
		}
		event.GradeLevelIDs = gradeLevelIDs
		events[i] = event
		total = row.TotalCount
	}
	return events, total, nil
}

// ListCalendarEventsForDate returns every non-teaching calendar event
// (holiday, no_school, semester_break) whose range covers date, each with
// its grade-level targeting resolved -- the input domain.IsSchoolDay
// needs.
func (r *Repository) ListCalendarEventsForDate(ctx context.Context, tenantID, yearID uuid.UUID, date time.Time) ([]domain.CalendarEvent, error) {
	rows, err := r.queries(ctx).AcademicListCalendarEventsForDate(ctx, db.AcademicListCalendarEventsForDateParams{
		TenantID: tenantID, AcademicYearID: yearID, Date: pdatabase.Date(date),
	})
	if err != nil {
		return nil, err
	}
	events := make([]domain.CalendarEvent, len(rows))
	for i, row := range rows {
		event := toCalendarEvent(row)
		gradeLevelIDs, err := r.queries(ctx).AcademicListCalendarEventGradeLevels(ctx, db.AcademicListCalendarEventGradeLevelsParams{
			TenantID: tenantID, CalendarEventID: event.ID,
		})
		if err != nil {
			return nil, err
		}
		event.GradeLevelIDs = gradeLevelIDs
		events[i] = event
	}
	return events, nil
}

func (r *Repository) UpsertSchoolDay(ctx context.Context, tenantID, yearID uuid.UUID, dayOfWeek int16, isActive bool) error {
	return r.queries(ctx).AcademicUpsertSchoolDay(ctx, db.AcademicUpsertSchoolDayParams{
		TenantID: tenantID, AcademicYearID: yearID, DayOfWeek: dayOfWeek, IsActive: isActive,
	})
}

func (r *Repository) ListSchoolDays(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.SchoolDay, error) {
	rows, err := r.queries(ctx).AcademicListSchoolDays(ctx, db.AcademicListSchoolDaysParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, err
	}
	days := make([]domain.SchoolDay, len(rows))
	for i, row := range rows {
		days[i] = domain.SchoolDay{AcademicYearID: row.AcademicYearID, DayOfWeek: row.DayOfWeek, IsActive: row.IsActive}
	}
	return days, nil
}

// GetCalendarPolicyConfig implements service.policyRepository, reading the
// tenant_policies row (owned by the platform/tenant domain) read-only.
func (r *Repository) GetCalendarPolicyConfig(ctx context.Context, tenantID uuid.UUID, asOf time.Time) ([]byte, bool, error) {
	config, err := r.queries(ctx).AcademicGetCalendarPolicy(ctx, db.AcademicGetCalendarPolicyParams{
		TenantID: tenantID, EffectiveFrom: pdatabase.Date(asOf),
	})
	if err != nil {
		return nil, false, nil //nolint:nilerr // no calendar policy configured is a valid, common state
	}
	return config, true, nil
}

func toAcademicYear(row db.AcademicYear) domain.AcademicYear {
	return domain.AcademicYear{
		ID:         row.ID,
		TenantID:   row.TenantID,
		Label:      row.Label,
		StartsOn:   pdatabase.DateOrZero(row.StartsOn),
		EndsOn:     pdatabase.DateOrZero(row.EndsOn),
		IsActive:   row.IsActive,
		ArchivedAt: pdatabase.TimePtr(row.ArchivedAt),
		CreatedAt:  pdatabase.TimeOrZero(row.CreatedAt),
		UpdatedAt:  pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toTerm(row db.Term) domain.Term {
	return domain.Term{
		ID:             row.ID,
		TenantID:       row.TenantID,
		AcademicYearID: row.AcademicYearID,
		Name:           row.Name,
		Sequence:       row.Sequence,
		StartsOn:       pdatabase.DateOrZero(row.StartsOn),
		EndsOn:         pdatabase.DateOrZero(row.EndsOn),
		IsActive:       row.IsActive,
	}
}

func toCalendarEvent(row db.AcademicCalendarEvent) domain.CalendarEvent {
	return domain.CalendarEvent{
		ID:             row.ID,
		TenantID:       row.TenantID,
		AcademicYearID: row.AcademicYearID,
		Date:           pdatabase.DateOrZero(row.Date),
		EndDate:        pdatabase.DateOrZero(row.EndDate),
		Kind:           row.Kind,
		Name:           row.Name,
	}
}
