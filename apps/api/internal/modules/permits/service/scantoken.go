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
