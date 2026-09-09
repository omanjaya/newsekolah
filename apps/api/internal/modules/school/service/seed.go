package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	academicdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
)

// seedDemoLevel is the level template applied when a tenant asks for
// sample data without saying which level -- SMA, matching what
// apps/api/cmd/seed builds for local development.
const seedDemoLevel = "sma"

// seedDemoClassName is the one class sample data creates, named the same
// way apps/api/cmd/seed does.
const seedDemoClassName = "X-A"

// SeedReport is what SeedSampleData created.
type SeedReport struct {
	AcademicYearLabel string
	Template          TemplateReport
	ClassName         string
}

// SeedSampleData fills a brand-new tenant with a demo academic year, an
// SMA level template (grade levels, subjects, bell schedule), and one demo
// class, the same shape apps/api/cmd/seed builds for local development --
// so a school evaluating the platform can look around before doing their
// own onboarding. It refuses once the tenant has any real data (an
// academic year, a grade level, a class, a subject, or a student), so it
// can never be used to reset or pollute a school that has already started
// setting up for real.
func (s *Service) SeedSampleData(ctx context.Context, tenantID uuid.UUID) (SeedReport, error) {
	if s.academic == nil {
		return SeedReport{}, domain.ErrOnboardingUnavailable
	}

	var report SeedReport
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		counts, err := s.repo.SetupCounts(ctx, tenantID, uuid.NullUUID{})
		if err != nil {
			return err
		}
		if counts.AcademicYears > 0 || counts.GradeLevels > 0 || counts.Classes > 0 || counts.Subjects > 0 || counts.Students > 0 {
			return domain.ErrTenantHasData
		}

		year, err := s.seedAcademicYear(ctx, tenantID)
		if err != nil {
			return err
		}
		report.AcademicYearLabel = year.Label

		templateReport, err := s.ApplyLevelTemplate(ctx, tenantID, seedDemoLevel)
		if err != nil {
			return err
		}
		report.Template = templateReport

		levels, err := s.academic.ListGradeLevels(ctx, tenantID)
		if err != nil {
			return err
		}
		if len(levels) == 0 {
			return fmt.Errorf("seed sample data: level template applied no grade levels")
		}
		if _, err := s.academic.CreateClass(ctx, academicdomain.Class{
			TenantID: tenantID, AcademicYearID: year.ID, GradeLevelID: levels[0].ID, Name: seedDemoClassName,
		}); err != nil {
			return err
		}
		report.ClassName = seedDemoClassName
		return nil
	})
	return report, err
}

// seedAcademicYear creates and activates a year running from today (tenant
// timezone aside, this is precise enough for sample data) through one
// calendar year later.
func (s *Service) seedAcademicYear(ctx context.Context, tenantID uuid.UUID) (domain.AcademicYear, error) {
	now := s.clk.Now()
	label := fmt.Sprintf("%d/%d", now.Year(), now.Year()+1)
	year, err := s.repo.CreateAcademicYear(ctx, tenantID, label, now, now.AddDate(1, 0, 0))
	if err != nil {
		return domain.AcademicYear{}, err
	}
	if err := s.repo.ActivateAcademicYear(ctx, tenantID, year.ID); err != nil {
		return domain.AcademicYear{}, err
	}
	year.IsActive = true
	return year, nil
}
