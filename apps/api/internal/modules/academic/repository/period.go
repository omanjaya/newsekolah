package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

func (r *Repository) CreatePeriodTemplate(ctx context.Context, tenantID uuid.UUID, name string, isDefault bool) (domain.PeriodTemplate, error) {
	row, err := r.queries(ctx).AcademicCreatePeriodTemplate(ctx, db.AcademicCreatePeriodTemplateParams{TenantID: tenantID, Name: name, IsDefault: isDefault})
	if err != nil {
		return domain.PeriodTemplate{}, err
	}
	return toPeriodTemplate(row), nil
}

func (r *Repository) UpdatePeriodTemplate(ctx context.Context, tenantID, id uuid.UUID, name string, isDefault bool) (domain.PeriodTemplate, error) {
	row, err := r.queries(ctx).AcademicUpdatePeriodTemplate(ctx, db.AcademicUpdatePeriodTemplateParams{TenantID: tenantID, ID: id, Name: name, IsDefault: isDefault})
	if err != nil {
		return domain.PeriodTemplate{}, err
	}
	return toPeriodTemplate(row), nil
}

func (r *Repository) GetPeriodTemplateByID(ctx context.Context, tenantID, id uuid.UUID) (domain.PeriodTemplate, error) {
	row, err := r.queries(ctx).AcademicGetPeriodTemplateByID(ctx, db.AcademicGetPeriodTemplateByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.PeriodTemplate{}, err
	}
	return toPeriodTemplate(row), nil
}

func (r *Repository) GetDefaultPeriodTemplate(ctx context.Context, tenantID uuid.UUID) (domain.PeriodTemplate, error) {
	row, err := r.queries(ctx).AcademicGetDefaultPeriodTemplate(ctx, tenantID)
	if err != nil {
		return domain.PeriodTemplate{}, err
	}
	return toPeriodTemplate(row), nil
}

func (r *Repository) ListPeriodTemplates(ctx context.Context, tenantID uuid.UUID) ([]domain.PeriodTemplate, error) {
	rows, err := r.queries(ctx).AcademicListPeriodTemplates(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	templates := make([]domain.PeriodTemplate, len(rows))
	for i, row := range rows {
		templates[i] = toPeriodTemplate(row)
	}
	return templates, nil
}

func (r *Repository) DeletePeriodTemplate(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).AcademicDeletePeriodTemplate(ctx, db.AcademicDeletePeriodTemplateParams{TenantID: tenantID, ID: id})
}

func (r *Repository) ClearDefaultPeriodTemplate(ctx context.Context, tenantID uuid.UUID) error {
	return r.queries(ctx).AcademicClearDefaultPeriodTemplate(ctx, tenantID)
}

func (r *Repository) CountWeekdayAssignmentsForTemplate(ctx context.Context, tenantID, id uuid.UUID) (int64, error) {
	return r.queries(ctx).AcademicCountWeekdayAssignmentsForTemplate(ctx, db.AcademicCountWeekdayAssignmentsForTemplateParams{TenantID: tenantID, TemplateID: id})
}

func (r *Repository) CreatePeriod(ctx context.Context, p domain.Period) (domain.Period, error) {
	row, err := r.queries(ctx).AcademicCreatePeriod(ctx, db.AcademicCreatePeriodParams{
		TenantID: p.TenantID, TemplateID: p.TemplateID, Name: p.Name, Sequence: p.Sequence,
		StartsAt: clockTimeToPg(p.StartsAt.Hour, p.StartsAt.Minute), EndsAt: clockTimeToPg(p.EndsAt.Hour, p.EndsAt.Minute), IsBreak: p.IsBreak,
	})
	if err != nil {
		return domain.Period{}, err
	}
	return toPeriod(row), nil
}

