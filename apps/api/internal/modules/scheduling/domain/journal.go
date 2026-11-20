package domain

import (
	"strings"
	"time"

	"github.com/google/uuid"
)

// Journal is one lesson's teaching log: what was covered, what students
// did, and the teacher's reflection, unique per (teacher, class, subject,
// date).
type Journal struct {
	ID                  uuid.UUID
	TenantID            uuid.UUID
	AcademicYearID      uuid.UUID
	TeacherUserID       uuid.UUID
	WrittenByUserID     uuid.UUID
	ClassID             uuid.UUID
	SubjectID           uuid.UUID
	LessonDate          time.Time
	Topic               string
	Activities          string
	Reflection          string
	AttendanceSessionID uuid.NullUUID
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// ValidateJournalContent enforces the fields the old system required
// together (topic and activities are both mandatory, per
// docs/analysis/backend-inventory.md section 1.12); reflection stays
// optional.
func ValidateJournalContent(topic, activities string) error {
	if strings.TrimSpace(topic) == "" {
		return ErrJournalMissingTopic
	}
	if strings.TrimSpace(activities) == "" {
		return ErrJournalMissingActivity
	}
	return nil
}

// CanWrite reports whether userID may create/edit this journal: the
// teaching teacher (or their accepted substitute for that date, resolved
// by the service via AccessChecker) always may; a supervisor with
// view_journals_all may only read, never write, so this only ever checks
// the write path.
func CanWrite(teacherUserID, userID uuid.UUID) bool {
	return teacherUserID == userID
}

// SameContent reports whether j and other record the same lesson with the
// same text, so a repeated submit of one journal can be told apart from a
// second, different journal for that lesson.
func (j Journal) SameContent(other Journal) bool {
	return j.ClassID == other.ClassID && j.SubjectID == other.SubjectID &&
		j.LessonDate.Format("2006-01-02") == other.LessonDate.Format("2006-01-02") &&
		j.Topic == other.Topic && j.Activities == other.Activities && j.Reflection == other.Reflection
}
