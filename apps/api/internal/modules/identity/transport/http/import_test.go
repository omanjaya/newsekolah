package http

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/identity/service"
)

// TestImportResultSerialisesCleanRowErrorsAsEmptyArray pins the contract
// the web import screen relies on: errors is a required array, so a clean
// row (whose service outcome carries a nil slice) must serialise as
// "errors":[] and never as null. A null crashed the import page the moment
// a file with any valid row was previewed.
func TestImportResultSerialisesCleanRowErrorsAsEmptyArray(t *testing.T) {
	result := toAPIImportResult([]service.ImportRowOutcome{
		{RowNumber: 2, Username: "budi.santoso", Action: domain.ImportActionCreate},
		{RowNumber: 3, Action: domain.ImportActionError, Errors: []domain.ImportRowError{
			domain.NewImportRowError(domain.ImportErrNameRequired, "name"),
			domain.NewImportRowError(domain.ImportErrRoleNotFound, "role_slug", "role", "guru_bk"),
		}},
	})

	body, err := json.Marshal(result)
	require.NoError(t, err)

	var decoded struct {
		Data []struct {
			RowNumber int               `json:"row_number"`
			Errors    []json.RawMessage `json:"errors"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(body, &decoded))
	require.Len(t, decoded.Data, 2)
	require.NotNil(t, decoded.Data[0].Errors, "a clean row's errors must be [], not null")
	require.Empty(t, decoded.Data[0].Errors)
	require.Contains(t, string(body), `"errors":[]`)

	require.JSONEq(t,
		`[{"code":"NAME_REQUIRED","field":"name"},{"code":"ROLE_NOT_FOUND","field":"role_slug","params":{"role":"guru_bk"}}]`,
		string(mustJSON(t, decoded.Data[1].Errors)))
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return b
}
