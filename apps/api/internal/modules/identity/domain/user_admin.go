package domain

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// ProfileKind mirrors user_profiles.kind.
type ProfileKind string

const (
	ProfileStudent ProfileKind = "student"
	ProfileTeacher ProfileKind = "teacher"
	ProfileStaff   ProfileKind = "staff"
	ProfileParent  ProfileKind = "parent"
)

func (k ProfileKind) Valid() bool {
	switch k {
	case ProfileStudent, ProfileTeacher, ProfileStaff, ProfileParent:
		return true
	default:
		return false
	}
}

// SuperAdminRoleSlug is the one role slug that carries platform-wide trust;
// granting it is restricted regardless of who otherwise holds
// manage_permissions (docs/analysis/backend-inventory.md section 1.2).
const SuperAdminRoleSlug = "super_admin"

const maxUsernameAttempts = 50

// Slugify turns a display name into a username base: lowercase ASCII
// letters and digits only, runs of anything else collapsed to a single
// ".", trimmed of leading/trailing dots, and capped at 24 characters so a
// numeric disambiguator still leaves room under the 80-character column
// limit on users.username.
func Slugify(name string) string {
	var b strings.Builder
	lastWasSep := true // avoid a leading separator
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			lastWasSep = false
		case !lastWasSep:
			b.WriteByte('.')
			lastWasSep = true
		}
	}
	base := strings.Trim(b.String(), ".")
	if len(base) > 24 {
		base = strings.Trim(base[:24], ".")
	}
	return base
}

// GenerateUsername returns the first candidate derived from name that
// exists reports as free, trying "base", "base2", "base3", ... A blank
// name still yields a usable base ("user2", "user3", ...) rather than
// failing outright.
func GenerateUsername(name string, exists func(candidate string) bool) (string, error) {
	base := Slugify(name)
	if base == "" {
		base = "user"
	}
	for i := 0; i < maxUsernameAttempts; i++ {
		candidate := base
		if i > 0 {
			candidate = fmt.Sprintf("%s%d", base, i+1)
		}
		if !exists(candidate) {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("generate username: no free candidate for %q after %d attempts", base, maxUsernameAttempts)
}

// RoleGrant is one role a user create/update request wants to assign.
type RoleGrant struct {
	RoleID    uuid.UUID
	Slug      string
	IsPrimary bool
	IsSystem  bool
}

// ValidateRoleGrants enforces the admin invariants
// docs/analysis/backend-inventory.md section 1.2 documents: exactly one
// primary role, only an existing super_admin can grant the super_admin
// role to anyone (including themselves acting on someone else), the
// primary role must be a system role, and every additional role must be a
// custom (tenant-defined) role.
func ValidateRoleGrants(actorIsSuperAdmin bool, grants []RoleGrant) error {
	if len(grants) == 0 {
		return ErrNoPrimaryRole
	}

	primaryCount := 0
	for _, g := range grants {
		if g.IsPrimary {
			primaryCount++
			if !g.IsSystem {
				return ErrPrimaryRoleNotSystem
			}
		} else if g.IsSystem {
			return ErrAdditionalRoleSystem
		}
		if g.Slug == SuperAdminRoleSlug && !actorIsSuperAdmin {
			return ErrOnlySuperAdminGrants
		}
	}
	if primaryCount != 1 {
		return ErrNoPrimaryRole
	}
	return nil
}

// ValidateArchiveTarget rejects an admin archiving their own account, the
// one self-service action that must go through "change password" /
// "delete my account" flows instead (docs/analysis/backend-inventory.md
// section 1.5).
func ValidateArchiveTarget(currentUserID, targetUserID uuid.UUID) error {
	if currentUserID == targetUserID {
		return ErrCannotArchiveSelf
	}
	return nil
}
