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
// Only the group's own mentor (or a group manager) writes it, and only for
// a student of that group.
func (s *Service) WriteTermSummary(ctx context.Context, tenantID uuid.UUID, viewer domain.Viewer, in TermSummaryInput) (domain.TermSummary, error) {
	summary := domain.TermSummary{
		TenantID: tenantID,
		TermID:   in.TermID, GroupID: in.GroupID, StudentUserID: in.StudentUserID,
		MentorUserID: viewer.UserID, Summary: strings.TrimSpace(in.Summary),
	}
	if err := summary.Validate(); err != nil {
		return domain.TermSummary{}, err
	}
	var out domain.TermSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		group, err := s.writableGroup(ctx, tenantID, viewer, in.GroupID)
		if err != nil {
			return err
		}
		if err := s.requireGroupMember(ctx, tenantID, group, in.StudentUserID); err != nil {
			return err
		}
		out, err = s.repo.UpsertTermSummary(ctx, summary)
		return err
	})
	return out, err
}

// GetTermSummary returns a student's summary for a term, read through a
// group the viewer may open and the student belongs to.
func (s *Service) GetTermSummary(ctx context.Context, tenantID uuid.UUID, viewer domain.Viewer, groupID, termID, studentUserID uuid.UUID) (domain.TermSummary, error) {
	var out domain.TermSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		group, err := s.readableGroup(ctx, tenantID, viewer, groupID)
		if err != nil {
			return err
		}
		if err := s.requireGroupMember(ctx, tenantID, group, studentUserID); err != nil {
			return err
		}
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

func (s *Service) ListTermSummariesForGroup(ctx context.Context, tenantID uuid.UUID, viewer domain.Viewer, termID, groupID uuid.UUID) ([]domain.TermSummary, error) {
	var out []domain.TermSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, err := s.readableGroup(ctx, tenantID, viewer, groupID); err != nil {
			return err
		}
		var err error
		out, err = s.repo.ListTermSummariesForGroup(ctx, tenantID, termID, groupID)
		return err
	})
	return out, err
}
