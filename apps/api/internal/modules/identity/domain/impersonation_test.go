package domain

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestValidateImpersonationTarget(t *testing.T) {
	actor := uuid.New()
	target := uuid.New()

	require.ErrorIs(t,
		ValidateImpersonationTarget(actor, ImpersonationTarget{ID: actor, Status: UserActive}),
		ErrCannotImpersonateSelf,
	)
	require.ErrorIs(t,
		ValidateImpersonationTarget(actor, ImpersonationTarget{ID: target, Status: UserActive, IsSuperAdmin: true}),
		ErrCannotImpersonateSuperAdmin,
	)
	require.ErrorIs(t,
		ValidateImpersonationTarget(actor, ImpersonationTarget{ID: target, Status: UserInactive}),
		ErrCannotImpersonateInactive,
	)
	require.NoError(t,
		ValidateImpersonationTarget(actor, ImpersonationTarget{ID: target, Status: UserActive}),
	)
}
