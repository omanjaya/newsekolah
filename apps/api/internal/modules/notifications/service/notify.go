package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
)

// deliveryMaxAttempts matches the brief: River retries a delivery job up
// to 8 times with exponential backoff (River's default backoff function is
// exponential already; MaxAttempts is the only knob this module sets).
const deliveryMaxAttempts = 8

// Notify inserts one inbox row per recipient and enqueues a delivery job
// per channel each recipient's preferences resolve to, all inside a single
// tenant-scoped transaction: either every recipient gets their
// notification row and every job is queued, or none of it happens (a
// mid-loop failure rolls the whole batch back).
func (s *Service) Notify(ctx context.Context, tenantID uuid.UUID, in Notification) error {
	if len(in.UserIDs) == 0 {
		return nil
	}

	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		tx, ok := txFromContext(ctx)
		if !ok {
			return fmt.Errorf("notify: no transaction in context")
		}

		tenantDefaults, err := s.repo.GetTenantChannelDefaults(ctx, tenantID, in.Kind)
		if err != nil {
			return fmt.Errorf("load tenant channel defaults: %w", err)
		}

		loc := s.tenantLocation(ctx, tenantID)
		now := s.clock.Now()

		for _, userID := range in.UserIDs {
			if err := s.notifyOne(ctx, tx, tenantID, userID, in, tenantDefaults, loc, now); err != nil {
				return fmt.Errorf("notify user %s: %w", userID, err)
			}
		}
		return nil
	})
}

func (s *Service) tenantLocation(ctx context.Context, tenantID uuid.UUID) *time.Location {
	tz, err := s.repo.TenantTimezone(ctx, tenantID)
	if err != nil || tz == "" {
		return time.UTC
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return time.UTC
	}
	return loc
}

