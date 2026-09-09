package domain

import "regexp"

var roleSlugPattern = regexp.MustCompile(`^[a-z0-9_]{2,50}$`)

// ValidateRoleSlug mirrors the roles.slug check constraint so a bad slug
// fails with a domain error before it ever reaches the database.
func ValidateRoleSlug(slug string) error {
	if !roleSlugPattern.MatchString(slug) {
		return ErrInvalidRoleSlug
	}
	return nil
}

// ValidateRoleMutation rejects renaming or re-slugging a system role
// (docs/analysis/backend-inventory.md section 1.3: "role sistem tidak bisa
// di-rename/hapus"). Permission changes on a system role are still allowed
// except for super_admin, which service.ReplaceRolePermissions enforces
// separately by always granting it every permission.
func ValidateRoleMutation(isSystem, slugChanged, nameChanged bool) error {
	if isSystem && (slugChanged || nameChanged) {
		return ErrRoleSystemImmutable
	}
	return nil
}

// ValidateRoleDeletable rejects deleting a system role outright, or any
// role still held by at least one user.
func ValidateRoleDeletable(isSystem bool, assignedUserCount int) error {
	if isSystem {
		return ErrRoleSystemImmutable
	}
	if assignedUserCount > 0 {
		return ErrRoleInUse
	}
	return nil
}
