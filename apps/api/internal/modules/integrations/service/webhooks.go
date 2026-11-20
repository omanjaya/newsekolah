package service

import (
	"context"
	"crypto/rand"
	"fmt"
	"net"
	"net/url"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/integrations/domain"
)

// RegisterEndpointInput is what a school administrator submits to add a
// webhook receiver.
type RegisterEndpointInput struct {
	URL         string
	Description string
	EventTypes  []string
}

// RegisteredEndpoint is what RegisterEndpoint hands back: the stored
// endpoint plus its plaintext signing secret, the only moment the secret
// exists outside its sealed ciphertext (the same show-once rule as an API
// key's token).
type RegisteredEndpoint struct {
	Endpoint      domain.WebhookEndpoint
	SigningSecret string
}

// RegisterEndpoint validates the URL and event types, refuses a URL that
// resolves to a private or loopback address (docs/14-public-api.md: never
// let a webhook registration turn the delivery worker into an SSRF probe
// of the platform's own network), and seals a freshly generated signing
// secret before it ever reaches storage. The plaintext secret is returned
// once so the receiver can verify X-Newsekolah-Signature.
func (s *Service) RegisterEndpoint(ctx context.Context, tenantID, createdBy uuid.UUID, in RegisterEndpointInput) (RegisteredEndpoint, error) {
	if err := s.validateEndpointInput(ctx, in); err != nil {
		return RegisteredEndpoint{}, err
	}

	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return RegisteredEndpoint{}, fmt.Errorf("generate webhook signing secret: %w", err)
	}
	secret := domain.EncodeSigningSecret(random)
	// The HMAC key is the secret string's bytes exactly as shown to the
	// school, so a receiver uses it verbatim without decoding anything.
	ciphertext, err := s.sealer.Seal([]byte(secret))
	if err != nil {
		return RegisteredEndpoint{}, fmt.Errorf("seal webhook signing secret: %w", err)
	}

	endpoint := domain.WebhookEndpoint{
		ID:          uuid.Must(uuid.NewV7()),
		TenantID:    tenantID,
		URL:         in.URL,
		Description: in.Description,
		EventTypes:  in.EventTypes,
		Status:      domain.WebhookActive,
		CreatedBy:   createdBy,
	}

	var created domain.WebhookEndpoint
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		created, err = s.hooks.CreateEndpoint(ctx, endpoint, ciphertext)
		return err
	})
	if err != nil {
		return RegisteredEndpoint{}, fmt.Errorf("register webhook endpoint: %w", err)
	}
	return RegisteredEndpoint{Endpoint: created, SigningSecret: secret}, nil
}

func (s *Service) ListEndpoints(ctx context.Context, tenantID uuid.UUID) ([]domain.WebhookEndpoint, error) {
	var endpoints []domain.WebhookEndpoint
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		endpoints, err = s.hooks.ListEndpoints(ctx, tenantID)
		return err
	})
	return endpoints, err
}

// UpdateEndpointInput mirrors RegisterEndpointInput; the signing secret is
// never rotated by an update (a school that wants a new secret registers a
// new endpoint), keeping "the secret is shown once" true for updates too.
type UpdateEndpointInput = RegisterEndpointInput

func (s *Service) UpdateEndpoint(ctx context.Context, tenantID, endpointID uuid.UUID, in UpdateEndpointInput) (domain.WebhookEndpoint, error) {
	if err := s.validateEndpointInput(ctx, in); err != nil {
		return domain.WebhookEndpoint{}, err
	}

	var updated domain.WebhookEndpoint
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		updated, err = s.hooks.UpdateEndpoint(ctx, tenantID, endpointID, in.URL, in.Description, in.EventTypes)
		return err
	})
	return updated, err
}

func (s *Service) DeleteEndpoint(ctx context.Context, tenantID, endpointID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.hooks.DeleteEndpoint(ctx, tenantID, endpointID)
	})
}

func (s *Service) validateEndpointInput(ctx context.Context, in RegisterEndpointInput) error {
	if in.URL == "" {
		return fmt.Errorf("%w: url", domain.ErrInvalidInput)
	}
	if len(in.EventTypes) == 0 {
		return fmt.Errorf("%w: event_types", domain.ErrInvalidInput)
	}
	for _, t := range in.EventTypes {
		if !isKnownEventType(t) {
			return fmt.Errorf("%w: %q", domain.ErrEventTypeUnknown, t)
		}
	}
	return s.refuseDisallowedURL(ctx, in.URL)
}

// refuseDisallowedURL rejects an http(s) URL whose host resolves (or is
// given as a literal address) to a loopback, link-local, or private
// address, per domain.IsDisallowedAddress.
func (s *Service) refuseDisallowedURL(ctx context.Context, rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		return fmt.Errorf("%w: must be an absolute http(s) url", domain.ErrURLNotAllowed)
	}

	host := parsed.Hostname()
	if literal := net.ParseIP(host); literal != nil {
		if domain.IsDisallowedAddress(literal) {
			return fmt.Errorf("%w: resolves to a private or loopback address", domain.ErrURLNotAllowed)
		}
		return nil
	}

	if s.resolve == nil {
		return nil
	}
	addrs, err := s.resolve.LookupIPs(ctx, host)
	if err != nil {
		return fmt.Errorf("%w: could not resolve host", domain.ErrURLNotAllowed)
	}
	for _, addr := range addrs {
		ip := net.ParseIP(addr)
		if ip == nil || domain.IsDisallowedAddress(ip) {
			return fmt.Errorf("%w: resolves to a private or loopback address", domain.ErrURLNotAllowed)
		}
	}
	return nil
}
