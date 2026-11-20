package jobs

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// TestSendClassifiesFailures: every way an attempt can fail carries a
// reason code, so the delivery log never has to show the Go error text
// (admin-settings-R4).
func TestSendClassifiesFailures(t *testing.T) {
	worker := NewDeliverWebhookWorker(nil, clock.Real{})
	delivery := domain.Delivery{ID: uuid.New(), EventType: "announcement.published", Payload: []byte(`{}`)}
	endpoint := func(url string) domain.WebhookEndpoint {
		return domain.WebhookEndpoint{ID: uuid.New(), URL: url, SigningSecret: []byte("secret")}
	}

	reject := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusMethodNotAllowed)
	}))
	defer reject.Close()
	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://example.com/elsewhere", http.StatusMovedPermanently)
	}))
	defer redirect.Close()
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(200 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer slow.Close()
	closed := httptest.NewServer(http.NotFoundHandler())
	closedURL := closed.URL
	closed.Close()
	accept := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer accept.Close()

	code, err := worker.send(context.Background(), endpoint(reject.URL), delivery)
	require.Equal(t, 405, *code)
	require.Equal(t, domain.AttemptFailure{Reason: domain.FailureHTTPStatus, Detail: "receiver responded 405"}, domain.FailureOf(err))

	_, err = worker.send(context.Background(), endpoint(redirect.URL), delivery)
	require.Equal(t, domain.FailureRedirectRefused, domain.FailureOf(err).Reason)

	_, err = worker.send(context.Background(), endpoint(closedURL), delivery)
	require.Equal(t, domain.FailureUnreachable, domain.FailureOf(err).Reason)

	worker.client.Timeout = 50 * time.Millisecond
	_, err = worker.send(context.Background(), endpoint(slow.URL), delivery)
	require.Equal(t, domain.FailureTimeout, domain.FailureOf(err).Reason)

	code, err = worker.send(context.Background(), endpoint(accept.URL), delivery)
	require.NoError(t, err)
	require.Equal(t, 204, *code)
	require.Equal(t, domain.AttemptFailure{}, domain.FailureOf(err))
}
