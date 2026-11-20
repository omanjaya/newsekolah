package http

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
)

// TestLeaveReviewQueueOpenToLetterIssuers is the regression test for the
// counselor never seeing requests waiting for the letter: the counselor
// duty grants issue_leave_letters only, and the queue answered 403. The
// query itself limits rows to the caller's own duty stage.
func TestLeaveReviewQueueOpenToLetterIssuers(t *testing.T) {
	doc, err := api.GetSpec()
	require.NoError(t, err)
	ops, err := authz.LoadOperationPermissions(doc)
	require.NoError(t, err)

	perms, ok := ops.Permissions("ListLeaveRequestsForReview")
	require.True(t, ok)
	require.ElementsMatch(t, []string{authz.PermReviewLeaveRequests, authz.PermIssueLeaveLetters}, perms)
}
