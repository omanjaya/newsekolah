package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
)

type MeetingNoteInput struct {
	GroupID         uuid.UUID
	MetAt           time.Time
	Kind            domain.MeetingKind
	AttendeeUserIDs []uuid.UUID
	Topic           string
	Content         string
	AgreedActions   string
}

func (in MeetingNoteInput) toDomain() domain.MeetingNote {
	return domain.MeetingNote{
		GroupID: in.GroupID, MetAt: in.MetAt, Kind: in.Kind, AttendeeUserIDs: in.AttendeeUserIDs,
		Topic: strings.TrimSpace(in.Topic), Content: in.Content, AgreedActions: in.AgreedActions,
	}
}

// CreateMeetingNote records one mentoring session. The content is sealed
// with the platform sealer exactly as discipline seals counseling notes,
// because a meeting note may concern a child's difficulties.
func (s *Service) CreateMeetingNote(ctx context.Context, tenantID, mentorUserID uuid.UUID, in MeetingNoteInput) (domain.MeetingNote, error) {
	note := in.toDomain()
	if err := note.Validate(); err != nil {
		return domain.MeetingNote{}, err
	}
	var out domain.MeetingNote
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		group, ok, err := s.repo.GetGroup(ctx, tenantID, note.GroupID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrGroupNotFound
		}
		content, err := s.seal(note.Content)
		if err != nil {
			return err
		}
		agreed, err := s.seal(note.AgreedActions)
		if err != nil {
			return err
		}
		note.TenantID, note.AcademicYearID, note.MentorUserID = tenantID, group.AcademicYearID, mentorUserID
		out, err = s.repo.CreateMeetingNote(ctx, note, content, agreed, s.sealer.KeyID)
		if err != nil {
			return err
		}
		out.Content, out.AgreedActions = note.Content, note.AgreedActions
		return nil
	})
	return out, err
}

func (s *Service) UpdateMeetingNote(ctx context.Context, tenantID, id, actorUserID uuid.UUID, in MeetingNoteInput) (domain.MeetingNote, error) {
	note := in.toDomain()
	if err := note.Validate(); err != nil {
		return domain.MeetingNote{}, err
	}
	var out domain.MeetingNote
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		current, ok, err := s.repo.GetMeetingNote(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrNoteNotFound
		}
		if current.MentorUserID != actorUserID {
			return domain.ErrNoteForbidden
		}
		content, err := s.seal(note.Content)
		if err != nil {
			return err
		}
		agreed, err := s.seal(note.AgreedActions)
		if err != nil {
			return err
		}
		next := current.MeetingNote
		next.MetAt, next.Kind, next.AttendeeUserIDs, next.Topic = note.MetAt, note.Kind, note.AttendeeUserIDs, note.Topic
		out, err = s.repo.UpdateMeetingNote(ctx, next, content, agreed, s.sealer.KeyID)
		if err != nil {
			return err
		}
		out.Content, out.AgreedActions = note.Content, note.AgreedActions
		return nil
	})
	return out, err
}

// GetMeetingNote returns the note opened for a reader whose role allows
// it: the mentor who wrote it, a counselor, or leadership.
func (s *Service) GetMeetingNote(ctx context.Context, tenantID, id, readerUserID uuid.UUID) (domain.MeetingNote, error) {
	var out domain.MeetingNote
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		enc, ok, err := s.repo.GetMeetingNote(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrNoteNotFound
		}
		role, err := s.noteReaderRole(ctx, tenantID, enc.AcademicYearID, readerUserID, enc.MentorUserID)
		if err != nil {
			return err
		}
		if !enc.VisibleTo(role) {
			return domain.ErrNoteForbidden
		}
		out, err = s.open(enc)
		return err
	})
	return out, err
}

// ListMeetingNotesForGroup returns every note the reader may open; notes
// outside the reader's role are skipped rather than returned with an
// empty body, since a list view has no use for a note nobody can read.
func (s *Service) ListMeetingNotesForGroup(ctx context.Context, tenantID, groupID, readerUserID uuid.UUID) ([]domain.MeetingNote, error) {
	var out []domain.MeetingNote
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		rows, err := s.repo.ListMeetingNotesForGroup(ctx, tenantID, groupID)
		if err != nil {
			return err
		}
		out = make([]domain.MeetingNote, 0, len(rows))
		for _, enc := range rows {
			role, err := s.noteReaderRole(ctx, tenantID, enc.AcademicYearID, readerUserID, enc.MentorUserID)
			if err != nil {
				return err
			}
			if !enc.VisibleTo(role) {
				continue
			}
			n, err := s.open(enc)
			if err != nil {
				return err
			}
			out = append(out, n)
		}
		return nil
	})
	return out, err
}

func (s *Service) DeleteMeetingNote(ctx context.Context, tenantID, id, actorUserID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		current, ok, err := s.repo.GetMeetingNote(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrNoteNotFound
		}
		if current.MentorUserID != actorUserID {
			return domain.ErrNoteForbidden
		}
		return s.repo.DeleteMeetingNote(ctx, tenantID, id)
	})
}
