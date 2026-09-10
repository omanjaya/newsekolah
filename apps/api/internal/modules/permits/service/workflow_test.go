package service

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// TestValidateStages_GuardianOfStudent confirms a tenant can opt a
// guardian stage into a custom workflow definition (validateStages backs
// ReplaceDefinition, the workflow definition editor's write path).
func TestValidateStages_GuardianOfStudent(t *testing.T) {
	stages := []domain.Stage{
		{Key: "guardian", Label: "Orang tua", ApproverRule: domain.RuleGuardianOfStudent, Verification: domain.VerificationManual},
		{Key: "homeroom", Label: "Wali kelas", ApproverRule: domain.RuleHomeroomOfStudent, Verification: domain.VerificationManual, DistinctFrom: []string{"guardian"}},
	}
	require.NoError(t, validateStages(stages))
}

func TestValidApproverRule_GuardianOfStudent(t *testing.T) {
	require.True(t, validApproverRule(domain.RuleGuardianOfStudent))
}
