package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
)

// ActivityInput is the create/update form for a one-off school activity.
type ActivityInput struct {
	Name        string
	Description string
	Location    string
	StartDate   time.Time
	EndDate     time.Time
	OrganiserID uuid.NullUUID
}

func (in ActivityInput) toDomain(tenantID, yearID uuid.UUID) domain.Activity {
	return domain.Activity{
		TenantID: tenantID, AcademicYearID: yearID, Name: strings.TrimSpace(in.Name), Description: in.Description,
		Location: in.Location, StartDate: in.StartDate, EndDate: in.EndDate, OrganiserID: in.OrganiserID,
	}
}

func (s *Service) CreateActivity(ctx context.Context, tenantID uuid.UUID, in ActivityInput) (domain.Activity, error) {
	var out domain.Activity
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		a := in.toDomain(tenantID, yearID)
		if err := a.Validate(); err != nil {
			return err
		}
		out, err = s.repo.CreateActivity(ctx, a)
		return err
	})
	return out, err
}

func (s *Service) UpdateActivity(ctx context.Context, tenantID, id uuid.UUID, in ActivityInput) (domain.Activity, error) {
	var out domain.Activity
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetActivity(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrActivityNotFound
		}
		current.Name, current.Description, current.Location = strings.TrimSpace(in.Name), in.Description, in.Location
		current.StartDate, current.EndDate, current.OrganiserID = in.StartDate, in.EndDate, in.OrganiserID
		if err := current.Validate(); err != nil {
			return err
		}
		out, err = s.repo.UpdateActivity(ctx, current)
		return err
	})
	return out, err
}

func (s *Service) DeleteActivity(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteActivity(ctx, tenantID, id)
	})
}

func (s *Service) GetActivity(ctx context.Context, tenantID, id uuid.UUID) (domain.Activity, error) {
	var out domain.Activity
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		a, ok, err := s.repo.GetActivity(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrActivityNotFound
		}
		a.Participants, err = s.repo.ListParticipants(ctx, tenantID, id)
		if err != nil {
			return err
		}
		out = a
		return nil
	})
	return out, err
}

func (s *Service) ListActivities(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) ([]domain.Activity, error) {
	var out []domain.Activity
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListActivities(ctx, tenantID, yearID, from, to)
		return err
	})
	return out, err
}

func (s *Service) AddParticipant(ctx context.Context, tenantID, activityID uuid.UUID, p domain.Participant) (domain.Participant, error) {
	if err := p.Validate(); err != nil {
		return domain.Participant{}, err
	}
	var out domain.Participant
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, ok, err := s.repo.GetActivity(ctx, tenantID, activityID); err != nil {
			return err
		} else if !ok {
			return domain.ErrActivityNotFound
		}
		var err error
		out, err = s.repo.AddParticipant(ctx, tenantID, activityID, p)
		return err
	})
	return out, err
}

func (s *Service) RemoveParticipant(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.RemoveParticipant(ctx, tenantID, id)
	})
}

// Achievements.

func (s *Service) CreateAchievement(ctx context.Context, tenantID uuid.UUID, a domain.Achievement) (domain.Achievement, error) {
	var out domain.Achievement
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		a.TenantID, a.AcademicYearID = tenantID, yearID
		if err := a.Validate(); err != nil {
			return err
		}
		out, err = s.repo.CreateAchievement(ctx, a)
		return err
	})
	return out, err
}

func (s *Service) UpdateAchievement(ctx context.Context, tenantID, id uuid.UUID, in domain.Achievement) (domain.Achievement, error) {
	var out domain.Achievement
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetAchievement(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrAchievementNotFound
		}
		current.CompetitionName, current.Level, current.Placing = in.CompetitionName, in.Level, in.Placing
		current.AchievedOn, current.Notes = in.AchievedOn, in.Notes
		if err := current.Validate(); err != nil {
			return err
		}
		out, err = s.repo.UpdateAchievement(ctx, current)
		return err
	})
	return out, err
}

func (s *Service) DeleteAchievement(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteAchievement(ctx, tenantID, id)
	})
}

func (s *Service) ListAchievements(ctx context.Context, tenantID uuid.UUID, studentID, classID uuid.NullUUID) ([]domain.Achievement, error) {
	var out []domain.Achievement
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListAchievements(ctx, tenantID, yearID, studentID, classID)
		return err
	})
	return out, err
}
