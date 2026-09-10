// Package service holds the mentoring use cases: mentor group assignment
// bounded by a tenant group-size limit, encrypted meeting notes restricted
// to the mentor/counselor/leadership, the mentor's per-student view
// composed from other modules through adapters, and term summaries.
package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/mentoring/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// Repository is mentoring's data boundary.
type Repository interface {
	GetGroupSizeLimit(ctx context.Context, tenantID uuid.UUID) (int, bool, error)
	SetGroupSizeLimit(ctx context.Context, tenantID uuid.UUID, limit int) error

	CreateGroup(ctx context.Context, g domain.MentorGroup) (domain.MentorGroup, error)
	GetGroup(ctx context.Context, tenantID, id uuid.UUID) (domain.MentorGroup, bool, error)
	UpdateGroup(ctx context.Context, g domain.MentorGroup) (domain.MentorGroup, error)
	DeleteGroup(ctx context.Context, tenantID, id uuid.UUID) error
	ListGroupsForMentor(ctx context.Context, tenantID, yearID, mentorUserID uuid.UUID) ([]domain.MentorGroup, error)
	ListGroupsForYear(ctx context.Context, tenantID, yearID uuid.UUID) ([]domain.MentorGroup, error)

	CountGroupMembers(ctx context.Context, tenantID, groupID uuid.UUID) (int, error)
	AddGroupMember(ctx context.Context, tenantID, yearID uuid.UUID, m domain.GroupMember) (domain.GroupMember, error)
	RemoveGroupMember(ctx context.Context, tenantID, groupID, studentUserID uuid.UUID) error
	ListGroupMembers(ctx context.Context, tenantID, groupID uuid.UUID) ([]domain.GroupMember, error)
	FindMembershipForStudent(ctx context.Context, tenantID, yearID, studentUserID uuid.UUID) (domain.GroupMember, bool, error)

	CreateMeetingNote(ctx context.Context, n domain.MeetingNote, content, agreedActions []byte, keyID string) (domain.MeetingNote, error)
	UpdateMeetingNote(ctx context.Context, n domain.MeetingNote, content, agreedActions []byte, keyID string) (domain.MeetingNote, error)
	GetMeetingNote(ctx context.Context, tenantID, id uuid.UUID) (EncryptedMeetingNote, bool, error)
	ListMeetingNotesForGroup(ctx context.Context, tenantID, groupID uuid.UUID) ([]EncryptedMeetingNote, error)
	DeleteMeetingNote(ctx context.Context, tenantID, id uuid.UUID) error

	UpsertTermSummary(ctx context.Context, s domain.TermSummary) (domain.TermSummary, error)
	GetTermSummary(ctx context.Context, tenantID, termID, studentUserID uuid.UUID) (domain.TermSummary, bool, error)
	ListTermSummariesForGroup(ctx context.Context, tenantID, termID, groupID uuid.UUID) ([]domain.TermSummary, error)

	HasActiveDuty(ctx context.Context, tenantID, yearID, userID uuid.UUID, slug string) (bool, error)
	StudentInfo(ctx context.Context, tenantID, yearID, studentUserID uuid.UUID) (StudentInfo, error)
}

type StudentInfo struct {
	Name      string
	ClassName string
}

// EncryptedMeetingNote is the stored row before the service opens the
// ciphertext for a permitted reader.
type EncryptedMeetingNote struct {
	domain.MeetingNote
	ContentEncrypted       []byte
	AgreedActionsEncrypted []byte
	ContentKeyID           string
}

// AcademicYearReader is what mentoring needs from the school module.
type AcademicYearReader interface {
	GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
}

// AttendanceReader is the attendance module reached through a wiring
// adapter, never mentoring reading its tables.
type AttendanceReader interface {
	MonthlyStatusCounts(ctx context.Context, tenantID, studentID uuid.UUID, month string) (map[string]int, error)
}

// DisciplineReader is the discipline module reached through a wiring
// adapter.
type DisciplineReader interface {
	StudentPoints(ctx context.Context, tenantID, studentID uuid.UUID) (points, activeCount int, err error)
}

// GradingReader is the grading module reached through a wiring adapter;
// only published report scores matter for the mentor's snapshot.
type GradingReader interface {
	PublishedSubjects(ctx context.Context, tenantID, studentID uuid.UUID) ([]domain.PublishedGrade, error)
}

// FlagChecker asks the platform module whether mentoring is turned on for
// this tenant, reached through a wiring adapter so mentoring never imports
// the platform module directly.
type FlagChecker interface {
	IsModuleEnabled(ctx context.Context, tenantID uuid.UUID, module string) (bool, error)
}

