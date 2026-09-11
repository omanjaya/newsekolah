package wiring

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	libraryservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	schedulingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

// DutyLookup answers "who holds this duty right now", used to address
// notifications to a class's homeroom teacher or to security staff.
type DutyLookup interface {
	UsersWithDuty(ctx context.Context, tenantID uuid.UUID, slug string, classID uuid.NullUUID) ([]uuid.UUID, error)
}

// RegisterNotificationBridge translates each module's own event types into
// the generic events.Envelope the notifications module subscribes to,
// filling Subject with the people the event concerns. Modules keep
// publishing their typed events; only this wiring knows both vocabularies.
func RegisterNotificationBridge(bus *events.Bus, duties DutyLookup, logger *slog.Logger) {
	b := &bridge{bus: bus, duties: duties, logger: logger}

	bus.Subscribe(permitsservice.LeaveRequestSubmitted{}.EventName(), b.handle(func(ctx context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(permitsservice.LeaveRequestSubmitted)
		recipients, err := b.holders(ctx, e.TenantID, "homeroom", e.ClassID)
		return one(events.Envelope{
			Name: events.LeaveRequestSubmitted, Tenant: e.TenantID, Actor: e.StudentUserID, Subject: recipients,
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "href": "/leave-requests/" + e.InstanceID.String()},
		}, err)
	}))
	bus.Subscribe(permitsservice.LeaveRequestReviewed{}.EventName(), b.handle(func(ctx context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(permitsservice.LeaveRequestReviewed)
		href := "/leave-requests/" + e.InstanceID.String()
		summary := "Pengajuan izin Anda disetujui wali kelas dan diteruskan ke guru BK."
		if !e.Approved {
			summary = "Pengajuan izin Anda ditolak."
		}
		out := []events.Envelope{{
			Name: events.LeaveRequestReviewed, Tenant: e.TenantID, Actor: e.ReviewerID, Subject: []uuid.UUID{e.StudentUserID},
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "approved": e.Approved, "summary": summary, "href": href},
		}}
		if !e.Approved {
			return out, nil
		}
		counselors, err := b.holders(ctx, e.TenantID, "counselor", uuid.NullUUID{})
		out = append(out, events.Envelope{
			Name: events.LeaveRequestSubmitted, Tenant: e.TenantID, Actor: e.ReviewerID, Subject: without(counselors, e.ReviewerID),
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "summary": "Pengajuan izin telah disetujui wali kelas dan menunggu penerbitan surat.", "href": href},
		})
		return out, err
	}))
	bus.Subscribe(permitsservice.LeaveRequestIssued{}.EventName(), b.handle(func(_ context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(permitsservice.LeaveRequestIssued)
		return one(events.Envelope{
			Name: events.LeaveRequestIssued, Tenant: e.TenantID, Subject: []uuid.UUID{e.StudentUserID},
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "letter_number": e.LetterNumber,
				"summary": fmt.Sprintf("Surat izin nomor %s telah diterbitkan.", e.LetterNumber), "href": "/leave-requests/" + e.InstanceID.String()},
		}, nil)
	}))
	bus.Subscribe(permitsservice.ExitPermitStageChanged{}.EventName(), b.handle(func(_ context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(permitsservice.ExitPermitStageChanged)
		return one(events.Envelope{
			Name: events.ExitPermitStageChanged, Tenant: e.TenantID, Subject: []uuid.UUID{e.StudentUserID},
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "stage": e.StageKey, "href": "/exit-permits/" + e.InstanceID.String()},
		}, nil)
	}))
	bus.Subscribe(permitsservice.ExitPermitIssued{}.EventName(), b.handle(func(ctx context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(permitsservice.ExitPermitIssued)
		security, err := b.holders(ctx, e.TenantID, "security", uuid.NullUUID{})
		return one(events.Envelope{
			Name: events.ExitPermitIssued, Tenant: e.TenantID, Subject: append([]uuid.UUID{e.StudentUserID}, security...),
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "summary": "Izin keluar telah disetujui. Tunjukkan QR di gerbang.", "href": "/exit-permits/" + e.InstanceID.String()},
		}, err)
	}))
	bus.Subscribe(permitsservice.ExitPermitExited{}.EventName(), b.handle(func(_ context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(permitsservice.ExitPermitExited)
		return one(events.Envelope{
			Name: events.ExitPermitExited, Tenant: e.TenantID, Actor: e.SecurityUserID, Subject: []uuid.UUID{e.StudentUserID},
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "href": "/exit-permits/" + e.InstanceID.String()},
		}, nil)
	}))
	bus.Subscribe(permitsservice.LateArrivalOpened{}.EventName(), b.handle(func(ctx context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(permitsservice.LateArrivalOpened)
		recipients, err := b.holders(ctx, e.TenantID, "homeroom", e.ClassID)
		return one(events.Envelope{
			Name: events.LateArrivalOpened, Tenant: e.TenantID, Actor: e.StudentUserID, Subject: recipients,
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "summary": "Siswa di kelas Anda tercatat terlambat hari ini.", "href": "/late-arrivals/" + e.InstanceID.String()},
		}, err)
	}))
	bus.Subscribe(permitsservice.LateArrivalUpdated{}.EventName(), b.handle(func(_ context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(permitsservice.LateArrivalUpdated)
		return one(events.Envelope{
			Name: events.LateArrivalUpdated, Tenant: e.TenantID, Subject: []uuid.UUID{e.StudentUserID},
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "status": e.Status, "href": "/late-arrivals/" + e.InstanceID.String()},
		}, nil)
	}))
	bus.Subscribe(schedulingservice.SubstitutionRequested{}.EventName(), b.handle(func(_ context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(schedulingservice.SubstitutionRequested)
		return one(events.Envelope{
			Name: events.SubstitutionRequested, Tenant: e.TenantID, Actor: e.RequesterUserID, Subject: []uuid.UUID{e.SubstituteUserID},
			Payload: map[string]any{"substitution_id": e.SubstitutionID.String(), "date": e.Date.Format("2006-01-02"), "href": "/substitutions"},
		}, nil)
	}))
	bus.Subscribe(schedulingservice.SubstitutionResponded{}.EventName(), b.handle(func(_ context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(schedulingservice.SubstitutionResponded)
		summary := "Permintaan pengganti mengajar Anda diterima."
		if !e.Accepted {
			summary = "Permintaan pengganti mengajar Anda ditolak."
		}
		return one(events.Envelope{
			Name: events.SubstitutionResponded, Tenant: e.TenantID, Actor: e.SubstituteUserID, Subject: []uuid.UUID{e.RequesterUserID},
			Payload: map[string]any{"substitution_id": e.SubstitutionID.String(), "accepted": e.Accepted, "summary": summary, "href": "/substitutions"},
		}, nil)
	}))
	bus.Subscribe(disciplineservice.WarningLetterIssued{}.EventName(), b.handle(func(ctx context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(disciplineservice.WarningLetterIssued)
		homeroom, err := b.holders(ctx, e.TenantID, "homeroom", e.ClassID)
		summary := fmt.Sprintf("%s nomor %s telah diterbitkan.", e.LevelLabel, e.LetterNumber)
		return []events.Envelope{{
			Name: events.WarningLetterIssued, Tenant: e.TenantID, Actor: e.IssuedBy, Subject: append([]uuid.UUID{e.StudentUserID}, without(homeroom, e.IssuedBy)...),
			Payload: map[string]any{"letter_id": e.LetterID.String(), "level": e.Level, "summary": summary, "href": "/discipline/letters/" + e.LetterID.String()},
		}}, err
	}))
	bus.Subscribe(attendanceservice.Submitted{}.EventName(), b.handle(func(ctx context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(attendanceservice.Submitted)
		recipients, err := b.holders(ctx, e.TenantID, "homeroom", uuid.NullUUID{UUID: e.ClassID, Valid: true})
		return one(events.Envelope{
			Name: events.AttendanceSubmitted, Tenant: e.TenantID, Actor: e.SubmittedBy, Subject: without(recipients, e.SubmittedBy),
			Payload: map[string]any{"session_id": e.SessionID.String(), "class_id": e.ClassID.String(),
				"summary": fmt.Sprintf("Presensi %d siswa tercatat untuk kelas Anda.", e.StudentCount), "href": "/attendance"},
		}, err)
	}))

	bus.Subscribe(libraryservice.ReservationReadyEvent{}.EventName(), b.handle(func(_ context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(libraryservice.ReservationReadyEvent)
		return one(events.Envelope{
			Name: events.LibraryReservationReady, Tenant: e.TenantID, Subject: []uuid.UUID{e.MemberUserID},
			Payload: map[string]any{"reservation_id": e.ReservationID.String(), "title_id": e.TitleID.String(),
				"summary": "Judul yang Anda pesan sudah siap diambil di perpustakaan.", "href": "/library/me"},
		}, nil)
	}))
	bus.Subscribe(libraryservice.LoanDueReminderEvent{}.EventName(), b.handle(func(_ context.Context, evt events.Event) ([]events.Envelope, error) {
		e := evt.(libraryservice.LoanDueReminderEvent)
		summary := "Ada buku yang harus segera dikembalikan."
		if e.LoanCount > 1 {
			summary = fmt.Sprintf("Ada %d buku yang harus segera dikembalikan.", e.LoanCount)
		}
		return one(events.Envelope{
			Name: events.LibraryLoanDueReminder, Tenant: e.TenantID, Subject: []uuid.UUID{e.MemberUserID},
			Payload: map[string]any{"loan_count": e.LoanCount, "summary": summary, "href": "/library/me"},
		}, nil)
	}))
}

