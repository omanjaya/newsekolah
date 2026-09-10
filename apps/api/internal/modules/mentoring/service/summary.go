package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
)

type TermSummaryInput struct {
	TermID        uuid.UUID
	GroupID       uuid.UUID
	StudentUserID uuid.UUID
	Summary       string
}

// WriteTermSummary creates or replaces the mentor's per-term appraisal of
// one student; a mentor writes exactly one summary per student per term.
func (s *Service) WriteTermSummary(ctx context.Context, tenantID, mentorUserID uuid.UUID, in TermSummaryInput) (domain.TermSummary, error) {
	summary := domain.TermSummary{
		TermID: in.TermID, GroupID: in.GroupID, StudentUserID: in.StudentUserID,
		MentorUserID: mentorUserID, Summary: strings.TrimSpace(in.Summary),
	}
	if err := summary.Validate(); err != nil {
		return domain.TermSummary{}, err
	}
	var out domain.TermSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		if _, ok, err := s.repo.GetGroup(ctx, tenantID, in.GroupID); err != nil {
			return err
		} else if !ok {
			return domain.ErrGroupNotFound
		}
		var err error
		out, err = s.repo.UpsertTermSummary(ctx, summary)
		return err
	})
	return out, err
}

func (s *Service) GetTermSummary(ctx context.Context, tenantID, termID, studentUserID uuid.UUID) (domain.TermSummary, error) {
	var out domain.TermSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		summary, ok, err := s.repo.GetTermSummary(ctx, tenantID, termID, studentUserID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrSummaryNotFound
		}
		out = summary
		return nil
	})
	return out, err
}

func (s *Service) ListTermSummariesForGroup(ctx context.Context, tenantID, termID, groupID uuid.UUID) ([]domain.TermSummary, error) {
	var out []domain.TermSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListTermSummariesForGroup(ctx, tenantID, termID, groupID)
		return err
	})
	return out, err
}
