package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/hex"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
)

// MfaRepository is the TOTP slice of the identity repository.
type MfaRepository interface {
	GetTOTP(ctx context.Context, tenantID, userID uuid.UUID) (TOTPRecord, bool, error)
	UpsertTOTP(ctx context.Context, tenantID, userID uuid.UUID, secret []byte, recoveryHashes []string) error
	ConfirmTOTP(ctx context.Context, tenantID, userID uuid.UUID) error
	SetRecoveryCodes(ctx context.Context, tenantID, userID uuid.UUID, hashes []string) error
	DeleteTOTP(ctx context.Context, tenantID, userID uuid.UUID) error
}

// TOTPRecord is the stored enrolment: the sealed secret, whether the user
// finished verifying it, and the unused recovery code hashes.
type TOTPRecord struct {
	SecretEncrypted []byte
	Confirmed       bool
	RecoveryHashes  []string
}

// Sealer encrypts the TOTP secret at rest (platform/crypto).
type Sealer interface {
	Seal(plaintext []byte) ([]byte, error)
	Open(ciphertext []byte) ([]byte, error)
}

const (
	totpIssuer         = "SION"
	recoveryCodeCount  = 8
	recoveryCodeBytes  = 5
	totpSecretSizeByte = 20
)

// TOTPEnrolment is what the user needs to add the account to their app.
type TOTPEnrolment struct {
	Secret        string
	OTPAuthURL    string
	RecoveryCodes []string
}

// StartTOTPEnrolment generates a fresh secret and a set of one-time
// recovery codes. Nothing is active until ConfirmTOTPEnrolment succeeds,
// so an abandoned enrolment cannot lock anyone out.
func (s *Service) StartTOTPEnrolment(ctx context.Context, tenantID, userID uuid.UUID, accountName string) (TOTPEnrolment, error) {
	if s.mfaSealer == nil || s.mfaRepo == nil {
		return TOTPEnrolment{}, domain.ErrMfaNotAvailable
	}
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer: totpIssuer, AccountName: accountName, SecretSize: totpSecretSizeByte, Algorithm: otp.AlgorithmSHA1,
	})
	if err != nil {
		return TOTPEnrolment{}, fmt.Errorf("generate totp secret: %w", err)
	}
	codes, hashes, err := newRecoveryCodes()
	if err != nil {
		return TOTPEnrolment{}, err
	}
	sealed, err := s.mfaSealer.Seal([]byte(key.Secret()))
	if err != nil {
		return TOTPEnrolment{}, fmt.Errorf("seal totp secret: %w", err)
	}
	if err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.mfaRepo.UpsertTOTP(ctx, tenantID, userID, sealed, hashes)
	}); err != nil {
		return TOTPEnrolment{}, err
	}
	return TOTPEnrolment{Secret: key.Secret(), OTPAuthURL: key.URL(), RecoveryCodes: codes}, nil
}

// ConfirmTOTPEnrolment activates the enrolment once the user proves they
// can produce a current code.
func (s *Service) ConfirmTOTPEnrolment(ctx context.Context, tenantID, userID uuid.UUID, code string) error {
	if s.mfaSealer == nil || s.mfaRepo == nil {
		return domain.ErrMfaNotAvailable
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		record, ok, err := s.mfaRepo.GetTOTP(ctx, tenantID, userID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrMfaNotEnrolled
		}
		secret, err := s.mfaSealer.Open(record.SecretEncrypted)
		if err != nil {
			return domain.ErrMfaInvalidCode
		}
		if !totp.Validate(strings.TrimSpace(code), string(secret)) {
			return domain.ErrMfaInvalidCode
		}
		return s.mfaRepo.ConfirmTOTP(ctx, tenantID, userID)
	})
}

// DisableTOTP removes the enrolment after checking a current code, so a
// stolen session alone cannot turn two-factor off.
func (s *Service) DisableTOTP(ctx context.Context, tenantID, userID uuid.UUID, code string) error {
	if s.mfaRepo == nil {
		return domain.ErrMfaNotAvailable
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.verifyTOTPInTx(ctx, tenantID, userID, code); err != nil {
			return err
		}
		return s.mfaRepo.DeleteTOTP(ctx, tenantID, userID)
	})
}

