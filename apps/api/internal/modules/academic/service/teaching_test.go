package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

// TestSyncTeacherAssignmentsRejectsTooManyClasses proves the 100-class cap
// (maxTeachingAssignmentClasses, mirroring the old app's
// validTeacherSubjectAssignmentInput) rejects an oversized bulk sync
// request before opening a transaction -- a request this large is almost
// certainly a bad request, not a legitimate large tenant.
func TestSyncTeacherAssignmentsRejectsTooManyClasses(t *testing.T) {
	svc := &Service{}
	pairs := make([]SubjectClassPair, maxTeachingAssignmentClasses+1)
	for i := range pairs {
		pairs[i] = SubjectClassPair{SubjectID: uuid.New(), ClassID: uuid.New()}
	}

	_, err := svc.SyncTeacherAssignments(context.Background(), uuid.New(), uuid.New(), uuid.New(), pairs)
	require.ErrorIs(t, err, domain.ErrTooManyClasses)
}
