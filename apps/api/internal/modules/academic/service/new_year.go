package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

// NewYearSetupPlan is what a new-academic-year setup would copy from
// fromYearID into toYearID: every source subject offering and class, each
// marked with whether the destination already has an equivalent (so
// committing an already-committed plan changes nothing).
type NewYearSetupPlan struct {
	SubjectOfferings []domain.SubjectOfferingCopyDecision
	Classes          []domain.ClassCopyDecision
}

// PreviewNewYearSetup computes, without writing anything, what starting
// toYearID from fromYearID's structure would copy forward: grade levels
// and subjects are a tenant-wide catalog already shared across years, so
// there is nothing to copy there -- only the per-year subject offerings
// and classes.
func (s *Service) PreviewNewYearSetup(ctx context.Context, tenantID, fromYearID, toYearID uuid.UUID) (NewYearSetupPlan, error) {
	if fromYearID == toYearID {
		return NewYearSetupPlan{}, domain.ErrNewYearSameAsSource
	}
	var plan NewYearSetupPlan
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		plan, err = s.buildNewYearSetupPlan(ctx, tenantID, fromYearID, toYearID)
		return err
	})
	return plan, err
}

// NewYearSetupResult reports how many rows a commit actually created --
// zero for every already-existing subject offering or class, so calling
// CommitNewYearSetup twice in a row copies nothing the second time.
type NewYearSetupResult struct {
	SubjectOfferingsCopied int
	ClassesCopied          int
}

// CommitNewYearSetup re-computes the same plan PreviewNewYearSetup would
// and creates every item not already present in toYearID.
func (s *Service) CommitNewYearSetup(ctx context.Context, tenantID, fromYearID, toYearID uuid.UUID) (NewYearSetupResult, error) {
	if fromYearID == toYearID {
		return NewYearSetupResult{}, domain.ErrNewYearSameAsSource
	}
	var result NewYearSetupResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		plan, err := s.buildNewYearSetupPlan(ctx, tenantID, fromYearID, toYearID)
		if err != nil {
			return err
		}

		for _, o := range plan.SubjectOfferings {
			if o.AlreadyExists {
				continue
			}
			if _, err := s.repo.CreateSubjectOffering(ctx, domain.SubjectOffering{
				TenantID: tenantID, AcademicYearID: toYearID, SubjectID: o.SubjectID,
				GradeLevelID: o.GradeLevelID, HoursPerWeek: o.HoursPerWeek,
			}); err != nil {
				return err
			}
			result.SubjectOfferingsCopied++
		}

		for _, c := range plan.Classes {
			if c.AlreadyExists {
				continue
			}
			if _, err := s.repo.CreateClass(ctx, domain.Class{
				TenantID: tenantID, AcademicYearID: toYearID, GradeLevelID: c.GradeLevelID, TrackID: c.TrackID,
				Name: c.Name, RoomID: c.RoomID, Capacity: c.Capacity, HomeroomTeacherID: c.HomeroomTeacherID,
			}); err != nil {
				return err
			}
			result.ClassesCopied++
		}
		return nil
	})
	return result, err
}

func (s *Service) buildNewYearSetupPlan(ctx context.Context, tenantID, fromYearID, toYearID uuid.UUID) (NewYearSetupPlan, error) {
	if _, err := s.repo.GetYearByID(ctx, tenantID, fromYearID); err != nil {
		return NewYearSetupPlan{}, mapNotFound(err, domain.ErrNewYearSourceNotFound)
	}
	if _, err := s.repo.GetYearByID(ctx, tenantID, toYearID); err != nil {
		return NewYearSetupPlan{}, mapNotFound(err, domain.ErrAcademicYearNotFound)
	}

	sourceOfferings, err := s.repo.ListSubjectOfferings(ctx, tenantID, fromYearID)
	if err != nil {
		return NewYearSetupPlan{}, err
	}
	destOfferings, err := s.repo.ListSubjectOfferings(ctx, tenantID, toYearID)
	if err != nil {
		return NewYearSetupPlan{}, err
	}

	sourceClasses, err := s.repo.ListAllClassesForYear(ctx, tenantID, fromYearID)
	if err != nil {
		return NewYearSetupPlan{}, err
	}
	destClasses, err := s.repo.ListAllClassesForYear(ctx, tenantID, toYearID)
	if err != nil {
		return NewYearSetupPlan{}, err
	}

	return NewYearSetupPlan{
		SubjectOfferings: domain.PlanSubjectOfferingCopy(sourceOfferings, destOfferings),
		Classes:          domain.PlanClassCopy(sourceClasses, destClasses),
	}, nil
}
