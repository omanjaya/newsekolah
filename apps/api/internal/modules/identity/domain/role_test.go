package domain

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateRoleSlug(t *testing.T) {
	require.NoError(t, ValidateRoleSlug("homeroom_teacher"))
	require.ErrorIs(t, ValidateRoleSlug("A"), ErrInvalidRoleSlug)
	require.ErrorIs(t, ValidateRoleSlug("has space"), ErrInvalidRoleSlug)
	require.ErrorIs(t, ValidateRoleSlug(""), ErrInvalidRoleSlug)
}

func TestValidateRoleMutation(t *testing.T) {
	require.NoError(t, ValidateRoleMutation(false, true, true))
	require.NoError(t, ValidateRoleMutation(true, false, false))
	require.ErrorIs(t, ValidateRoleMutation(true, true, false), ErrRoleSystemImmutable)
	require.ErrorIs(t, ValidateRoleMutation(true, false, true), ErrRoleSystemImmutable)
}

func TestValidateRoleDeletable(t *testing.T) {
	require.NoError(t, ValidateRoleDeletable(false, 0))
	require.ErrorIs(t, ValidateRoleDeletable(true, 0), ErrRoleSystemImmutable)
	require.ErrorIs(t, ValidateRoleDeletable(false, 3), ErrRoleInUse)
}
