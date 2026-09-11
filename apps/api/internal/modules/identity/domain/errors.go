package domain

import "errors"

var (
	ErrUserNotFound         = errors.New("user not found")
	ErrInvalidCredentials   = errors.New("invalid credentials")
	ErrAccountNotActive     = errors.New("account is not active")
	ErrInvalidRelation      = errors.New("parent-student link is invalid")
	ErrMfaNotAvailable      = errors.New("two-factor authentication is not configured")
	ErrMfaNotEnrolled       = errors.New("two-factor authentication is not enrolled")
	ErrMfaInvalidCode       = errors.New("two-factor code is invalid")
	ErrMfaRequired          = errors.New("two-factor code required")
	ErrPasswordTooShort     = errors.New("password must be at least 8 characters")
	ErrPasswordTooLong      = errors.New("password must be at most 128 characters")
	ErrSessionNotFound      = errors.New("session not found")
	ErrSessionExpired       = errors.New("session expired")
	ErrSessionRevoked       = errors.New("session revoked")
	ErrRefreshReuseDetected = errors.New("refresh token reuse detected")
	ErrRateLimited          = errors.New("rate limited")

	// Users admin
	ErrUserAlreadyExists    = errors.New("username, email, nis, or nip already in use")
	ErrCannotArchiveSelf    = errors.New("cannot archive own account")
	ErrOnlySuperAdminGrants = errors.New("only a super admin can grant the super admin role")
	ErrNoPrimaryRole        = errors.New("exactly one role must be marked primary")
	ErrPrimaryRoleNotSystem = errors.New("the primary role must be a system role")
	ErrAdditionalRoleSystem = errors.New("additional roles must be custom roles, not system roles")
	ErrInvalidProfileKind   = errors.New("invalid profile kind")

	// Roles and permissions
	ErrRoleNotFound          = errors.New("role not found")
	ErrInvalidRoleSlug       = errors.New("role slug must be 2-50 lowercase letters, digits, or underscores")
	ErrRoleSystemImmutable   = errors.New("system role slug and name cannot be changed")
	ErrRoleInUse             = errors.New("role is still assigned to one or more users")
	ErrUnknownPermission     = errors.New("unknown permission code")
	ErrLeavePermissionDirect = errors.New("review_leave_requests and issue_leave_letters cannot be granted directly to the teacher role; they must come from a duty assignment")

	// Duties
	ErrDutyTypeNotFound       = errors.New("duty type not found")
	ErrDutyTypeInUse          = errors.New("duty type has one or more assignments")
	ErrDutyAssignmentNotFound = errors.New("duty assignment not found")
	ErrInvalidScopeKind       = errors.New("invalid scope kind")
	ErrScopeTargetNotFound    = errors.New("scope target (class or student) not found")
	ErrAssigneeNotEligible    = errors.New("assignee must be an active user with a teacher or staff profile")

	// Impersonation
	ErrCannotImpersonateSelf       = errors.New("cannot impersonate own account")
	ErrCannotImpersonateSuperAdmin = errors.New("cannot impersonate a super admin")
	ErrCannotImpersonateInactive   = errors.New("cannot impersonate an inactive user")
	ErrNotImpersonating            = errors.New("current session is not an impersonation session")

	// Password reset
	ErrPasswordResetTokenInvalid = errors.New("password reset token is invalid, used, or expired")

	// Auth settings
	ErrInvalidSessionDays = errors.New("session_days must be between 1 and 365")

	// Avatar / upload
	ErrUploadNotConfigured   = errors.New("file storage is not configured")
	ErrUploadInvalidFileType = errors.New("unsupported file type")
	ErrUploadFileTooLarge    = errors.New("file exceeds the allowed size")
	ErrUploadObjectNotOwned  = errors.New("uploaded object does not belong to this tenant/user")

	// Import
	ErrImportFileInvalid  = errors.New("import file is unreadable or does not match the template")
	ErrImportEmpty        = errors.New("import batch has no rows")
	ErrImportTooManyRows  = errors.New("import batch exceeds the 5000 row limit")
	ErrImportHasRowErrors = errors.New("import batch has one or more invalid rows; nothing was committed")

	// Google Workspace SSO
	ErrSSONotConfigured        = errors.New("google sso is not configured for this school")
	ErrSSOAccountNotFound      = errors.New("no active account matches this google account's email")
	ErrSSOInvalidToken         = errors.New("google id token is invalid")
	ErrSSOClientSecretRequired = errors.New("client secret is required to configure google sso")

	// Passkeys (WebAuthn)
	ErrPasskeyNotConfigured   = errors.New("passkeys are not configured on this server")
	ErrPasskeyNotFound        = errors.New("passkey not found")
	ErrPasskeyChallenge       = errors.New("passkey ceremony expired or was not found")
	ErrPasskeyInvalidResponse = errors.New("passkey response is invalid")
)
