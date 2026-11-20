package http

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

// An account with no school profile (the platform's Super Admin) has no
// profile kind. The users list used to send profile_kind "", which is not
// a ProfileKind, and the web table showed the raw message key
// "app.school.users.kinds." for it. The field is now left out.
func TestAdminUserLeavesOutAnEmptyProfileKind(t *testing.T) {
	raw, err := json.Marshal(toAPIAdminUser(service.UserAdminView{Username: "superadmin", Name: "Super Admin"}))
	require.NoError(t, err)
	var body map[string]any
	require.NoError(t, json.Unmarshal(raw, &body))
	require.NotContains(t, body, "profile_kind")

	raw, err = json.Marshal(toAPIAdminUser(service.UserAdminView{Username: "guru", ProfileKind: domain.ProfileKind("teacher")}))
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(raw, &body))
	require.Equal(t, "teacher", body["profile_kind"])
}