func (s *Service) notifyOne(
	ctx context.Context, tx pgx.Tx, tenantID, userID uuid.UUID, in Notification,
	tenantDefaults map[domain.Channel]bool, loc *time.Location, now time.Time,
) error {
	n, err := s.repo.InsertNotification(ctx, tenantID, userID, in.Kind, in.Title, in.Body, in.Href, in.Data, in.AnnouncementID)
	if err != nil {
		return fmt.Errorf("insert inbox row: %w", err)
	}

	userPrefs, err := s.repo.ListPreferencesForKind(ctx, tenantID, userID, in.Kind)
	if err != nil {
		return fmt.Errorf("load preferences: %w", err)
	}
	channels := domain.ResolveChannels(userPrefs, tenantDefaults)

	settings, hasSettings, err := s.repo.GetSettings(ctx, tenantID, userID)
	if err != nil {
		return fmt.Errorf("load settings: %w", err)
	}
	deferUntil := s.deferUntil(hasSettings, settings, loc, now)

	for _, ch := range channels {
		switch ch {
		case domain.ChannelInApp:
			_ = s.realtime.Publish(ctx, userID, RealtimeEvent{
				Type:    "notification_created",
				Payload: map[string]any{"id": n.ID, "title": n.Title, "body": n.Body, "href": n.Href},
			})
		case domain.ChannelPush:
			if err := s.enqueuePush(ctx, tx, tenantID, n, userID, deferUntil); err != nil {
				return err
			}
		case domain.ChannelEmail:
			if hasSettings && settings.DigestEnabled {
				continue // covered by the daily digest instead of an immediate send
			}
			if err := s.enqueueEmail(ctx, tx, tenantID, n, userID, deferUntil); err != nil {
				return err
			}
		case domain.ChannelWhatsApp:
			if err := s.enqueueWhatsApp(ctx, tx, tenantID, n, userID, deferUntil); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Service) deferUntil(hasSettings bool, settings Settings, loc *time.Location, now time.Time) time.Time {
	if !hasSettings || settings.QuietHoursStart == nil || settings.QuietHoursEnd == nil {
		return now
	}
	quiet := domain.QuietHours{Enabled: true, StartHour: *settings.QuietHoursStart, EndHour: *settings.QuietHoursEnd}
	return quiet.DeferUntil(now.In(loc)).UTC()
}

func (s *Service) enqueuePush(ctx context.Context, tx pgx.Tx, tenantID uuid.UUID, n domain.Notification, userID uuid.UUID, deferUntil time.Time) error {
	devices, err := s.repo.ListPushDevicesForUsers(ctx, tenantID, []uuid.UUID{userID})
	if err != nil {
		return fmt.Errorf("list push devices: %w", err)
	}
	for _, d := range devices {
		deliveryID, err := s.repo.InsertDelivery(ctx, tenantID, n.ID, n.CreatedAt, domain.ChannelPush, string(d.Platform), d.TokenOrEndpoint)
		if err != nil {
			return fmt.Errorf("insert push delivery: %w", err)
		}
		_, err = s.jobs.InsertTx(ctx, tx, DeliverPushArgs{
			TenantID: tenantID, NotificationID: n.ID, NotificationCreatedAt: n.CreatedAt,
			DeliveryID: deliveryID, DeviceID: d.ID, Title: n.Title, Body: n.Body, Href: n.Href,
		}, &river.InsertOpts{ScheduledAt: deferUntil, MaxAttempts: deliveryMaxAttempts})
		if err != nil {
			return fmt.Errorf("enqueue push delivery job: %w", err)
		}
	}
	return nil
}

func (s *Service) enqueueEmail(ctx context.Context, tx pgx.Tx, tenantID uuid.UUID, n domain.Notification, userID uuid.UUID, deferUntil time.Time) error {
	email, ok, err := s.contacts.EmailForUser(ctx, tenantID, userID)
	if err != nil {
		return fmt.Errorf("resolve email: %w", err)
	}
	if !ok || email == "" {
		return nil
	}
	deliveryID, err := s.repo.InsertDelivery(ctx, tenantID, n.ID, n.CreatedAt, domain.ChannelEmail, "smtp", email)
	if err != nil {
		return fmt.Errorf("insert email delivery: %w", err)
	}
	_, err = s.jobs.InsertTx(ctx, tx, DeliverEmailArgs{
		TenantID: tenantID, NotificationID: n.ID, NotificationCreatedAt: n.CreatedAt,
		DeliveryID: deliveryID, ToEmail: email, Title: n.Title, Body: n.Body, Href: n.Href,
	}, &river.InsertOpts{ScheduledAt: deferUntil, MaxAttempts: deliveryMaxAttempts})
	if err != nil {
		return fmt.Errorf("enqueue email delivery job: %w", err)
	}
	return nil
}

func (s *Service) enqueueWhatsApp(ctx context.Context, tx pgx.Tx, tenantID uuid.UUID, n domain.Notification, userID uuid.UUID, deferUntil time.Time) error {
	phone, ok, err := s.contacts.PhoneNumberForUser(ctx, tenantID, userID)
	if err != nil {
		return fmt.Errorf("resolve phone number: %w", err)
	}
	if !ok || phone == "" {
		return nil
	}
	deliveryID, err := s.repo.InsertDelivery(ctx, tenantID, n.ID, n.CreatedAt, domain.ChannelWhatsApp, "whatsapp", phone)
	if err != nil {
		return fmt.Errorf("insert whatsapp delivery: %w", err)
	}
	message := n.Title + "\n\n" + n.Body
	_, err = s.jobs.InsertTx(ctx, tx, DeliverWhatsAppArgs{
		TenantID: tenantID, NotificationID: n.ID, NotificationCreatedAt: n.CreatedAt,
		DeliveryID: deliveryID, ToPhone: phone, Message: message,
	}, &river.InsertOpts{ScheduledAt: deferUntil, MaxAttempts: deliveryMaxAttempts})
	if err != nil {
		return fmt.Errorf("enqueue whatsapp delivery job: %w", err)
	}
	return nil
}
