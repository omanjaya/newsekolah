package wiring

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"

	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	libraryservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	schedulingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
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

	subscribe(b, func(ctx context.Context, e permitsservice.LeaveRequestSubmitted) ([]events.Envelope, error) {
		recipients, err := b.holders(ctx, e.TenantID, "homeroom", e.ClassID)
		return one(events.Envelope{
			Name: events.LeaveRequestSubmitted, Tenant: e.TenantID, Actor: e.StudentUserID, Subject: recipients,
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "href": "/leave-requests/" + e.InstanceID.String()},
		}, err)
	})
	subscribe(b, func(ctx context.Context, e permitsservice.LeaveRequestReviewed) ([]events.Envelope, error) {
		href := "/leave-requests/" + e.InstanceID.String()
		summary := "Pengajuan izin Anda disetujui wali kelas dan diteruskan ke guru BK."
		if note := clip(e.Note, reviewNoteMaxRunes); e.Approved && note != "" {
			summary += " Catatan wali kelas: " + note
		} else if !e.Approved && note != "" {
			summary = "Pengajuan izin Anda ditolak. Alasan: " + note
		} else if !e.Approved {
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
	})
	subscribe(b, func(_ context.Context, e permitsservice.LeaveRequestIssued) ([]events.Envelope, error) {
		return one(events.Envelope{
			Name: events.LeaveRequestIssued, Tenant: e.TenantID, Subject: []uuid.UUID{e.StudentUserID},
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "letter_number": e.LetterNumber,
				"summary": fmt.Sprintf("Surat izin nomor %s telah diterbitkan.", e.LetterNumber), "href": "/leave-requests/" + e.InstanceID.String()},
		}, nil)
	})
	subscribe(b, func(_ context.Context, e permitsservice.ExitPermitStageChanged) ([]events.Envelope, error) {
		return one(events.Envelope{
			Name: events.ExitPermitStageChanged, Tenant: e.TenantID, Subject: []uuid.UUID{e.StudentUserID},
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "stage": e.StageKey, "href": "/exit-permits/" + e.InstanceID.String()},
		}, nil)
	})
	subscribe(b, func(ctx context.Context, e permitsservice.ExitPermitIssued) ([]events.Envelope, error) {
		security, err := b.holders(ctx, e.TenantID, "security", uuid.NullUUID{})
		href := "/exit-permits/" + e.InstanceID.String()
		// The student shows the QR; the guard verifies it, so each is told
		// their own part.
		return []events.Envelope{{
			Name: events.ExitPermitIssued, Tenant: e.TenantID, Subject: []uuid.UUID{e.StudentUserID},
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "summary": "Izin keluar telah disetujui. Tunjukkan QR di gerbang.", "href": href},
		}, {
			Name: events.ExitPermitIssued, Tenant: e.TenantID, Subject: without(security, e.StudentUserID),
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "summary": "Izin keluar seorang siswa telah diterbitkan dan siap diverifikasi di gerbang.", "href": href},
		}}, err
	})
	subscribe(b, func(_ context.Context, e permitsservice.ExitPermitExited) ([]events.Envelope, error) {
		return one(events.Envelope{
			Name: events.ExitPermitExited, Tenant: e.TenantID, Actor: e.SecurityUserID, Subject: []uuid.UUID{e.StudentUserID},
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "href": "/exit-permits/" + e.InstanceID.String()},
		}, nil)
	})
	subscribe(b, func(ctx context.Context, e permitsservice.LateArrivalOpened) ([]events.Envelope, error) {
		recipients, err := b.holders(ctx, e.TenantID, "homeroom", e.ClassID)
		return one(events.Envelope{
			Name: events.LateArrivalOpened, Tenant: e.TenantID, Actor: e.StudentUserID, Subject: recipients,
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "summary": "Siswa di kelas Anda tercatat terlambat hari ini.", "href": "/late-arrivals/" + e.InstanceID.String()},
		}, err)
	})
	subscribe(b, func(_ context.Context, e permitsservice.LateArrivalUpdated) ([]events.Envelope, error) {
		summary := "Keterlambatan Anda lanjut ke tahap berikutnya."
		if e.Status == "completed" {
			summary = "Keterlambatan Anda sudah selesai diproses."
		}
		return one(events.Envelope{
			Name: events.LateArrivalUpdated, Tenant: e.TenantID, Subject: []uuid.UUID{e.StudentUserID},
			Payload: map[string]any{"instance_id": e.InstanceID.String(), "status": e.Status, "summary": summary, "href": "/late-arrivals/" + e.InstanceID.String()},
		}, nil)
	})
	subscribe(b, func(_ context.Context, e schedulingservice.SubstitutionRequested) ([]events.Envelope, error) {
		return one(events.Envelope{
			Name: events.SubstitutionRequested, Tenant: e.TenantID, Actor: e.RequesterUserID, Subject: []uuid.UUID{e.SubstituteUserID},
			Payload: map[string]any{"substitution_id": e.SubstitutionID.String(), "schedule_id": e.ScheduleID.String(), "date": e.Date.Format("2006-01-02"), "href": "/substitutions"},
		}, nil)
	})
	subscribe(b, func(_ context.Context, e schedulingservice.SubstitutionResponded) ([]events.Envelope, error) {
		summary := "Permintaan pengganti mengajar Anda diterima."
		if !e.Accepted {
			summary = "Permintaan pengganti mengajar Anda ditolak."
		}
		return one(events.Envelope{
			Name: events.SubstitutionResponded, Tenant: e.TenantID, Actor: e.SubstituteUserID, Subject: []uuid.UUID{e.RequesterUserID},
			Payload: map[string]any{"substitution_id": e.SubstitutionID.String(), "schedule_id": e.ScheduleID.String(), "accepted": e.Accepted, "summary": summary, "href": "/substitutions"},
		}, nil)
	})
	subscribe(b, func(ctx context.Context, e disciplineservice.WarningLetterIssued) ([]events.Envelope, error) {
		homeroom, err := b.holders(ctx, e.TenantID, "homeroom", e.ClassID)
		summary := fmt.Sprintf("%s nomor %s telah diterbitkan.", e.LevelLabel, e.LetterNumber)
		payload := func(href string) map[string]any {
			return map[string]any{"letter_id": e.LetterID.String(), "level": e.Level, "summary": summary, "href": href}
		}
		// The student and the homeroom teachers land on different pages:
		// the student reads their own record at /my-discipline, staff open
		// the student's discipline page (the same target as the threshold
		// notification below). There is no per-letter page to link to.
		return []events.Envelope{
			{
				Name: events.WarningLetterIssued, Tenant: e.TenantID, Actor: e.IssuedBy, Subject: []uuid.UUID{e.StudentUserID},
				Payload: payload(studentOwnDisciplineHref),
			},
			{
				Name: events.WarningLetterIssued, Tenant: e.TenantID, Actor: e.IssuedBy, Subject: without(homeroom, e.IssuedBy),
				Payload: payload(staffStudentDisciplineHref(e.StudentUserID)),
			},
		}, err
	})
	subscribe(b, func(ctx context.Context, e disciplineservice.ThresholdReached) ([]events.Envelope, error) {
		counselors, err := b.holders(ctx, e.TenantID, "counselor", uuid.NullUUID{})
		summary := fmt.Sprintf("Seorang siswa mencapai %s (%d poin).", e.LevelLabel, e.TotalPoints)
		return one(events.Envelope{
			Name: events.DisciplineThresholdReached, Tenant: e.TenantID, Subject: counselors,
			Payload: map[string]any{"student_user_id": e.StudentUserID.String(), "level": e.Level, "summary": summary, "href": staffStudentDisciplineHref(e.StudentUserID)},
		}, err)
	})
	subscribe(b, func(ctx context.Context, e attendanceservice.Submitted) ([]events.Envelope, error) {
		recipients, err := b.holders(ctx, e.TenantID, "homeroom", uuid.NullUUID{UUID: e.ClassID, Valid: true})
		return one(events.Envelope{
			Name: events.AttendanceSubmitted, Tenant: e.TenantID, Actor: e.SubmittedBy, Subject: without(recipients, e.SubmittedBy),
			Payload: map[string]any{"session_id": e.SessionID.String(), "class_id": e.ClassID.String(),
				"summary": fmt.Sprintf("Presensi %d siswa tercatat untuk kelas Anda.", e.StudentCount), "href": "/attendance"},
		}, err)
	})

	subscribe(b, func(_ context.Context, e libraryservice.ReservationReadyEvent) ([]events.Envelope, error) {
		return one(events.Envelope{
			Name: events.LibraryReservationReady, Tenant: e.TenantID, Subject: []uuid.UUID{e.MemberUserID},
			Payload: map[string]any{"reservation_id": e.ReservationID.String(), "title_id": e.TitleID.String(),
				"summary": reservationReadySummary(e), "href": "/library/me"},
		}, nil)
	})
	subscribe(b, func(_ context.Context, e libraryservice.LoanDueReminderEvent) ([]events.Envelope, error) {
		summary := "Ada buku yang harus segera dikembalikan."
		if e.LoanCount > 1 {
			summary = fmt.Sprintf("Ada %d buku yang harus segera dikembalikan.", e.LoanCount)
		}
		return one(events.Envelope{
			Name: events.LibraryLoanDueReminder, Tenant: e.TenantID, Subject: []uuid.UUID{e.MemberUserID},
			Payload: map[string]any{"loan_count": e.LoanCount, "summary": summary, "href": "/library/me"},
		}, nil)
	})
}

