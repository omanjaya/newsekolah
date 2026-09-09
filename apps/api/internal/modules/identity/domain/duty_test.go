package domain

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestValidateDutyType(t *testing.T) {
	require.NoError(t, ValidateDutyType("homeroom", "Wali Kelas", DutyScopeClass))
	require.Error(t, ValidateDutyType("bad slug!", "Wali Kelas", DutyScopeClass))
	require.Error(t, ValidateDutyType("homeroom", "", DutyScopeClass))
	require.Error(t, ValidateDutyType("homeroom", "Wali Kelas", "invalid"))
}

func TestValidateDutyAssignment(t *testing.T) {
	classID := uuid.NullUUID{UUID: uuid.New(), Valid: true}
	studentID := uuid.NullUUID{UUID: uuid.New(), Valid: true}
	starts := time.Now()

	tests := []struct {
		name    string
		in      DutyAssignmentInput
		wantErr bool
	}{
		{
			name:    "school scope with no target is valid",
			in:      DutyAssignmentInput{ScopeKind: DutyScopeSchool, StartsOn: starts},
			wantErr: false,
		},
		{
			name:    "school scope with a class target is rejected",
			in:      DutyAssignmentInput{ScopeKind: DutyScopeSchool, ScopeClassID: classID, StartsOn: starts},
			wantErr: true,
		},
		{
			name:    "class scope requires a class id",
			in:      DutyAssignmentInput{ScopeKind: DutyScopeClass, StartsOn: starts},
			wantErr: true,
		},
		{
			name:    "class scope with class id is valid",
			in:      DutyAssignmentInput{ScopeKind: DutyScopeClass, ScopeClassID: classID, StartsOn: starts},
			wantErr: false,
		},
		{
			name:    "student scope requires a student id",
			in:      DutyAssignmentInput{ScopeKind: DutyScopeStudent, StartsOn: starts},
			wantErr: true,
		},
		{
			name:    "student scope with student id is valid",
			in:      DutyAssignmentInput{ScopeKind: DutyScopeStudent, ScopeStudentID: studentID, StartsOn: starts},
			wantErr: false,
		},
		{
			name:    "missing starts_on is rejected",
			in:      DutyAssignmentInput{ScopeKind: DutyScopeSchool},
			wantErr: true,
		},
		{
			name: "ends_on before starts_on is rejected",
			in: DutyAssignmentInput{
				ScopeKind: DutyScopeSchool, StartsOn: starts,
				EndsOn: timePtr(starts.Add(-24 * time.Hour)),
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateDutyAssignment(tt.in)
			if tt.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func timePtr(t time.Time) *time.Time { return &t }