const ModuleKey = "mentoring"

type Service struct {
	pool       *pgxpool.Pool
	repo       Repository
	years      AcademicYearReader
	attendance AttendanceReader
	discipline DisciplineReader
	grading    GradingReader
	flags      FlagChecker
	sealer     *crypto.Sealer
	clock      clock.Clock
}

func New(pool *pgxpool.Pool, repo Repository, years AcademicYearReader, attendance AttendanceReader,
	discipline DisciplineReader, grading GradingReader, flags FlagChecker, sealer *crypto.Sealer, clk clock.Clock) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{pool: pool, repo: repo, years: years, attendance: attendance, discipline: discipline, grading: grading, flags: flags, sealer: sealer, clock: clk}
}

func (s *Service) withTx(ctx context.Context, tenantID uuid.UUID, fn func(ctx context.Context) error) error {
	return database.WithTenantTx(ctx, s.pool, tenantID, fn)
}

func (s *Service) activeYear(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, error) {
	id, ok, err := s.years.GetActiveAcademicYearID(ctx, tenantID)
	if err != nil {
		return uuid.Nil, err
	}
	if !ok {
		return uuid.Nil, domain.ErrNoActiveAcademicYear
	}
	return id, nil
}

// requireEnabled fails a use case when the console has turned mentoring
// off for this tenant. A nil FlagChecker (no wiring configured) leaves the
// module enabled, matching feature_flags' opt-out default elsewhere.
func (s *Service) requireEnabled(ctx context.Context, tenantID uuid.UUID) error {
	if s.flags == nil {
		return nil
	}
	enabled, err := s.flags.IsModuleEnabled(ctx, tenantID, ModuleKey)
	if err != nil {
		return err
	}
	if !enabled {
		return domain.ErrModuleDisabled
	}
	return nil
}

// GroupSizeLimit returns the tenant's cap, seeding the platform default on
// first read.
func (s *Service) GroupSizeLimit(ctx context.Context, tenantID uuid.UUID) (int, error) {
	var limit int
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		limit, err = s.groupSizeLimit(ctx, tenantID)
		return err
	})
	return limit, err
}

func (s *Service) groupSizeLimit(ctx context.Context, tenantID uuid.UUID) (int, error) {
	limit, found, err := s.repo.GetGroupSizeLimit(ctx, tenantID)
	if err != nil {
		return 0, err
	}
	if !found {
		if err := s.repo.SetGroupSizeLimit(ctx, tenantID, domain.DefaultGroupSizeLimit); err != nil {
			return 0, err
		}
		return domain.DefaultGroupSizeLimit, nil
	}
	return limit, nil
}

// SetGroupSizeLimit changes the cap a school allows per mentor group.
func (s *Service) SetGroupSizeLimit(ctx context.Context, tenantID uuid.UUID, limit int) (int, error) {
	if err := (domain.GroupSizeLimit{Limit: limit}).Validate(); err != nil {
		return 0, err
	}
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireEnabled(ctx, tenantID); err != nil {
			return err
		}
		return s.repo.SetGroupSizeLimit(ctx, tenantID, limit)
	})
	return limit, err
}

func (s *Service) seal(text string) ([]byte, error) {
	if text == "" {
		return nil, nil
	}
	return s.sealer.Seal([]byte(text))
}

func (s *Service) open(enc EncryptedMeetingNote) (domain.MeetingNote, error) {
	n := enc.MeetingNote
	if len(enc.ContentEncrypted) > 0 {
		plain, err := s.sealer.Open(enc.ContentEncrypted)
		if err != nil {
			return n, err
		}
		n.Content = string(plain)
	}
	if len(enc.AgreedActionsEncrypted) > 0 {
		plain, err := s.sealer.Open(enc.AgreedActionsEncrypted)
		if err != nil {
			return n, err
		}
		n.AgreedActions = string(plain)
	}
	return n, nil
}

func (s *Service) noteReaderRole(ctx context.Context, tenantID, yearID, userID, authorID uuid.UUID) (domain.MeetingNoteReader, error) {
	role := domain.MeetingNoteReader{IsAuthor: userID == authorID}
	var err error
	if role.IsCounselor, err = s.repo.HasActiveDuty(ctx, tenantID, yearID, userID, "counselor"); err != nil {
		return role, err
	}
	if role.IsLeadership, err = s.repo.HasActiveDuty(ctx, tenantID, yearID, userID, "leadership"); err != nil {
		return role, err
	}
	return role, nil
}