// reservationReadySummary tells the member the book is waiting and until
// when: the hold lapses on its own, so the deadline is the part they need.
func reservationReadySummary(e libraryservice.ReservationReadyEvent) string {
	if e.ExpiresAt.IsZero() {
		return "Judul yang Anda pesan sudah siap diambil di perpustakaan."
	}
	return fmt.Sprintf("Judul yang Anda pesan sudah siap diambil di perpustakaan, paling lambat %s.",
		reportdoc.FormatDate(reportdoc.LocaleID, e.ExpiresAt))
}

// studentOwnDisciplineHref is the web page where a student reads their own
// points and warning letters.
const studentOwnDisciplineHref = "/my-discipline"

// staffStudentDisciplineHref is the web page staff with view_discipline
// open for one student's discipline record (apps/web/features/discipline/href.ts).
func staffStudentDisciplineHref(studentUserID uuid.UUID) string {
	return "/discipline/students/" + studentUserID.String()
}

type bridge struct {
	bus    *events.Bus
	duties DutyLookup
	logger *slog.Logger
}

// subscribe registers translate for module event type T under T's own
// event name. Each module names its typed events in its own namespace
// (e.g. "scheduling.substitution.requested"), distinct from the
// events.Envelope names the notifications module consumes
// ("substitution.requested"); a shared name would deliver this bridge's
// own Envelope output back to it. The checked type assertion below keeps
// a future collision a logged no-op instead of a panic that turns an
// already committed request into a 500.
func subscribe[T events.Event](b *bridge, translate func(ctx context.Context, e T) ([]events.Envelope, error)) {
	var zero T
	b.bus.Subscribe(zero.EventName(), b.handle(func(ctx context.Context, evt events.Event) ([]events.Envelope, error) {
		e, ok := evt.(T)
		if !ok {
			if _, isEnvelope := evt.(events.Envelope); !isEnvelope {
				b.logger.Warn("notification bridge: unexpected event type", "event", evt.EventName(), "type", fmt.Sprintf("%T", evt))
			}
			return nil, nil
		}
		return translate(ctx, e)
	}))
}

type translator func(ctx context.Context, evt events.Event) ([]events.Envelope, error)

// handle wraps a translator so a notification failure is logged, never
// returned or raised: the originating write has usually committed already
// (or must not roll back) because an inbox row could not be written.
func (b *bridge) handle(translate translator) events.Handler {
	return func(ctx context.Context, evt events.Event) (err error) {
		defer func() {
			if r := recover(); r != nil {
				b.logger.Error("notification bridge: handler panicked", "event", evt.EventName(), "panic", r)
				err = nil
			}
		}()
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

// reviewNoteMaxRunes bounds a reviewer's note quoted in a notification.
const reviewNoteMaxRunes = 200

// clip trims s and cuts it to at most n runes, marking a cut with "...".
func clip(s string, n int) string {
	s = strings.TrimSpace(s)
	if runes := []rune(s); len(runes) > n {
		return strings.TrimSpace(string(runes[:n])) + "..."
	}
	return s
}

func one(e events.Envelope, err error) ([]events.Envelope, error) {
	return []events.Envelope{e}, err
}