// TOTPStatus reports whether two-factor is enrolled and confirmed, and how
// many recovery codes remain.
func (s *Service) TOTPStatus(ctx context.Context, tenantID, userID uuid.UUID) (enrolled, confirmed bool, remainingCodes int, err error) {
	if s.mfaRepo == nil {
		return false, false, 0, nil
	}
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		record, ok, err := s.mfaRepo.GetTOTP(ctx, tenantID, userID)
		if err != nil {
			return err
		}
		enrolled, confirmed, remainingCodes = ok, ok && record.Confirmed, len(record.RecoveryHashes)
		return nil
	})
	return enrolled, confirmed, remainingCodes, err
}

// RequiresTOTP reports whether this user has an active second factor,
// used by Login before it opens a session.
func (s *Service) RequiresTOTP(ctx context.Context, tenantID, userID uuid.UUID) (bool, error) {
	if s.mfaRepo == nil {
		return false, nil
	}
	record, ok, err := s.mfaRepo.GetTOTP(ctx, tenantID, userID)
	if err != nil {
		return false, err
	}
	return ok && record.Confirmed, nil
}

// verifyTOTPInTx accepts either a current TOTP code or one unused recovery
// code; a used recovery code is consumed.
func (s *Service) verifyTOTPInTx(ctx context.Context, tenantID, userID uuid.UUID, code string) error {
	record, ok, err := s.mfaRepo.GetTOTP(ctx, tenantID, userID)
	if err != nil {
		return err
	}
	if !ok || !record.Confirmed {
		return domain.ErrMfaNotEnrolled
	}
	trimmed := strings.TrimSpace(code)
	if s.mfaSealer != nil {
		secret, err := s.mfaSealer.Open(record.SecretEncrypted)
		if err == nil && totp.Validate(trimmed, string(secret)) {
			return nil
		}
	}
	hash := hashRecoveryCode(trimmed)
	for i, stored := range record.RecoveryHashes {
		if stored != hash {
			continue
		}
		remaining := append(append([]string{}, record.RecoveryHashes[:i]...), record.RecoveryHashes[i+1:]...)
		return s.mfaRepo.SetRecoveryCodes(ctx, tenantID, userID, remaining)
	}
	return domain.ErrMfaInvalidCode
}

// VerifyTOTP is the login-time check.
func (s *Service) VerifyTOTP(ctx context.Context, tenantID, userID uuid.UUID, code string) error {
	if s.mfaRepo == nil {
		return domain.ErrMfaNotAvailable
	}
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.verifyTOTPInTx(ctx, tenantID, userID, code)
	})
}

// RegenerateRecoveryCodes issues a fresh set, invalidating the old ones.
func (s *Service) RegenerateRecoveryCodes(ctx context.Context, tenantID, userID uuid.UUID, code string) ([]string, error) {
	if s.mfaRepo == nil {
		return nil, domain.ErrMfaNotAvailable
	}
	var codes []string
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.verifyTOTPInTx(ctx, tenantID, userID, code); err != nil {
			return err
		}
		fresh, hashes, err := newRecoveryCodes()
		if err != nil {
			return err
		}
		codes = fresh
		return s.mfaRepo.SetRecoveryCodes(ctx, tenantID, userID, hashes)
	})
	return codes, err
}

// newRecoveryCodes returns the plaintext codes (shown once) and their
// hashes (all that is stored).
func newRecoveryCodes() (codes []string, hashes []string, err error) {
	codes = make([]string, recoveryCodeCount)
	hashes = make([]string, recoveryCodeCount)
	encoding := base32.StdEncoding.WithPadding(base32.NoPadding)
	for i := range codes {
		raw := make([]byte, recoveryCodeBytes)
		if _, err := rand.Read(raw); err != nil {
			return nil, nil, fmt.Errorf("generate recovery code: %w", err)
		}
		codes[i] = encoding.EncodeToString(raw)
		hashes[i] = hashRecoveryCode(codes[i])
	}
	return codes, hashes, nil
}

func hashRecoveryCode(code string) string {
	sum := sha256.Sum256([]byte(strings.ToUpper(strings.TrimSpace(code))))
	return hex.EncodeToString(sum[:])
}
