package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// fakeGuardianLinks is an in-memory GuardianLinks: a fixed set of
// (guardian, student) pairs the guardian holds leave-approval rights for.
type fakeGuardianLinks struct {
	links map[[2]uuid.UUID]bool
}

func (f fakeGuardianLinks) IsApprovingGuardianOf(_ context.Context, _, guardianUserID, studentUserID uuid.UUID) (bool, error) {
	return f.links[[2]uuid.UUID{guardianUserID, studentUserID}], nil
}

func (f fakeGuardianLinks) ApprovingChildrenOf(_ context.Context, _, guardianUserID uuid.UUID) ([]uuid.UUID, error) {
	var out []uuid.UUID
	for pair, ok := range f.links {
		if ok && pair[0] == guardianUserID {
			out = append(out, pair[1])
		}
	}
	return out, nil
}

// TestCheckApproverRule_GuardianOfStudent covers the two cases the task
// calls out explicitly: a guardian linked to the request's own subject is
// accepted, and a guardian linked only to a different student is refused.
func TestCheckApproverRule_GuardianOfStudent(t *testing.T) {
	tenantID := uuid.New()
	guardian := uuid.New()
	student := uuid.New()
	otherStudent := uuid.New()

	svc := &Service{guardians: fakeGuardianLinks{links: map[[2]uuid.UUID]bool{
		{guardian, student}: true,
	}}}

	t.Run("accepts the guardian linked to the request's own subject", func(t *testing.T) {
		eligible, err := svc.checkApproverRule(context.Background(), domain.RuleGuardianOfStudent, ruleContext{
			tenantID: tenantID, actorUserID: guardian, subjectUserID: student,
		})
		require.NoError(t, err)
		require.True(t, eligible)
	})

	t.Run("refuses a guardian of a different student", func(t *testing.T) {
		eligible, err := svc.checkApproverRule(context.Background(), domain.RuleGuardianOfStudent, ruleContext{
			tenantID: tenantID, actorUserID: guardian, subjectUserID: otherStudent,
		})
		require.NoError(t, err)
		require.False(t, eligible)
	})

	t.Run("refuses everyone when no guardian adapter is wired", func(t *testing.T) {
		unwired := &Service{}
		eligible, err := unwired.checkApproverRule(context.Background(), domain.RuleGuardianOfStudent, ruleContext{
			tenantID: tenantID, actorUserID: guardian, subjectUserID: student,
		})
		require.NoError(t, err)
		require.False(t, eligible)
	})
}
