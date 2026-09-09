package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
)

func (s *Service) ListViolationTypes(ctx context.Context, tenantID uuid.UUID, includeInactive bool) ([]domain.ViolationType, error) {
	var out []domain.ViolationType
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListViolationTypes(ctx, tenantID, includeInactive)
		return err
	})
	return out, err
}

func (s *Service) CreateViolationType(ctx context.Context, t domain.ViolationType) (domain.ViolationType, error) {
	t.Code = strings.ToUpper(strings.TrimSpace(t.Code))
	t.Name = strings.TrimSpace(t.Name)
	if t.Code == "" || t.Name == "" || t.Points < 0 {
		return domain.ViolationType{}, domain.ErrInvalidInput
	}
	if t.Category == "" {
		t.Category = "general"
	}
	t.IsActive = true
	var out domain.ViolationType
	err := s.withTx(ctx, t.TenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.CreateViolationType(ctx, t)
		return err
	})
	return out, err
}

func (s *Service) UpdateViolationType(ctx context.Context, t domain.ViolationType) (domain.ViolationType, error) {
	t.Code = strings.ToUpper(strings.TrimSpace(t.Code))
	t.Name = strings.TrimSpace(t.Name)
	if t.Code == "" || t.Name == "" || t.Points < 0 {
		return domain.ViolationType{}, domain.ErrInvalidInput
	}
	var out domain.ViolationType
	err := s.withTx(ctx, t.TenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.UpdateViolationType(ctx, t)
		return err
	})
	return out, err
}

func (s *Service) DeleteViolationType(ctx context.Context, tenantID, id uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.DeleteViolationType(ctx, tenantID, id)
	})
}

type RecordInput struct {
	StudentUserID       uuid.UUID
	ViolationTypeID     uuid.UUID
	OccurredOn          time.Time
	Notes               string
	AttendanceSessionID uuid.NullUUID
	WorkflowInstanceID  uuid.NullUUID
	ReporterUserID      uuid.UUID
}

// RecordResult carries the new total and any warning letter now due, so
// the UI can prompt the counselor right after saving.
type RecordResult struct {
	Record      domain.ViolationRecord
	TotalPoints int
	DueLevels   []domain.SPLevel
}

// RecordViolation snapshots the type's points at the time of the offence
// so later catalog edits never rewrite history.
func (s *Service) RecordViolation(ctx context.Context, tenantID uuid.UUID, in RecordInput) (RecordResult, error) {
	if in.StudentUserID == uuid.Nil || in.ViolationTypeID == uuid.Nil || in.OccurredOn.IsZero() {
		return RecordResult{}, domain.ErrInvalidInput
	}
	var out RecordResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		vt, ok, err := s.repo.GetViolationType(ctx, tenantID, in.ViolationTypeID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrViolationTypeNotFound
		}
		if !vt.IsActive {
			return domain.ErrViolationTypeInactive
		}
		record, err := s.repo.CreateRecord(ctx, domain.ViolationRecord{
			TenantID: tenantID, AcademicYearID: yearID, StudentUserID: in.StudentUserID, ViolationTypeID: vt.ID,
			PointsSnapshot: vt.Points, OccurredOn: in.OccurredOn, Notes: strings.TrimSpace(in.Notes),
			AttendanceSessionID: in.AttendanceSessionID, WorkflowInstanceID: in.WorkflowInstanceID, ReporterUserID: in.ReporterUserID,
		})
		if err != nil {
			return err
		}
		record.TypeCode, record.TypeName, record.TypeCategory = vt.Code, vt.Name, vt.Category
		out.Record = record
		out.TotalPoints, out.DueLevels, err = s.dueLevels(ctx, tenantID, yearID, in.StudentUserID)
		return err
	})
	return out, err
}

func (s *Service) dueLevels(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (int, []domain.SPLevel, error) {
	total, err := s.repo.SumActivePoints(ctx, tenantID, yearID, studentID)
	if err != nil {
		return 0, nil, err
	}
	policy, err := s.loadPolicy(ctx, tenantID)
	if err != nil {
		return 0, nil, err
	}
	issued, err := s.repo.ListLettersForStudent(ctx, tenantID, yearID, studentID)
	if err != nil {
		return 0, nil, err
	}
	return total, policy.DueLevels(total, issued), nil
}

func (s *Service) VoidViolation(ctx context.Context, tenantID, recordID, actorUserID uuid.UUID, reason string) (domain.ViolationRecord, error) {
	if strings.TrimSpace(reason) == "" {
		return domain.ViolationRecord{}, domain.ErrInvalidInput
	}
	var out domain.ViolationRecord
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetRecord(ctx, tenantID, recordID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrRecordNotFound
		}
		if current.IsVoided() {
			return domain.ErrRecordAlreadyVoided
		}
		out, _, err = s.repo.VoidRecord(ctx, tenantID, recordID, actorUserID, strings.TrimSpace(reason))
		return err
	})
	return out, err
}

func (s *Service) ListRecords(ctx context.Context, tenantID uuid.UUID, f RecordFilter) ([]domain.ViolationRecord, error) {
	if f.Limit <= 0 || f.Limit > 200 {
		f.Limit = 50
	}
	var out []domain.ViolationRecord
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListRecords(ctx, tenantID, yearID, f)
		return err
	})
	return out, err
}

// StudentSummary is the discipline card on a student's detail page.
type StudentSummary struct {
	StudentUserID uuid.UUID
	TotalPoints   int
	Records       []domain.ViolationRecord
	Letters       []domain.WarningLetter
	DueLevels     []domain.SPLevel
	Policy        domain.SPPolicy
}

func (s *Service) StudentSummary(ctx context.Context, tenantID, studentID uuid.UUID) (StudentSummary, error) {
	out := StudentSummary{StudentUserID: studentID}
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		if out.Records, err = s.repo.ListRecordsForStudent(ctx, tenantID, yearID, studentID); err != nil {
			return err
		}
		if out.Letters, err = s.repo.ListLettersForStudent(ctx, tenantID, yearID, studentID); err != nil {
			return err
		}
		if out.Policy, err = s.loadPolicy(ctx, tenantID); err != nil {
			return err
		}
		if out.TotalPoints, err = s.repo.SumActivePoints(ctx, tenantID, yearID, studentID); err != nil {
			return err
		}
		out.DueLevels = out.Policy.DueLevels(out.TotalPoints, out.Letters)
		return nil
	})
	return out, err
}

func (s *Service) PointTotals(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID, limit int) ([]PointTotal, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	var out []PointTotal
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		out, err = s.repo.ListPointTotals(ctx, tenantID, yearID, classID, limit)
		return err
	})
	return out, err
}