func (r *Repository) UpdatePeriod(ctx context.Context, p domain.Period) (domain.Period, error) {
	row, err := r.queries(ctx).AcademicUpdatePeriod(ctx, db.AcademicUpdatePeriodParams{
		TenantID: p.TenantID, ID: p.ID, Name: p.Name, Sequence: p.Sequence,
		StartsAt: clockTimeToPg(p.StartsAt.Hour, p.StartsAt.Minute), EndsAt: clockTimeToPg(p.EndsAt.Hour, p.EndsAt.Minute), IsBreak: p.IsBreak,
	})
	if err != nil {
		return domain.Period{}, err
	}
	return toPeriod(row), nil
}

func (r *Repository) GetPeriodByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Period, error) {
	row, err := r.queries(ctx).AcademicGetPeriodByID(ctx, db.AcademicGetPeriodByIDParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.Period{}, err
	}
	return toPeriod(row), nil
}

func (r *Repository) ListPeriodsByTemplate(ctx context.Context, tenantID, templateID uuid.UUID) ([]domain.Period, error) {
	rows, err := r.queries(ctx).AcademicListPeriodsByTemplate(ctx, db.AcademicListPeriodsByTemplateParams{TenantID: tenantID, TemplateID: templateID})
	if err != nil {
		return nil, err
	}
	periods := make([]domain.Period, len(rows))
	for i, row := range rows {
		periods[i] = toPeriod(row)
	}
	return periods, nil
}

func (r *Repository) DeletePeriod(ctx context.Context, tenantID, id uuid.UUID) error {
	return r.queries(ctx).AcademicDeletePeriod(ctx, db.AcademicDeletePeriodParams{TenantID: tenantID, ID: id})
}

func (r *Repository) UpsertWeekdayAssignment(ctx context.Context, a domain.WeekdayAssignment) error {
	return r.queries(ctx).AcademicUpsertWeekdayAssignment(ctx, db.AcademicUpsertWeekdayAssignmentParams{
		TenantID: a.TenantID, AcademicYearID: a.AcademicYearID, DayOfWeek: a.DayOfWeek, TemplateID: a.TemplateID,
	})
}

func (r *Repository) ListWeekdayAssignments(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.WeekdayAssignment, error) {
	rows, err := r.queries(ctx).AcademicListWeekdayAssignments(ctx, db.AcademicListWeekdayAssignmentsParams{TenantID: tenantID, AcademicYearID: yearID})
	if err != nil {
		return nil, err
	}
	assignments := make([]domain.WeekdayAssignment, len(rows))
	for i, row := range rows {
		assignments[i] = toWeekdayAssignment(row)
	}
	return assignments, nil
}

func (r *Repository) GetWeekdayAssignment(ctx context.Context, tenantID, yearID uuid.UUID, dayOfWeek int16) (domain.WeekdayAssignment, error) {
	row, err := r.queries(ctx).AcademicGetWeekdayAssignment(ctx, db.AcademicGetWeekdayAssignmentParams{TenantID: tenantID, AcademicYearID: yearID, DayOfWeek: dayOfWeek})
	if err != nil {
		return domain.WeekdayAssignment{}, err
	}
	return toWeekdayAssignment(row), nil
}

func toPeriodTemplate(row db.PeriodTemplate) domain.PeriodTemplate {
	return domain.PeriodTemplate{ID: row.ID, TenantID: row.TenantID, Name: row.Name, IsDefault: row.IsDefault}
}

func toPeriod(row db.Period) domain.Period {
	startHour, startMinute := pgToClockTime(row.StartsAt)
	endHour, endMinute := pgToClockTime(row.EndsAt)
	return domain.Period{
		ID: row.ID, TenantID: row.TenantID, TemplateID: row.TemplateID, Name: row.Name, Sequence: row.Sequence,
		StartsAt: domain.ClockTime{Hour: startHour, Minute: startMinute},
		EndsAt:   domain.ClockTime{Hour: endHour, Minute: endMinute},
		IsBreak:  row.IsBreak,
	}
}

func toWeekdayAssignment(row db.PeriodDayAssignment) domain.WeekdayAssignment {
	return domain.WeekdayAssignment{TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, DayOfWeek: row.DayOfWeek, TemplateID: row.TemplateID}
}
