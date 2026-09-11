package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
)

func (s *Service) ListViolationTypes(ctx context.Context, tenantID uuid.UUID, includeInactive bool, search string) ([]domain.ViolationType, error) {
	var out []domain.ViolationType
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListViolationTypes(ctx, tenantID, includeInactive, strings.TrimSpace(search))
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

// RecordInput is also the surface other modules use to write a violation
// without importing the rest of discipline: attendance sets
// AttendanceSessionID for a session violation, permits' late-arrival
// review sets WorkflowInstanceID. See ViolationRecorder below.
type RecordInput struct {
	StudentUserID uuid.UUID
	// ViolationTypeID is the single-type form (kept for backward
	// compatibility with existing callers); ViolationTypeIDs is the batch
	// form. At least one id must end up in the merged, deduplicated set,
	// and at most maxViolationTypesPerRecord.
	ViolationTypeID     uuid.UUID
	ViolationTypeIDs    []uuid.UUID
	OccurredOn          time.Time
	Notes               string
	AttendanceSessionID uuid.NullUUID
	WorkflowInstanceID  uuid.NullUUID
	ReporterUserID      uuid.UUID
}

// validate checks the fields RecordViolation needs regardless of the
// database (student, date) and merges the singular/plural type fields
// into one deduplicated list, rejecting an empty set, more than 50 types,
// or a repeated id -- the old app's own invariant
// (student_violations.go:98-106 -- "1-50 distinct types").
func (in RecordInput) validate() ([]uuid.UUID, error) {
	if in.StudentUserID == uuid.Nil || in.OccurredOn.IsZero() {
		return nil, domain.ErrInvalidInput
	}
	ids := make([]uuid.UUID, 0, len(in.ViolationTypeIDs)+1)
	if in.ViolationTypeID != uuid.Nil {
		ids = append(ids, in.ViolationTypeID)
	}
	ids = append(ids, in.ViolationTypeIDs...)
	if len(ids) == 0 || len(ids) > maxViolationTypesPerRecord {
		return nil, domain.ErrInvalidInput
	}
	seen := make(map[uuid.UUID]bool, len(ids))
	for _, id := range ids {
		if id == uuid.Nil || seen[id] {
			return nil, domain.ErrInvalidInput
		}
		seen[id] = true
	}
	return ids, nil
}

// RecordResult carries the new total and any warning letter now due, so
// the UI can prompt the counselor right after saving. Record is the first
// row written this call (or found idempotent), kept for single-type
// callers; Records holds every row from a batch call.
type RecordResult struct {
	Record      domain.ViolationRecord
	Records     []domain.ViolationRecord
	TotalPoints int
	DueLevels   []domain.SPLevel
}

// ViolationRecorder is the small surface other modules depend on to
// record a violation without importing the rest of discipline: attendance
// wires session violations, permits' late-arrival review wires tardiness.
// RecordViolation is idempotent on (workflow_instance_id,
// violation_type_id) so a retried call never double-counts.
type ViolationRecorder interface {
	RecordViolation(ctx context.Context, tenantID uuid.UUID, in RecordInput) (RecordResult, error)
}

var _ ViolationRecorder = (*Service)(nil)

// RecordViolation snapshots each type's points at the time of the offence
// so later catalog edits never rewrite history, validates the student has
// an active enrollment in the active year (and is an active account), and
// records 1-50 distinct types in a single transaction.
func (s *Service) RecordViolation(ctx context.Context, tenantID uuid.UUID, in RecordInput) (RecordResult, error) {
	typeIDs, err := in.validate()
	if err != nil {
		return RecordResult{}, err
	}

	var (
		out     RecordResult
		classID uuid.NullUUID
		crossed []domain.SPLevel
	)
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		out, crossed, err = recordViolationCore(ctx, s.repo, policy, tenantID, yearID, in, typeIDs)
		if err != nil {
			return err
		}
		if len(crossed) > 0 {
			if classID, err = s.repo.ActiveClassID(ctx, tenantID, yearID, in.StudentUserID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return RecordResult{}, err
	}
	if s.events != nil {
		for _, lvl := range crossed {
			_ = s.events.Publish(ctx, ThresholdReached{
				TenantID: tenantID, StudentUserID: in.StudentUserID, ClassID: classID,
				Level: lvl.Level, LevelLabel: lvl.Label, ThresholdPoints: lvl.MinPoints, TotalPoints: out.TotalPoints,
			})
		}
	}
	return out, nil
}

// recordViolationCore is RecordViolation's transaction body, factored out
// of the *Service method (which only resolves the active year and policy,
// then opens the transaction) so it can be unit tested against a fake
// Repository without a database -- see violations_test.go.
func recordViolationCore(ctx context.Context, repo Repository, policy domain.SPPolicy, tenantID, yearID uuid.UUID, in RecordInput, typeIDs []uuid.UUID) (RecordResult, []domain.SPLevel, error) {
	if err := requireEligibleStudent(ctx, repo, tenantID, yearID, in.StudentUserID); err != nil {
		return RecordResult{}, nil, err
	}

	before, err := repo.SumActivePoints(ctx, tenantID, yearID, in.StudentUserID)
	if err != nil {
		return RecordResult{}, nil, err
	}

	var out RecordResult
	out.Records = make([]domain.ViolationRecord, 0, len(typeIDs))
	for _, typeID := range typeIDs {
		record, err := recordOne(ctx, repo, tenantID, yearID, in, typeID)
		if err != nil {
			return RecordResult{}, nil, err
		}
		out.Records = append(out.Records, record)
	}
	out.Record = out.Records[0]

	out.TotalPoints, err = repo.SumActivePoints(ctx, tenantID, yearID, in.StudentUserID)
	if err != nil {
		return RecordResult{}, nil, err
	}
	issued, err := repo.ListLettersForStudent(ctx, tenantID, yearID, in.StudentUserID)
	if err != nil {
		return RecordResult{}, nil, err
	}
	out.DueLevels = policy.DueLevels(out.TotalPoints, issued)

	var crossed []domain.SPLevel
	for _, lvl := range policy.Levels {
		if before < lvl.MinPoints && out.TotalPoints >= lvl.MinPoints {
			crossed = append(crossed, lvl)
		}
	}
	return out, crossed, nil
}

// requireEligibleStudent enforces the regression fix: a violation or
// counseling note's subject must be an active user with an active
// enrollment in the given (active) academic year, matching the old app's
// checks before recording (student_violations.go:108-122). Free function
// over Repository (rather than a *Service method) so it is usable both
// inside a transaction and directly from tests.
func requireEligibleStudent(ctx context.Context, repo Repository, tenantID, yearID, studentID uuid.UUID) error {
	enrolled, active, err := repo.StudentEligible(ctx, tenantID, yearID, studentID)
	if err != nil {
		return err
	}
	if !active {
		return domain.ErrStudentInactive
	}
	if !enrolled {
		return domain.ErrStudentNotEnrolled
	}
	return nil
}

// recordOne records a single type, first checking the workflow idempotency
// key so a retried cross-module call (attendance, late-arrival review)
// returns the row already written instead of a duplicate.
func recordOne(ctx context.Context, repo Repository, tenantID, yearID uuid.UUID, in RecordInput, typeID uuid.UUID) (domain.ViolationRecord, error) {
	if in.WorkflowInstanceID.Valid {
		existing, ok, err := repo.GetRecordByWorkflow(ctx, tenantID, in.WorkflowInstanceID.UUID, typeID)
		if err != nil {
			return domain.ViolationRecord{}, err
		}
		if ok {
			return existing, nil
		}
	}
	vt, ok, err := repo.GetViolationType(ctx, tenantID, typeID)
	if err != nil {
		return domain.ViolationRecord{}, err
	}
	if !ok {
		return domain.ViolationRecord{}, domain.ErrViolationTypeNotFound
	}
	if !vt.IsActive {
		return domain.ViolationRecord{}, domain.ErrViolationTypeInactive
	}
	record, err := repo.CreateRecord(ctx, domain.ViolationRecord{
		TenantID: tenantID, AcademicYearID: yearID, StudentUserID: in.StudentUserID, ViolationTypeID: vt.ID,
		PointsSnapshot: vt.Points, OccurredOn: in.OccurredOn, Notes: strings.TrimSpace(in.Notes),
		AttendanceSessionID: in.AttendanceSessionID, WorkflowInstanceID: in.WorkflowInstanceID, ReporterUserID: in.ReporterUserID,
	})
	if err != nil {
		return domain.ViolationRecord{}, err
	}
	record.TypeCode, record.TypeName, record.TypeCategory = vt.Code, vt.Name, vt.Category
	return record, nil
}

// ReplaceSessionViolations implements attendance's ViolationRecorder: it
// atomically replaces every violation recorded against
// (attendance_session_id, student_user_id) with violationTypeIDs, mirroring
// the old system's delete-then-reinsert per session
// (reference/sion-rebuild-go teacher_attendance.go L295-309) rather than
// discipline's usual audited void.
func (s *Service) ReplaceSessionViolations(
	ctx context.Context, tenantID, sessionID, studentUserID uuid.UUID, violationTypeIDs []uuid.UUID, occurredOn time.Time, reporterUserID uuid.UUID,
) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.repo.DeleteRecordsBySessionStudent(ctx, tenantID, sessionID, studentUserID); err != nil {
			return err
		}
		if len(violationTypeIDs) == 0 {
			return nil
		}
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		for _, typeID := range violationTypeIDs {
			vt, ok, err := s.repo.GetViolationType(ctx, tenantID, typeID)
			if err != nil {
				return err
			}
			if !ok {
				return domain.ErrViolationTypeNotFound
			}
			if !vt.IsActive {
				return domain.ErrViolationTypeInactive
			}
			if _, err := s.repo.CreateRecord(ctx, domain.ViolationRecord{
				TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentUserID, ViolationTypeID: vt.ID,
				PointsSnapshot: vt.Points, OccurredOn: occurredOn,
				AttendanceSessionID: uuid.NullUUID{UUID: sessionID, Valid: true}, ReporterUserID: reporterUserID,
			}); err != nil {
				return err
			}
		}
		return nil
	})
}

