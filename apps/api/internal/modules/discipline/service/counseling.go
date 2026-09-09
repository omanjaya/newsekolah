package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
)

type CounselingInput struct {
	StudentUserID uuid.UUID
	SessionAt     time.Time
	Kind          domain.CounselingKind
	Title         string
	Content       string
	FollowUpPlan  string
	Visibility    domain.Visibility
}

func (in CounselingInput) validate() error {
	if in.StudentUserID == uuid.Nil || in.SessionAt.IsZero() || !in.Kind.Valid() || !in.Visibility.Valid() {
		return domain.ErrInvalidInput
	}
	if strings.TrimSpace(in.Title) == "" || strings.TrimSpace(in.Content) == "" {
		return domain.ErrInvalidInput
	}
	return nil
}

func (s *Service) readerRole(ctx context.Context, tenantID, yearID, userID, authorID uuid.UUID) (domain.ReaderRole, error) {
	role := domain.ReaderRole{IsAuthor: userID == authorID}
	var err error
	if role.IsCounselor, err = s.repo.HasActiveDuty(ctx, tenantID, yearID, userID, "counselor", uuid.NullUUID{}); err != nil {
		return role, err
	}
	if role.IsLeadership, err = s.repo.HasActiveDuty(ctx, tenantID, yearID, userID, "leadership", uuid.NullUUID{}); err != nil {
		return role, err
	}
	return role, nil
}

func (s *Service) seal(text string) ([]byte, error) {
	if text == "" {
		return nil, nil
	}
	return s.sealer.Seal([]byte(text))
}

func (s *Service) open(enc EncryptedCounseling) (domain.Counseling, error) {
	c := enc.Counseling
	if len(enc.ContentEncrypted) > 0 {
		plain, err := s.sealer.Open(enc.ContentEncrypted)
		if err != nil {
			return c, err
		}
		c.Content = string(plain)
	}
	if len(enc.FollowUpPlanEncrypted) > 0 {
		plain, err := s.sealer.Open(enc.FollowUpPlanEncrypted)
		if err != nil {
			return c, err
		}
		c.FollowUpPlan = string(plain)
	}
	return c, nil
}

func (s *Service) CreateCounseling(ctx context.Context, tenantID, counselorUserID uuid.UUID, in CounselingInput) (domain.Counseling, error) {
	if err := in.validate(); err != nil {
		return domain.Counseling{}, err
	}
	var out domain.Counseling
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		content, err := s.seal(in.Content)
		if err != nil {
			return err
		}
		followUp, err := s.seal(in.FollowUpPlan)
		if err != nil {
			return err
		}
		out, err = s.repo.CreateCounseling(ctx, domain.Counseling{
			TenantID: tenantID, AcademicYearID: yearID, StudentUserID: in.StudentUserID, CounselorUserID: counselorUserID,
			SessionAt: in.SessionAt, Kind: in.Kind, Title: strings.TrimSpace(in.Title), Visibility: in.Visibility,
		}, content, followUp, s.sealer.KeyID)
		if err != nil {
			return err
		}
		out.Content, out.FollowUpPlan = in.Content, in.FollowUpPlan
		return nil
	})
	return out, err
}

func (s *Service) UpdateCounseling(ctx context.Context, tenantID, id, actorUserID uuid.UUID, in CounselingInput) (domain.Counseling, error) {
	if err := in.validate(); err != nil {
		return domain.Counseling{}, err
	}
	var out domain.Counseling
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetCounseling(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrCounselingNotFound
		}
		if current.CounselorUserID != actorUserID {
			return domain.ErrCounselingForbidden
		}
		content, err := s.seal(in.Content)
		if err != nil {
			return err
		}
		followUp, err := s.seal(in.FollowUpPlan)
		if err != nil {
			return err
		}
		next := current.Counseling
		next.SessionAt, next.Kind, next.Title, next.Visibility = in.SessionAt, in.Kind, strings.TrimSpace(in.Title), in.Visibility
		out, err = s.repo.UpdateCounseling(ctx, next, content, followUp, s.sealer.KeyID)
		if err != nil {
			return err
		}
		out.Content, out.FollowUpPlan = in.Content, in.FollowUpPlan
		return nil
	})
	return out, err
}

func (s *Service) GetCounseling(ctx context.Context, tenantID, id, readerUserID uuid.UUID) (domain.Counseling, error) {
	var out domain.Counseling
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		enc, ok, err := s.repo.GetCounseling(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrCounselingNotFound
		}
		role, err := s.readerRole(ctx, tenantID, enc.AcademicYearID, readerUserID, enc.CounselorUserID)
		if err != nil {
			return err
		}
		if !enc.VisibleTo(role) {
			return domain.ErrCounselingForbidden
		}
		out, err = s.open(enc)
		return err
	})
	return out, err
}

// ListCounselingsForStudent returns every note the reader may see; bodies
// stay encrypted (empty) on rows outside the reader's visibility.
func (s *Service) ListCounselingsForStudent(ctx context.Context, tenantID, studentID, readerUserID uuid.UUID) ([]domain.Counseling, error) {
	var out []domain.Counseling
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		rows, err := s.repo.ListCounselingsForStudent(ctx, tenantID, yearID, studentID)
		if err != nil {
			return err
		}
		out = make([]domain.Counseling, 0, len(rows))
		for _, enc := range rows {
			role, err := s.readerRole(ctx, tenantID, yearID, readerUserID, enc.CounselorUserID)
			if err != nil {
				return err
			}
			if !enc.VisibleTo(role) {
				continue
			}
			c, err := s.open(enc)
			if err != nil {
				return err
			}
			out = append(out, c)
		}
		return nil
	})
	return out, err
}

func (s *Service) ListMyCounselings(ctx context.Context, tenantID, counselorUserID uuid.UUID, limit, offset int) ([]domain.Counseling, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var out []domain.Counseling
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		rows, err := s.repo.ListCounselingsByCounselor(ctx, tenantID, yearID, counselorUserID, limit, max(offset, 0))
		if err != nil {
			return err
		}
		out = make([]domain.Counseling, 0, len(rows))
		for _, enc := range rows {
			c, err := s.open(enc)
			if err != nil {
				return err
			}
			out = append(out, c)
		}
		return nil
	})
	return out, err
}

func (s *Service) DeleteCounseling(ctx context.Context, tenantID, id, actorUserID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetCounseling(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrCounselingNotFound
		}
		if current.CounselorUserID != actorUserID {
			return domain.ErrCounselingForbidden
		}
		return s.repo.DeleteCounseling(ctx, tenantID, id)
	})
}
