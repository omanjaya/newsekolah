package domain

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestGroupSizeLimitValidate(t *testing.T) {
	if err := (GroupSizeLimit{Limit: 0}).Validate(); err != ErrGroupSizeLimitBelow {
		t.Fatalf("want ErrGroupSizeLimitBelow, got %v", err)
	}
	if err := (GroupSizeLimit{Limit: 1}).Validate(); err != nil {
		t.Fatalf("want nil, got %v", err)
	}
}

func TestCanAddMember(t *testing.T) {
	cases := []struct {
		name        string
		currentSize int
		limit       int
		wantCanAdd  bool
	}{
		{"below cap", 4, 15, true},
		{"one under cap", 14, 15, true},
		{"at cap", 15, 15, false},
		{"over cap after lowering limit", 20, 15, false},
		{"empty group, cap of one", 0, 1, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := CanAddMember(c.currentSize, c.limit); got != c.wantCanAdd {
				t.Fatalf("CanAddMember(%d, %d) = %v, want %v", c.currentSize, c.limit, got, c.wantCanAdd)
			}
		})
	}
}

func TestMeetingNoteVisibleTo(t *testing.T) {
	note := MeetingNote{}
	cases := []struct {
		name   string
		reader MeetingNoteReader
		want   bool
	}{
		{"author mentor reads own note", MeetingNoteReader{IsAuthor: true}, true},
		{"counselor reads", MeetingNoteReader{IsCounselor: true}, true},
		{"leadership reads", MeetingNoteReader{IsLeadership: true}, true},
		{"unrelated teacher cannot read", MeetingNoteReader{}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := note.VisibleTo(c.reader); got != c.want {
				t.Fatalf("VisibleTo(%+v) = %v, want %v", c.reader, got, c.want)
			}
		})
	}
}

func TestMeetingNoteValidate(t *testing.T) {
	valid := MeetingNote{
		GroupID: uuid.New(), MetAt: time.Now(), Kind: MeetingIndividual,
		AttendeeUserIDs: []uuid.UUID{uuid.New()}, Topic: "Kesulitan belajar matematika", Content: "Diskusi",
	}
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid note rejected: %v", err)
	}

	missingGroup := valid
	missingGroup.GroupID = uuid.Nil
	if err := missingGroup.Validate(); err != ErrInvalidInput {
		t.Fatalf("want ErrInvalidInput for missing group, got %v", err)
	}

	noAttendees := valid
	noAttendees.AttendeeUserIDs = nil
	if err := noAttendees.Validate(); err != ErrInvalidInput {
		t.Fatalf("want ErrInvalidInput for no attendees, got %v", err)
	}

	badKind := valid
	badKind.Kind = MeetingKind("unknown")
	if err := badKind.Validate(); err != ErrInvalidInput {
		t.Fatalf("want ErrInvalidInput for bad kind, got %v", err)
	}
}
