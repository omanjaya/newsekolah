package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/service"
)

// TestRecordAttemptStoresFailureReason is admin-settings-R4's regression
// test: a failed attempt stores a reason code the delivery log
// translates, next to the English error text kept for diagnosis, and a
// later successful attempt clears both.
func TestRecordAttemptStoresFailureReason(t *testing.T) {
	f := newIntegrationsFixture(t)
	ctx := context.Background()
	registered, err := f.svc.RegisterEndpoint(ctx, f.tenantID, f.userID, service.RegisterEndpointInput{
		URL: "https://example.com/hook", EventTypes: []string{service.EventCatalog[0]},
	})
	require.NoError(t, err)
	require.NoError(t, f.svc.DispatchEvent(ctx, f.tenantID, service.EventCatalog[0], uuid.New(), map[string]any{"id": "x"}))

	deliveries, _, err := f.svc.ListDeliveries(ctx, f.tenantID, uuid.NullUUID{}, "", 10)
	require.NoError(t, err)
	require.Len(t, deliveries, 1)
	delivery := deliveries[0]
	require.Equal(t, domain.FailureNone, delivery.FailureReason)

	code := 405
	sendErr := domain.NewDeliveryError(domain.FailureHTTPStatus, errors.New("receiver responded 405"))
	require.NoError(t, f.svc.RecordAttempt(ctx, f.tenantID, registered.Endpoint.ID, delivery.ID, 1, &code, sendErr, false, time.Now()))

	got, err := f.svc.GetDeliveryForWork(ctx, f.tenantID, delivery.ID)
	require.NoError(t, err)
	require.Equal(t, domain.FailureHTTPStatus, got.FailureReason)
	require.Equal(t, "receiver responded 405", got.LastError)
	require.Equal(t, &code, got.LastStatusCode)

	// An error the worker did not classify is still a code, never free text.
	require.NoError(t, f.svc.RecordAttempt(ctx, f.tenantID, registered.Endpoint.ID, delivery.ID, 2, nil, errors.New("boom"), false, time.Now()))
	got, err = f.svc.GetDeliveryForWork(ctx, f.tenantID, delivery.ID)
	require.NoError(t, err)
	require.Equal(t, domain.FailureUnknown, got.FailureReason)

	ok := 200
	require.NoError(t, f.svc.RecordAttempt(ctx, f.tenantID, registered.Endpoint.ID, delivery.ID, 3, &ok, nil, false, time.Now()))
	got, err = f.svc.GetDeliveryForWork(ctx, f.tenantID, delivery.ID)
	require.NoError(t, err)
	require.Equal(t, domain.DeliverySuccess, got.Status)
	require.Equal(t, domain.FailureNone, got.FailureReason)
	require.Empty(t, got.LastError)
}
