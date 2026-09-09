package service

import (
	"context"

	"github.com/google/uuid"

	academicdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	academicservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
)

// TemplateItemStatus is what happened to one grade level, subject, or
// period when a level template was applied.
type TemplateItemStatus string

const (
	TemplateItemCreated TemplateItemStatus = "created"
	TemplateItemSkipped TemplateItemStatus = "skipped"
)

// TemplateItemResult is one row of the apply-template report: what kind of
// row it was (grade_level, subject, period), its code/name, and whether it
// was created or already existed and was left alone.
type TemplateItemResult struct {
	Kind   string
	Code   string
	Name   string
	Status TemplateItemStatus
}

// TemplateReport is the full result of applying one level template.
type TemplateReport struct {
	Template TemplateItemKindKey
	Items    []TemplateItemResult
	Created  int
	Skipped  int
}

// TemplateItemKindKey is exported only so TemplateReport can name which
// template it applied.
type TemplateItemKindKey = domain.LevelTemplateKey

const (
	templateKindGradeLevel = "grade_level"
	templateKindSubject    = "subject"
	templateKindPeriod     = "period"
)

// AvailableLevelTemplates lists the level templates the wizard's first
// step can offer.
func AvailableLevelTemplates() []domain.LevelTemplateKey {
	return domain.LevelTemplateKeys()
}

// ApplyLevelTemplate creates every grade level, subject, and bell-schedule
// period a template defines that the tenant does not already have,
// identified by code (grade levels, subjects) or sequence within the
// template's own period template (periods). Calling it more than once, or
// applying more than one level's template to the same tenant, is safe:
// anything that already exists is reported as skipped, not overwritten or
// duplicated.
func (s *Service) ApplyLevelTemplate(ctx context.Context, tenantID uuid.UUID, key string) (TemplateReport, error) {
	if s.academic == nil {
		return TemplateReport{}, domain.ErrOnboardingUnavailable
	}
	tpl, err := domain.LevelTemplateByKey(key)
	if err != nil {
		return TemplateReport{}, err
	}

	report := TemplateReport{Template: tpl.Key}
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.applyGradeLevels(ctx, tenantID, tpl, &report); err != nil {
			return err
		}
		if err := s.applySubjects(ctx, tenantID, tpl, &report); err != nil {
			return err
		}
		return s.applyPeriods(ctx, tenantID, tpl, &report)
	})
	return report, err
}

// applyGradeLevels reuses academic's own ApplyGradeLevelTemplate, which
// already creates every row of a known sd/smp/sma/smk template that the
// tenant does not have yet, keyed by code -- there is no need for a second
// idempotent-create code path here, only for turning its "created" result
// into the same created/skipped report shape as subjects and periods.
func (s *Service) applyGradeLevels(ctx context.Context, tenantID uuid.UUID, tpl domain.LevelTemplate, report *TemplateReport) error {
	created, err := s.academic.ApplyGradeLevelTemplate(ctx, tenantID, string(tpl.Key))
	if err != nil {
		return err
	}
	createdCodes := make(map[string]bool, len(created))
	for _, g := range created {
		createdCodes[g.Code] = true
	}
	for _, row := range tpl.GradeLevels {
		if createdCodes[row.Code] {
			report.addCreated(templateKindGradeLevel, row.Code, row.Name)
			continue
		}
		report.addSkipped(templateKindGradeLevel, row.Code, row.Name)
	}
	return nil
}

func (s *Service) applySubjects(ctx context.Context, tenantID uuid.UUID, tpl domain.LevelTemplate, report *TemplateReport) error {
	// Level templates carry at most a few dozen subjects; one unpaged page
	// covers every tenant.
	existing, _, err := s.academic.ListSubjects(ctx, tenantID, "", academicservice.Page{Limit: 500})
	if err != nil {
		return err
	}
	have := make(map[string]bool, len(existing))
	for _, sub := range existing {
		have[sub.Code] = true
	}
	for _, row := range tpl.Subjects {
		if have[row.Code] {
			report.addSkipped(templateKindSubject, row.Code, row.Name)
			continue
		}
		if _, err := s.academic.CreateSubject(ctx, tenantID, row.Code, row.Name); err != nil {
			return err
		}
		have[row.Code] = true
		report.addCreated(templateKindSubject, row.Code, row.Name)
	}
	return nil
}

func (s *Service) applyPeriods(ctx context.Context, tenantID uuid.UUID, tpl domain.LevelTemplate, report *TemplateReport) error {
	templateID, err := s.ensurePeriodTemplate(ctx, tenantID, tpl.PeriodTemplate)
	if err != nil {
		return err
	}

	existing, err := s.academic.ListPeriods(ctx, tenantID, templateID)
	if err != nil {
		return err
	}
	have := make(map[int16]bool, len(existing))
	for _, p := range existing {
		have[p.Sequence] = true
	}
	for _, row := range tpl.Periods {
		if have[row.Sequence] {
			report.addSkipped(templateKindPeriod, row.Name, row.Name)
			continue
		}
		p := academicdomain.Period{
			TenantID:   tenantID,
			TemplateID: templateID,
			Name:       row.Name,
			Sequence:   row.Sequence,
			StartsAt:   academicdomain.ClockTime{Hour: row.StartHour, Minute: row.StartMinute},
			EndsAt:     academicdomain.ClockTime{Hour: row.EndHour, Minute: row.EndMinute},
			IsBreak:    row.IsBreak,
		}
		if _, err := s.academic.CreatePeriod(ctx, p); err != nil {
			return err
		}
		report.addCreated(templateKindPeriod, row.Name, row.Name)
	}
	return nil
}

// ensurePeriodTemplate finds a period template by name for this tenant, or
// creates it (as the tenant's default) when none exists yet.
func (s *Service) ensurePeriodTemplate(ctx context.Context, tenantID uuid.UUID, name string) (uuid.UUID, error) {
	existing, err := s.academic.ListPeriodTemplates(ctx, tenantID)
	if err != nil {
		return uuid.Nil, err
	}
	for _, t := range existing {
		if t.Name == name {
			return t.ID, nil
		}
	}
	created, err := s.academic.CreatePeriodTemplate(ctx, tenantID, name, len(existing) == 0)
	if err != nil {
		return uuid.Nil, err
	}
	return created.ID, nil
}

func (r *TemplateReport) addCreated(kind, code, name string) {
	r.Items = append(r.Items, TemplateItemResult{Kind: kind, Code: code, Name: name, Status: TemplateItemCreated})
	r.Created++
}

func (r *TemplateReport) addSkipped(kind, code, name string) {
	r.Items = append(r.Items, TemplateItemResult{Kind: kind, Code: code, Name: name, Status: TemplateItemSkipped})
	r.Skipped++
}
