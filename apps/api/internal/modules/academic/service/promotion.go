package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

// PreviewPromotion computes, without writing anything, what would happen to
// every actively-enrolled student in fromYearID if promoted into
// toYearID: promote to the next grade's class, retain, or graduate.
// Overrides let the caller force a specific outcome per student before
// committing.
func (s *Service) PreviewPromotion(ctx context.Context, tenantID, fromYearID, toYearID uuid.UUID, overrides []domain.PromotionOverride) ([]domain.PromotionPlanItem, error) {
	var plan []domain.PromotionPlanItem
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		plan, err = s.buildPlan(ctx, tenantID, fromYearID, toYearID, overrides)
		return err
	})
	return plan, err
}

// PromotionCommitResult separates the plan items actually applied from the
// ones skipped because no target class could be resolved -- an unresolved
// promote/retain needs a manual class assignment (an override) before it
// can commit.
type PromotionCommitResult struct {
	Applied []domain.PromotionPlanItem
	Skipped []domain.PromotionPlanItem
}

// CommitPromotion re-computes the same plan PreviewPromotion would (plus
// any overrides) and applies every resolved item: closes the source
// enrollment (moved or graduated) and, for promote/retain, opens a new one
// in the destination year's target class. Unresolved items are left alone
// and reported back, not partially applied.
func (s *Service) CommitPromotion(ctx context.Context, tenantID, fromYearID, toYearID uuid.UUID, overrides []domain.PromotionOverride, effectiveOn time.Time) (PromotionCommitResult, error) {
	var result PromotionCommitResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		plan, err := s.buildPlan(ctx, tenantID, fromYearID, toYearID, overrides)
		if err != nil {
			return err
		}

		for _, item := range plan {
			if item.Unresolved {
				result.Skipped = append(result.Skipped, item)
				continue
			}

			status := domain.EnrollmentStatusMoved
			if item.Action == domain.PromotionActionGraduate {
				status = domain.EnrollmentStatusGraduated
			}
			if _, err := s.repo.CloseEnrollment(ctx, tenantID, item.EnrollmentID, status, effectiveOn); err != nil {
				return err
			}

			if item.Action != domain.PromotionActionGraduate {
				if _, err := s.repo.CreateEnrollment(ctx, tenantID, toYearID, item.StudentUserID, *item.TargetClassID, effectiveOn); err != nil {
					return err
				}
			}
			result.Applied = append(result.Applied, item)
		}
		return nil
	})
	return result, err
}

func (s *Service) buildPlan(ctx context.Context, tenantID, fromYearID, toYearID uuid.UUID, overrides []domain.PromotionOverride) ([]domain.PromotionPlanItem, error) {
	candidates, err := s.repo.ListPromotionCandidates(ctx, tenantID, fromYearID)
	if err != nil {
		return nil, err
	}
	targets, err := s.repo.ListClassesForYear(ctx, tenantID, toYearID)
	if err != nil {
		return nil, err
	}
	levels, err := s.repo.ListGradeLevels(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	bySequence := make(map[int16]uuid.UUID, len(levels))
	var maxSequence int16
	for _, l := range levels {
		bySequence[l.Sequence] = l.ID
		if l.Sequence > maxSequence {
			maxSequence = l.Sequence
		}
	}

	return domain.BuildPromotionPlan(candidates, targets, overrides, bySequence, maxSequence), nil
}
