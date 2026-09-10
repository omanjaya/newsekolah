package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
)

const (
	dutySlugSecurity   = "security"
	dutySlugLeadership = "leadership"
)

type IncidentInput struct {
	OccurredAt      time.Time
	Severity        domain.Severity
	Description     string
	PersonsInvolved string
	ActionTaken     string
}

func (in IncidentInput) validate() error {
	if in.OccurredAt.IsZero() || !in.Severity.Valid() || strings.TrimSpace(in.Description) == "" {
		return domain.ErrInvalidInput
	}
	return nil
}

// CreateIncident records a dated incident on campus. The reporter always
// keeps read access to what they filed.
func (s *Service) CreateIncident(ctx context.Context, tenantID, reporterUserID uuid.UUID, in IncidentInput) (domain.Incident, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Incident{}, err
	}
	if err := in.validate(); err != nil {
		return domain.Incident{}, err
	}
	var out domain.Incident
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.CreateIncident(ctx, domain.Incident{
			TenantID: tenantID, OccurredAt: in.OccurredAt, Severity: in.Severity, Description: strings.TrimSpace(in.Description),
			PersonsInvolved: strings.TrimSpace(in.PersonsInvolved), ActionTaken: strings.TrimSpace(in.ActionTaken), ReportedBy: reporterUserID,
		})
		return err
	})
	return out, err
}

// UpdateIncident edits the free-text fields of an open incident.
func (s *Service) UpdateIncident(ctx context.Context, tenantID, id uuid.UUID, in IncidentInput) (domain.Incident, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Incident{}, err
	}
	if err := in.validate(); err != nil {
		return domain.Incident{}, err
	}
	var out domain.Incident
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetIncident(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrIncidentNotFound
		}
		if current.IsClosed {
			return domain.ErrIncidentAlreadyClosed
		}
		current.OccurredAt, current.Severity = in.OccurredAt, in.Severity
		current.Description, current.PersonsInvolved, current.ActionTaken = strings.TrimSpace(in.Description), strings.TrimSpace(in.PersonsInvolved), strings.TrimSpace(in.ActionTaken)
		updated, _, err := s.repo.UpdateIncident(ctx, current)
		if err != nil {
			return err
		}
		out = updated
		return nil
	})
	return out, err
}

// CloseIncident marks an incident resolved.
func (s *Service) CloseIncident(ctx context.Context, tenantID, id, closedBy uuid.UUID) (domain.Incident, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Incident{}, err
	}
	var out domain.Incident
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetIncident(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrIncidentNotFound
		}
		if current.IsClosed {
			return domain.ErrIncidentAlreadyClosed
		}
		updated, _, err := s.repo.CloseIncident(ctx, tenantID, id, s.clock.Now(), closedBy)
		if err != nil {
			return err
		}
		out = updated
		return nil
	})
	return out, err
}

// readerRole works out whether readerUserID may open an incident an
// arbitrary tenant user reported: the reporter always may, and so may
// campus security or school leadership, since a security duty is how the
// platform already expresses "runs the gate and campus safety" without a
// dedicated role for it.
func (s *Service) readerRole(ctx context.Context, tenantID, readerUserID, reporterID uuid.UUID) (domain.IncidentReaderRole, error) {
	role := domain.IncidentReaderRole{IsReporter: readerUserID == reporterID}
	yearID, ok, err := s.activeYear(ctx, tenantID)
	if err != nil {
		return role, err
	}
	if !ok {
		return role, nil
	}
	if role.IsSecurity, err = s.repo.HasActiveDuty(ctx, tenantID, yearID, readerUserID, dutySlugSecurity); err != nil {
		return role, err
	}
	if role.IsLeadership, err = s.repo.HasActiveDuty(ctx, tenantID, yearID, readerUserID, dutySlugLeadership); err != nil {
		return role, err
	}
	return role, nil
}

// GetIncident restricts the read to the reporter, campus security or
// leadership (an incident may name people not otherwise visible to a
// general visitors-viewer), and records every successful read in the
// platform's audit log.
func (s *Service) GetIncident(ctx context.Context, tenantID, id, readerUserID uuid.UUID) (domain.Incident, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return domain.Incident{}, err
	}
	var out domain.Incident
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		incident, ok, err := s.repo.GetIncident(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrIncidentNotFound
		}
		role, err := s.readerRole(ctx, tenantID, readerUserID, incident.ReportedBy)
		if err != nil {
			return err
		}
		if !incident.VisibleTo(role) {
			return domain.ErrIncidentForbidden
		}
		if s.audit != nil {
			if err := s.audit.Record(ctx, tenantID, "read", "visitor_incident", id); err != nil {
				return err
			}
		}
		out = incident
		return nil
	})
	return out, err
}

// ListIncidents is the office's incident log for a date range, narrowed to
// what readerUserID may individually open (see GetIncident): rows outside
// that stay off the list rather than appearing with an inaccessible
// detail link.
func (s *Service) ListIncidents(ctx context.Context, tenantID, readerUserID uuid.UUID, from, to time.Time, includeClosed bool, limit, offset int) ([]domain.Incident, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var rows []domain.Incident
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		rows, err = s.repo.ListIncidents(ctx, tenantID, from, to, includeClosed, limit, max(offset, 0))
		return err
	})
	if err != nil {
		return nil, err
	}
	out := make([]domain.Incident, 0, len(rows))
	for _, incident := range rows {
		role, err := s.readerRole(ctx, tenantID, readerUserID, incident.ReportedBy)
		if err != nil {
			return nil, err
		}
		if incident.VisibleTo(role) {
			out = append(out, incident)
		}
	}
	return out, nil
}
