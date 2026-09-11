package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

// eventMapping is how one domain event becomes a Notification: the kind it
// records under, and a renderer producing the (title, body, href) an
// inbox row shows. Rendering is deliberately simple template text in
// Indonesian (CLAUDE.md: "Teks pengguna lewat i18n, default Bahasa
// Indonesia") rather than full per-recipient-locale i18n, since a
// notification's title/body is stored once, not re-rendered per reader.
type eventMapping struct {
	kind   domain.Kind
	render func(events.Envelope) (title, body, href string)
}

var eventMappings = map[string]eventMapping{
	events.AttendanceSubmitted: {
		domain.KindAttendanceSubmitted,
		func(e events.Envelope) (string, string, string) {
			return "Presensi tercatat", fieldOr(e, "summary", "Presensi kelas telah dicatat."), fieldOr(e, "href", "")
		},
	},
	events.SubstitutionRequested: {
		domain.KindSubstitutionRequested,
		func(e events.Envelope) (string, string, string) {
			return "Permintaan pengganti mengajar", fieldOr(e, "summary", "Anda diminta menggantikan jadwal mengajar."), fieldOr(e, "href", "")
		},
	},
	events.SubstitutionResponded: {
		domain.KindSubstitutionResponded,
		func(e events.Envelope) (string, string, string) {
			return "Respon pengganti mengajar", fieldOr(e, "summary", "Permintaan pengganti mengajar telah direspon."), fieldOr(e, "href", "")
		},
	},
	events.LeaveRequestSubmitted: {
		domain.KindLeaveRequestSubmitted,
		func(e events.Envelope) (string, string, string) {
			return "Pengajuan izin baru", fieldOr(e, "summary", "Ada pengajuan izin yang menunggu persetujuan Anda."), fieldOr(e, "href", "")
		},
	},
	events.LeaveRequestReviewed: {
		domain.KindLeaveRequestReviewed,
		func(e events.Envelope) (string, string, string) {
			return "Pengajuan izin ditinjau", fieldOr(e, "summary", "Pengajuan izin Anda telah ditinjau."), fieldOr(e, "href", "")
		},
	},
	events.LeaveRequestIssued: {
		domain.KindLeaveRequestIssued,
		func(e events.Envelope) (string, string, string) {
			return "Surat izin diterbitkan", fieldOr(e, "summary", "Surat izin Anda telah diterbitkan."), fieldOr(e, "href", "")
		},
	},
	events.ExitPermitStageChanged: {
		domain.KindExitPermitStageChanged,
		func(e events.Envelope) (string, string, string) {
			return "Status izin keluar berubah", fieldOr(e, "summary", "Status izin keluar telah berubah."), fieldOr(e, "href", "")
		},
	},
	events.ExitPermitIssued: {
		domain.KindExitPermitIssued,
		func(e events.Envelope) (string, string, string) {
			return "Izin keluar diterbitkan", fieldOr(e, "summary", "Izin keluar telah diterbitkan."), fieldOr(e, "href", "")
		},
	},
	events.ExitPermitExited: {
		domain.KindExitPermitExited,
		func(e events.Envelope) (string, string, string) {
			return "Siswa telah keluar", fieldOr(e, "summary", "Siswa telah keluar melalui gerbang."), fieldOr(e, "href", "")
		},
	},
	events.LateArrivalOpened: {
		domain.KindLateArrivalOpened,
		func(e events.Envelope) (string, string, string) {
			return "Keterlambatan tercatat", fieldOr(e, "summary", "Ada keterlambatan yang tercatat."), fieldOr(e, "href", "")
		},
	},
	events.LateArrivalUpdated: {
		domain.KindLateArrivalUpdated,
		func(e events.Envelope) (string, string, string) {
			return "Keterlambatan diperbarui", fieldOr(e, "summary", "Catatan keterlambatan telah diperbarui."), fieldOr(e, "href", "")
		},
	},
	events.WarningLetterIssued: {
		domain.KindWarningLetterIssued,
		func(e events.Envelope) (string, string, string) {
			return "Surat peringatan diterbitkan", fieldOr(e, "summary", "Surat peringatan telah diterbitkan."), fieldOr(e, "href", "")
		},
	},
	events.DisciplineThresholdReached: {
		domain.KindDisciplineThresholdReached,
		func(e events.Envelope) (string, string, string) {
			return "Ambang batas disiplin tercapai", fieldOr(e, "summary", "Seorang siswa mencapai ambang batas poin disiplin."), fieldOr(e, "href", "")
		},
	},
	events.LibraryReservationReady: {
		domain.KindLibraryReservationReady,
		func(e events.Envelope) (string, string, string) {
			return "Pesanan buku siap diambil", fieldOr(e, "summary", "Judul yang Anda pesan sudah siap diambil di perpustakaan."), fieldOr(e, "href", "")
		},
	},
	events.LibraryLoanDueReminder: {
		domain.KindLibraryLoanDueReminder,
		func(e events.Envelope) (string, string, string) {
			return "Pengingat jatuh tempo perpustakaan", fieldOr(e, "summary", "Ada buku yang harus segera dikembalikan."), fieldOr(e, "href", "")
		},
	},
}

func fieldOr(e events.Envelope, key, fallback string) string {
	if e.Payload == nil {
		return fallback
	}
	if v, ok := e.Payload[key].(string); ok && v != "" {
		return v
	}
	return fallback
}

// RegisterEventHandlers subscribes svc to every domain event notifications
// turns into an inbox entry. Not events.AnnouncementPublished: the
// announcements module calls svc.Notify directly during its publish fan-out
// (it already has the resolved recipient list and does not need a second,
// event-driven resolution pass), so subscribing here would double-notify.
func RegisterEventHandlers(bus *events.Bus, svc *Service) {
	for name, mapping := range eventMappings {
		bus.Subscribe(name, handlerFor(svc, mapping))
	}
}

func handlerFor(svc *Service, mapping eventMapping) events.Handler {
	return func(ctx context.Context, evt events.Event) error {
		envelope, ok := evt.(events.Envelope)
		if !ok {
			return fmt.Errorf("notifications: unexpected event type %T", evt)
		}
		if len(envelope.Subject) == 0 {
			return nil
		}
		title, body, href := mapping.render(envelope)
		return svc.Notify(ctx, envelope.Tenant, Notification{
			UserIDs: dedupeUUIDs(envelope.Subject),
			Kind:    mapping.kind,
			Title:   title,
			Body:    body,
			Href:    href,
			Data:    envelope.Payload,
		})
	}
}

func dedupeUUIDs(ids []uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{}, len(ids))
	out := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}
