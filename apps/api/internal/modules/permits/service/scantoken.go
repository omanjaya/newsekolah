package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// IssueScanTokenInput is what any caller minting a token supplies. Context
// binds the token to what it is for: a workflow_instances.id for
// approve_stage/gate_exit, a classes.id for classroom_entry (used by the
// attendance module after merge), or nothing for a purpose that does not
// need one.
type IssueScanTokenInput struct {
	TenantID       uuid.UUID
	Purpose        domain.Purpose
	ContextID      uuid.NullUUID
	IssuedByUserID uuid.UUID
	// PeriodEndsAt is only consulted for PurposeGateExit (domain.TokenTTL);
	// every other purpose ignores it.
	PeriodEndsAt time.Time
}

// IssueScanToken mints a token: 32 random bytes, URL-safe base64 for
// display/QR, SHA-256 of the raw bytes stored (never the raw value).
func (s *Service) IssueScanToken(ctx context.Context, in IssueScanTokenInput) (domain.IssueResult, error) {
	if !in.Purpose.Valid() {
		return domain.IssueResult{}, fmt.Errorf("%w: purpose %q", domain.ErrTokenPurposeMismatch, in.Purpose)
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return domain.IssueResult{}, fmt.Errorf("generate scan token: %w", err)
	}
	rawValue := base64.RawURLEncoding.EncodeToString(raw)
	hash := hashScanToken(rawValue)

	now := s.clock.Now()
	expiresAt := now.Add(domain.TokenTTL(in.Purpose, now, in.PeriodEndsAt))

	var token domain.ScanToken
	err := s.withTx(ctx, in.TenantID, func(ctx context.Context) error {
		var err error
		token, err = s.repo.CreateScanToken(ctx, domain.ScanToken{
			TenantID: in.TenantID, Purpose: in.Purpose, ContextID: in.ContextID,
			IssuedByUserID: in.IssuedByUserID, Hash: hash, ExpiresAt: expiresAt,
		})
		return err
	})
	if err != nil {
		return domain.IssueResult{}, err
	}

	return domain.IssueResult{Token: token, RawValue: rawValue, ExpiresAt: expiresAt}, nil
}

// ConsumeScanTokenInput is what a scanner (a student's device, security's
// gate scanner) supplies to redeem a token.
type ConsumeScanTokenInput struct {
	TenantID         uuid.UUID
	RawValue         string
	Purpose          domain.Purpose
	ContextID        uuid.NullUUID
	ConsumedByUserID uuid.UUID
}

// ConsumeScanToken redeems a token in one atomic UPDATE (Repository's
// ConsumeScanToken), then checks that purpose and context match what the
// caller expected -- a token minted for a different flow must not be
// usable here even if it happens to still be valid, per
// docs/08-security.md section 7 ("purpose terikat").
//
// A purpose/context mismatch still consumes the token (the UPDATE already
// committed): re-using a scanned QR code after a failed mismatch is not
// meaningfully different from any other single-use token, and refusing to
// consume it would require a second write anyway.
func (s *Service) ConsumeScanToken(ctx context.Context, in ConsumeScanTokenInput) (domain.ScanToken, error) {
	hash := hashScanToken(in.RawValue)
	now := s.clock.Now()

	var token domain.ScanToken
	var found bool
	err := s.withTx(ctx, in.TenantID, func(ctx context.Context) error {
		var err error
		token, found, err = s.repo.ConsumeScanToken(ctx, in.TenantID, hash, in.ConsumedByUserID, now)
		return err
	})
	if err != nil {
		return domain.ScanToken{}, err
	}
	if !found {
		return domain.ScanToken{}, domain.ErrTokenNotFound
	}
	if token.Purpose != in.Purpose {
		return domain.ScanToken{}, domain.ErrTokenPurposeMismatch
	}
	if in.ContextID.Valid && (!token.ContextID.Valid || token.ContextID.UUID != in.ContextID.UUID) {
		return domain.ScanToken{}, domain.ErrTokenContextMismatch
	}
	return token, nil
}

// ScanClassroomEntryInput is what a student calling /v1/classroom-entry/scan
// supplies: the teacher's displayed token, and the (optional) reason they
// are entering late/mid-lesson.
type ScanClassroomEntryInput struct {
	TenantID      uuid.UUID
	StudentUserID uuid.UUID
	RawToken      string
	Reason        string
}

// ScanClassroomEntryResult is what the endpoint reports back to the
// student's own device: who let them in.
type ScanClassroomEntryResult struct {
	TeacherUserID uuid.UUID
	TeacherName   string
}