type bridge struct {
	bus    *events.Bus
	duties DutyLookup
	logger *slog.Logger
}

type translator func(ctx context.Context, evt events.Event) ([]events.Envelope, error)

// handle wraps a translator so a notification failure is logged, never
// returned: the originating transaction must not roll back because an
// inbox row could not be written.
func (b *bridge) handle(translate translator) events.Handler {
	return func(ctx context.Context, evt events.Event) error {
		envelopes, err := translate(ctx, evt)
		if err != nil {
			b.logger.Warn("notification bridge: resolve recipients failed", "event", evt.EventName(), "error", err)
			return nil
		}
		for _, envelope := range envelopes {
			if len(envelope.Subject) == 0 {
				continue
			}
			if err := b.bus.Publish(ctx, envelope); err != nil {
				b.logger.Warn("notification bridge: publish failed", "event", envelope.Name, "error", err)
			}
		}
		return nil
	}
}

func (b *bridge) holders(ctx context.Context, tenantID uuid.UUID, slug string, classID uuid.NullUUID) ([]uuid.UUID, error) {
	if b.duties == nil {
		return nil, nil
	}
	return b.duties.UsersWithDuty(ctx, tenantID, slug, classID)
}

func without(ids []uuid.UUID, exclude uuid.UUID) []uuid.UUID {
	out := ids[:0:0]
	for _, id := range ids {
		if id != exclude {
			out = append(out, id)
		}
	}
	return out
}

func one(e events.Envelope, err error) ([]events.Envelope, error) {
	return []events.Envelope{e}, err
}
