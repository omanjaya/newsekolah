package service

import (
	"context"
	"fmt"
	"html"
	"log/slog"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/auth"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/notify"
)

// PasswordResetRecord is one valid, unused password_resets row.
type PasswordResetRecord struct {
	ID     uuid.UUID
	UserID uuid.UUID
}

// PasswordResetRepository is the data-access boundary for both the
// self-service "forgot password" flow and an admin-initiated reset -- the
// same password_resets table serves both, distinguished only by the
// channel column.
type PasswordResetRepository interface {
	GetUserByUsernameOrEmail(ctx context.Context, tenantID uuid.UUID, identifier string) (domain.User, bool, error)
	GetValidPasswordReset(ctx context.Context, tenantID uuid.UUID, tokenHash []byte) (PasswordResetRecord, error)
	MarkPasswordResetUsed(ctx context.Context, tenantID, id uuid.UUID) error
	// InvalidatePasswordResetsForUser marks every still-unused password
	// reset token for userID as used, so an older token cannot be
	// redeemed alongside (or after) a newer one.
	InvalidatePasswordResetsForUser(ctx context.Context, tenantID, userID uuid.UUID) error
}

// RequestPasswordReset always behaves the same way to the caller (202,
// eventually) whether or not the identifier matches an account, so the
// response never discloses which usernames/emails exist
// (docs/08-security.md section 2). ip is rate limited independently of any
// particular account.
func (s *Service) RequestPasswordReset(ctx context.Context, tenantID uuid.UUID, usernameOrEmail, ip string) error {
	if s.extras.ResetLimiter != nil {
		allowed, err := s.extras.ResetLimiter.Allow(ctx, ip)
		if err != nil {
			return fmt.Errorf("password reset rate limit: %w", err)
		}
		if !allowed {
			return domain.ErrRateLimited
		}
	}

	usernameOrEmail = domain.NormalizeUsername(usernameOrEmail)
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		user, found, err := s.repo.GetUserByUsernameOrEmail(ctx, tenantID, usernameOrEmail)
		if err != nil {
			return fmt.Errorf("look up user for password reset: %w", err)
		}
		if !found {
			return nil
		}

		token, hash, err := s.newRefresh()
		if err != nil {
			return err
		}
		// A fresh token supersedes any earlier one still outstanding for
		// this account, so a stale reset link cannot be used after a
		// newer request was made.
		if err := s.repo.InvalidatePasswordResetsForUser(ctx, tenantID, user.ID); err != nil {
			return fmt.Errorf("invalidate previous password resets: %w", err)
		}
		if err := s.repo.CreatePasswordResetRecord(ctx, NewPasswordReset{
			TenantID: tenantID, UserID: user.ID, TokenHash: hash, Channel: "email",
			ExpiresAt: s.clock.Now().Add(passwordResetTTL),
		}); err != nil {
			return fmt.Errorf("create password reset: %w", err)
		}

		s.sendPasswordResetEmail(ctx, user, token)
		return audit.RecordSimple(ctx, tenantID, "password_reset.request", "user", user.ID)
	})
}

func (s *Service) sendPasswordResetEmail(ctx context.Context, user domain.User, token string) {
	if s.extras.Email == nil || user.Email == "" {
		slog.DebugContext(ctx, "password reset requested but no email configured or on file", "user_id", user.ID)
		return
	}
	link := s.cfg.WebBaseURL + "/reset-password?token=" + token
	text := "Use this link within 30 minutes to set a new password: " + link
	msg := notify.EmailMessage{
		To:       user.Email,
		Subject:  "Reset your password",
		TextBody: text,
		HTMLBody: "<p>Use this link within 30 minutes to set a new password:</p><p><a href=\"" + html.EscapeString(link) + "\">" + html.EscapeString(link) + "</a></p>",
	}
	if err := s.extras.Email.Send(ctx, msg); err != nil {
		slog.ErrorContext(ctx, "send password reset email failed", "user_id", user.ID, "error", err)
	}
}

// ConfirmPasswordReset consumes token, sets newPassword, marks the token
// used (single use), and revokes every existing session for the account
// (docs/08-security.md section 2). It serves both the self-service flow
// and an admin-issued reset link -- the token's channel does not change
// how confirm behaves.
func (s *Service) ConfirmPasswordReset(ctx context.Context, tenantID uuid.UUID, token, newPassword string) error {
	if err := domain.ValidatePasswordPolicy(newPassword); err != nil {
		return err
	}
	hash := auth.HashRefreshToken(token)

	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		reset, err := s.repo.GetValidPasswordReset(ctx, tenantID, hash)
		if err != nil {
			return domain.ErrPasswordResetTokenInvalid
		}

		pwHash, err := auth.HashPassword(newPassword)
		if err != nil {
			return fmt.Errorf("hash new password: %w", err)
		}
		if err := s.repo.UpdateUserPassword(ctx, tenantID, reset.UserID, pwHash); err != nil {
			return fmt.Errorf("update password: %w", err)
		}
		if err := s.repo.MarkPasswordResetUsed(ctx, tenantID, reset.ID); err != nil {
			return fmt.Errorf("mark password reset used: %w", err)
		}
		// Any other unused reset token for this account is now stale: the
		// password it targets no longer applies, so it must not stay
		// redeemable.
		if err := s.repo.InvalidatePasswordResetsForUser(ctx, tenantID, reset.UserID); err != nil {
			return fmt.Errorf("invalidate other password resets: %w", err)
		}
		// uuid.Nil never matches a real session id, so this revokes every
		// session for the account -- there is no "current session" to
		// exempt in this unauthenticated flow.
		revokedIDs, err := s.repo.RevokeOtherSessions(ctx, tenantID, reset.UserID, uuid.Nil, "password_reset")
		if err != nil {
			return fmt.Errorf("revoke sessions: %w", err)
		}
		s.invalidateSessions(ctx, tenantID, revokedIDs)
		s.revokePushDevices(ctx, tenantID, reset.UserID)
		return audit.RecordSimple(ctx, tenantID, "password_reset.confirm", "user", reset.UserID)
	})
}