// ViolationSummary implements attendance's DisciplineReader for the
// homeroom roster (docs/analysis/backend-inventory.md section 1.9's
// student card): the count and total points of studentID's active
// (non-voided) violations this academic year.
func (s *Service) ViolationSummary(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID) (count, points int, err error) {
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		records, err := s.repo.ListRecordsForStudent(ctx, tenantID, academicYearID, studentUserID)
		if err != nil {
			return err
		}
		for _, r := range records {
			if r.IsVoided() {
				continue
			}
			count++
			points += r.PointsSnapshot
		}
		return nil
	})
	return count, points, err
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

// FirstCrossedDates returns, per student, the date each SP level was
// first reached -- the old app's "Status SP" report column
// (violation_reports.go:152-169) that the point recap lost.
func (s *Service) FirstCrossedDates(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID) (map[uuid.UUID]map[int]time.Time, error) {
	out := make(map[uuid.UUID]map[int]time.Time)
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		rows, err := s.repo.ListActivePoints(ctx, tenantID, yearID, classID)
		if err != nil {
			return err
		}
		byStudent := make(map[uuid.UUID][]domain.PointRecord)
		for _, r := range rows {
			byStudent[r.StudentUserID] = append(byStudent[r.StudentUserID], domain.PointRecord{Points: r.Points, OccurredOn: r.OccurredOn})
		}
		for studentID, records := range byStudent {
			out[studentID] = policy.FirstCrossedDates(records)
		}
		return nil
	})
	return out, err
}

// ListSPCandidates is the counselor's issuing screen: every student whose
// active total has reached at least the first SP level, searchable by
// name/NIS/class, optionally narrowed to one level. level 0 means "any
// reached level".
func (s *Service) ListSPCandidates(ctx context.Context, tenantID uuid.UUID, classID uuid.NullUUID, level int, search string, limit, offset int) ([]SPCandidate, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var out []SPCandidate
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		if len(policy.Levels) == 0 {
			return nil
		}
		minPoints := policy.Levels[0].MinPoints
		var maxPoints *int
		if level > 0 {
			found := false
			for i, lvl := range policy.Levels {
				if lvl.Level != level {
					continue
				}
				minPoints = lvl.MinPoints
				if i+1 < len(policy.Levels) {
					m := policy.Levels[i+1].MinPoints - 1
					maxPoints = &m
				}
				found = true
				break
			}
			if !found {
				return domain.ErrInvalidInput
			}
		}
		out, err = s.repo.ListSPCandidates(ctx, tenantID, yearID, CandidateFilter{
			ClassID: classID, Search: strings.TrimSpace(search), MinPoints: minPoints, MaxPoints: maxPoints, Limit: limit, Offset: offset,
		})
		return err
	})
	return out, err
}
