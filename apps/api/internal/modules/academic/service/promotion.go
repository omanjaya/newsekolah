package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

// promotionRepository is the narrow slice of Repository that promotion
// preview/commit needs, declared separately from the module's full
// Repository so a unit test can supply an in-memory fake instead of a
// database (see promotion_test.go's TestCommitPromotionIsIdempotent).
type promotionRepository interface {
	ListPromotionCandidates(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.PromotionCandidate, error)
	ListClassesForYear(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.TargetClass, error)
	ListGradeLevels(ctx context.Context, tenantID uuid.UUID) ([]domain.GradeLevel, error)
	CloseEnrollment(ctx context.Context, tenantID, id uuid.UUID, status string, leftOn time.Time) (domain.Enrollment, error)
	CreateEnrollment(ctx context.Context, tenantID, yearID, studentID, classID uuid.UUID, joinedOn time.Time) (domain.Enrollment, error)
}

// PreviewPromotion computes, without writing anything, what would happen to
// every actively-enrolled student in fromYearID if promoted into
// toYearID: promote to the next grade's class, retain, graduate, or
// transfer out. Overrides let the caller force a specific outcome per
// student before committing.
func (s *Service) PreviewPromotion(ctx context.Context, tenantID, fromYearID, toYearID uuid.UUID, overrides []domain.PromotionOverride) ([]domain.PromotionPlanItem, error) {
	var plan []domain.PromotionPlanItem
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		plan, err = buildPromotionPlan(ctx, s.repo, tenantID, fromYearID, toYearID, overrides)
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
// enrollment (moved, graduated, or left) and, for promote/retain, opens a
// new one in the destination year's target class. Unresolved items are
// left alone and reported back, not partially applied.
//
// Re-running a commit for the same (fromYearID, toYearID) pair is a
// no-op: ListPromotionCandidates only returns students whose enrollment in
// fromYearID is still active, and this method closes that enrollment as
// part of applying it, so an already-promoted student never appears in
// the plan again.
func (s *Service) CommitPromotion(ctx context.Context, tenantID, fromYearID, toYearID uuid.UUID, overrides []domain.PromotionOverride, effectiveOn time.Time) (PromotionCommitResult, error) {
	var result PromotionCommitResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		result, err = commitPromotionPlan(ctx, s.repo, tenantID, fromYearID, toYearID, overrides, effectiveOn)
		return err
	})
	return result, err
}

func commitPromotionPlan(
	ctx context.Context, repo promotionRepository, tenantID, fromYearID, toYearID uuid.UUID,
	overrides []domain.PromotionOverride, effectiveOn time.Time,
) (PromotionCommitResult, error) {
	var result PromotionCommitResult
	plan, err := buildPromotionPlan(ctx, repo, tenantID, fromYearID, toYearID, overrides)
	if err != nil {
		return result, err
	}

	for _, item := range plan {
		if item.Unresolved {
			result.Skipped = append(result.Skipped, item)
			continue
		}

		status := closingStatus(item.Action)
		if _, err := repo.CloseEnrollment(ctx, tenantID, item.EnrollmentID, status, effectiveOn); err != nil {
			return result, err
		}

		if item.Action == domain.PromotionActionPromote || item.Action == domain.PromotionActionRetain {
			if _, err := repo.CreateEnrollment(ctx, tenantID, toYearID, item.StudentUserID, *item.TargetClassID, effectiveOn); err != nil {
				return result, err
			}
		}
		result.Applied = append(result.Applied, item)
	}
	return result, nil
}

// closingStatus maps a promotion outcome to the enrollment status its
// source-year enrollment closes with: promote/retain move the student to a
// new enrollment in the destination year, graduate ends their enrollment
// here entirely, and transfer records them as having left for another
// school (domain.EnrollmentStatusLeft already means exactly this).
func closingStatus(action string) string {
	switch action {
	case domain.PromotionActionGraduate:
		return domain.EnrollmentStatusGraduated
	case domain.PromotionActionTransfer:
		return domain.EnrollmentStatusLeft
	default:
		return domain.EnrollmentStatusMoved
	}
}

func buildPromotionPlan(
	ctx context.Context, repo promotionRepository, tenantID, fromYearID, toYearID uuid.UUID, overrides []domain.PromotionOverride,
) ([]domain.PromotionPlanItem, error) {
	candidates, err := repo.ListPromotionCandidates(ctx, tenantID, fromYearID)
	if err != nil {
		return nil, err
	}
	targets, err := repo.ListClassesForYear(ctx, tenantID, toYearID)
	if err != nil {
		return nil, err
	}
	levels, err := repo.ListGradeLevels(ctx, tenantID)
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
