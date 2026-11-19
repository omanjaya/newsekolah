package http

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

// TestToAPIDutiesScopeLabel proves the class name the service resolves for a
// class-scoped duty reaches the response as scope_label, and that a duty
// without one leaves the field out.
func TestToAPIDutiesScopeLabel(t *testing.T) {
	require.Nil(t, toAPIDuties(nil))

	classID := uuid.New()
	duties := toAPIDuties([]service.DutyView{
		{Slug: "homeroom", ScopeKind: "class", ScopeID: uuid.NullUUID{UUID: classID, Valid: true}, ScopeLabel: "X-A"},
		{Slug: "picket", ScopeKind: "school"},
	})
	require.NotNil(t, duties)
	require.Len(t, *duties, 2)

	homeroom := (*duties)[0]
	require.Equal(t, "homeroom", homeroom.Slug)
	require.NotNil(t, homeroom.ScopeId)
	require.Equal(t, classID, *homeroom.ScopeId)
	require.NotNil(t, homeroom.ScopeLabel)
	require.Equal(t, "X-A", *homeroom.ScopeLabel)

	picket := (*duties)[1]
	require.Nil(t, picket.ScopeId)
	require.Nil(t, picket.ScopeLabel)
}
