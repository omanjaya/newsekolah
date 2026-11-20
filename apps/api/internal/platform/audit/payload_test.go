package audit

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// untaggedFeeType mirrors a domain struct without json tags, the shape
// admin-settings-R2 found stored as AmountMinor, CreatedAt, TenantID.
type untaggedFeeType struct {
	ID             uuid.UUID
	TenantID       uuid.UUID
	AcademicYearID uuid.UUID
	Name           string
	AmountMinor    int64
	DayOfMonth     *int
	IPAllowlist    []string
	CreatedBy      uuid.NullUUID
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func TestMarshalOrNilSnakeCasesUntaggedStructs(t *testing.T) {
	year := uuid.New()
	raw, err := marshalOrNil(untaggedFeeType{
		ID: uuid.New(), TenantID: uuid.New(), AcademicYearID: year,
		Name: "SPP <Juli>", AmountMinor: 150000, IPAllowlist: []string{"10.0.0.1"},
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	})
	require.NoError(t, err)
	var got map[string]any
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Equal(t, map[string]any{
		"academic_year_id": year.String(),
		"name":             "SPP <Juli>",
		"amount_minor":     float64(150000),
		"day_of_month":     nil,
		"ip_allowlist":     []any{"10.0.0.1"},
	}, got, "Go field names become snake_case and bookkeeping fields are dropped")

	raw, err = marshalOrNil(&untaggedFeeType{Name: "SPP"})
	require.NoError(t, err)
	require.Contains(t, string(raw), `"amount_minor":0`, "a pointer to a struct is normalised too")
	require.NotContains(t, string(raw), "TenantID")
}

func TestMarshalOrNilKeepsShapedPayloads(t *testing.T) {
	for _, payload := range []any{
		map[string]any{"branding.accent_color": "#1F3A5F", "id": "kept"},
		struct {
			URL        string   `json:"url"`
			EventTypes []string `json:"event_types"`
		}{URL: "https://example.com", EventTypes: []string{"a"}},
		[]string{"view_billing"},
		map[string]any{"ID": "x", "SomeKey": 1},
		json.RawMessage(`{"TenantID":"kept","AmountMinor":1}`),
	} {
		want, err := json.Marshal(payload)
		require.NoError(t, err)
		got, err := marshalOrNil(payload)
		require.NoError(t, err)
		require.JSONEq(t, string(want), string(got))
	}
	got, err := marshalOrNil(nil)
	require.NoError(t, err)
	require.Nil(t, got)
}

func TestSnakeCase(t *testing.T) {
	for in, want := range map[string]string{
		"Cadence": "cadence", "DayOfMonth": "day_of_month", "AcademicYearID": "academic_year_id",
		"IPAllowlist": "ip_allowlist", "URL": "url", "ReceivedByUserID": "received_by_user_id",
		"PercentageBp": "percentage_bp", "Weekday2": "weekday2",
	} {
		require.Equal(t, want, snakeCase(in), in)
	}
}
