// Package jobs implements the integrations module's River worker: send one
// webhook delivery attempt, sign it, never follow a redirect, and record
// the outcome. Retry timing is the worker's own NextRetry override
// (domain.BackoffDuration), not River's default policy, so the schedule is
// exactly what docs/14-public-api.md documents.
package jobs

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

const deliveryTimeout = 10 * time.Second

// errRedirectRefused makes http.Client.Do return an error instead of
// following a redirect: a webhook receiver that wants a permanent 301 must
// be re-registered with the new URL, not silently followed, since that
// would let a compromised or misconfigured receiver redirect deliveries
// (and their signed payloads) anywhere.
var errRedirectRefused = errors.New("integrations: webhook delivery does not follow redirects")

// DeliverWebhookWorker sends one webhook delivery attempt.
type DeliverWebhookWorker struct {
	river.WorkerDefaults[service.DeliverWebhookArgs]
	svc    *service.Service
	client *http.Client
	clock  clock.Clock
}

func NewDeliverWebhookWorker(svc *service.Service, clk clock.Clock) *DeliverWebhookWorker {
	return &DeliverWebhookWorker{
		svc: svc,
		client: &http.Client{
			Timeout: deliveryTimeout,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return errRedirectRefused
			},
		},
		clock: clk,
	}
}

// NextRetry overrides River's default retry policy with the schedule
// docs/14-public-api.md documents: BackoffDuration, keyed off River's own
// attempt counter, from the worker's injected clock rather than time.Now().
func (w *DeliverWebhookWorker) NextRetry(job *river.Job[service.DeliverWebhookArgs]) time.Time {
	return w.clock.Now().Add(domain.BackoffDuration(job.Attempt))
}

func (w *DeliverWebhookWorker) Work(ctx context.Context, job *river.Job[service.DeliverWebhookArgs]) error {
	args := job.Args

	delivery, err := w.svc.GetDeliveryForWork(ctx, args.TenantID, args.DeliveryID)
	if err != nil {
		// The delivery row is gone (should not happen outside tests that
		// delete fixtures mid-flight); nothing left to retry against.
		return nil
	}

	endpoint, err := w.svc.GetEndpointForDelivery(ctx, args.TenantID, delivery.EndpointID)
	if err != nil {
		return nil
	}
	if !endpoint.Enabled() {
		terminalErr := fmt.Errorf("webhook endpoint %s is disabled", endpoint.ID)
		return w.svc.RecordAttempt(ctx, args.TenantID, endpoint.ID, delivery.ID, job.Attempt, nil, terminalErr, true, w.clock.Now())
	}

	statusCode, sendErr := w.send(ctx, endpoint, delivery)
	terminal := sendErr != nil && job.Attempt >= domain.MaxDeliveryAttempts

	if recordErr := w.svc.RecordAttempt(ctx, args.TenantID, endpoint.ID, delivery.ID, job.Attempt, statusCode, sendErr, terminal, w.clock.Now()); recordErr != nil {
		return fmt.Errorf("record webhook delivery attempt: %w", recordErr)
	}
	if sendErr == nil {
		return nil
	}
	if terminal {
		// Retries are exhausted; the row is already marked failed above,
		// so returning nil here tells River the job is done rather than
		// scheduling one more attempt it would immediately discard anyway.
		return nil
	}
	return fmt.Errorf("deliver webhook: %w", sendErr) // non-nil: River retries via NextRetry above
}

func (w *DeliverWebhookWorker) send(ctx context.Context, endpoint domain.WebhookEndpoint, delivery domain.Delivery) (*int, error) {
	timestamp := w.clock.Now().Unix()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint.URL, bytes.NewReader(delivery.Payload))
	if err != nil {
		return nil, fmt.Errorf("build webhook request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Newsekolah-Event", delivery.EventType)
	req.Header.Set("X-Newsekolah-Delivery", delivery.ID.String())
	req.Header.Set(domain.SignatureHeader, domain.SignatureHeaderValue(endpoint.SigningSecret, timestamp, delivery.Payload))

	resp, err := w.client.Do(req)
	if err != nil {
		if errors.Is(err, errRedirectRefused) {
			return nil, errRedirectRefused
		}
		return nil, fmt.Errorf("send webhook request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	code := resp.StatusCode
	if code < 200 || code >= 300 {
		return &code, fmt.Errorf("receiver responded %d", code)
	}
	return &code, nil
}