// classroomEntryScannedEvent is the realtime payload pushed to the
// teacher's own topic (see RealtimePublisher) -- deliberately its own
// small struct, not an events.Envelope, since this never goes through the
// persisted notification inbox.
type classroomEntryScannedEvent struct {
	Type        string    `json:"type"`
	StudentName string    `json:"student_name"`
	NIS         string    `json:"nis"`
	ClassName   string    `json:"class_name"`
	Reason      string    `json:"reason"`
	ScannedAt   time.Time `json:"scanned_at"`
}

// maxReasonLength matches openapi/modules/permits.yaml's
// ScanClassroomEntryRequest.reason maxLength: 500.
const maxReasonLength = 500

// ScanClassroomEntry consumes a teacher's classroom-entry token. Missing
// rule (docs/analysis/backend-inventory.md 1.13): only a student profile
// may consume it -- a teacher or other staff account scanning it is not
// "a student entering class" -- and the teacher is told live, over their
// own realtime topic, who just walked in and why.
func (s *Service) ScanClassroomEntry(ctx context.Context, in ScanClassroomEntryInput) (ScanClassroomEntryResult, error) {
	if len(in.Reason) > maxReasonLength {
		return ScanClassroomEntryResult{}, domain.ErrReasonTooLong
	}
	reason := in.Reason
	if reason == "" {
		reason = "Izin masuk kelas"
	}

	var result ScanClassroomEntryResult
	var evt classroomEntryScannedEvent
	err := s.withTx(ctx, in.TenantID, func(ctx context.Context) error {
		isStudent, err := s.repo.IsStudentProfile(ctx, in.TenantID, in.StudentUserID)
		if err != nil {
			return err
		}
		if !isStudent {
			return domain.ErrScanTokenConsumerNotStudent
		}

		token, err := s.ConsumeScanToken(ctx, ConsumeScanTokenInput{
			TenantID: in.TenantID, RawValue: in.RawToken, Purpose: domain.PurposeClassroomEntry, ConsumedByUserID: in.StudentUserID,
		})
		if err != nil {
			return err
		}
		teacherName, err := s.repo.GetUserName(ctx, in.TenantID, token.IssuedByUserID)
		if err != nil {
			return err
		}
		result = ScanClassroomEntryResult{TeacherUserID: token.IssuedByUserID, TeacherName: teacherName}

		studentName, err := s.repo.GetUserName(ctx, in.TenantID, in.StudentUserID)
		if err != nil {
			return err
		}
		nis, _, err := s.repo.GetStudentNISAndAddress(ctx, in.TenantID, in.StudentUserID)
		if err != nil {
			return err
		}
		className := ""
		if yearID, ok, err := s.years.GetActiveAcademicYearID(ctx, in.TenantID); err == nil && ok {
			if enrollment, ok, err := s.repo.GetActiveEnrollment(ctx, in.TenantID, yearID, in.StudentUserID); err == nil && ok {
				className = enrollment.ClassName
			}
		}
		evt = classroomEntryScannedEvent{
			Type: "classroom_entry_scanned", StudentName: studentName, NIS: nis, ClassName: className,
			Reason: reason, ScannedAt: s.clock.Now(),
		}
		return nil
	})
	if err != nil {
		return ScanClassroomEntryResult{}, err
	}
	_ = s.realtime.PublishToUser(ctx, in.TenantID, result.TeacherUserID, evt)
	return result, nil
}

func hashScanToken(rawValue string) []byte {
	sum := sha256.Sum256([]byte(rawValue))
	return sum[:]
}

// CleanupExpiredScanTokens deletes scan_tokens rows expired more than a
// day ago, across every tenant. Run by the River periodic job in
// transport/jobs, per docs/06-database-schema.md section 7 ("job
// pembersihan harian").
func (s *Service) CleanupExpiredScanTokens(ctx context.Context) (int64, error) {
	tenants, err := s.repo.ListActiveTenants(ctx)
	if err != nil {
		return 0, fmt.Errorf("list tenants for token cleanup: %w", err)
	}

	cutoff := s.clock.Now().Add(-24 * time.Hour)
	var total int64
	for _, t := range tenants {
		err := s.withTx(ctx, t.ID, func(ctx context.Context) error {
			n, err := s.repo.DeleteExpiredScanTokens(ctx, t.ID, cutoff)
			total += n
			return err
		})
		if err != nil {
			return total, fmt.Errorf("cleanup scan tokens for tenant %s: %w", t.ID, err)
		}
	}
	return total, nil
}
