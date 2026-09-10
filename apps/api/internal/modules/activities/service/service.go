// Package service holds the activities module's use cases: the
// extracurricular catalogue, membership (capacity and per-student club
// limit enforced here, not in the database, so the message translates),
// meeting attendance against the module's local status vocabulary,
// one-off activities with their participants, and the achievement record.
package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// Repository is the data boundary the service depends on; repository/
// implements it with sqlc-generated queries.
type Repository interface {
	ListExtracurriculars(ctx context.Context, tenantID, yearID uuid.UUID, includeInactive bool) ([]domain.Extracurricular, error)
	GetExtracurricular(ctx context.Context, tenantID, id uuid.UUID) (domain.Extracurricular, bool, error)
	CreateExtracurricular(ctx context.Context, e domain.Extracurricular) (domain.Extracurricular, error)
	UpdateExtracurricular(ctx context.Context, e domain.Extracurricular) (domain.Extracurricular, error)
	DeleteExtracurricular(ctx context.Context, tenantID, id uuid.UUID) error

	CountActiveMembers(ctx context.Context, tenantID, clubID uuid.UUID) (int, error)
	CountActiveClubsForStudent(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (int, error)
	CreateMembership(ctx context.Context, m domain.Membership) (domain.Membership, error)
	GetActiveMembership(ctx context.Context, tenantID, clubID, studentID uuid.UUID) (domain.Membership, bool, error)
	GetMembership(ctx context.Context, tenantID, id uuid.UUID) (domain.Membership, bool, error)
	EndMembership(ctx context.Context, tenantID, id uuid.UUID, leftOn time.Time) (domain.Membership, bool, error)
	ListMembershipsForClub(ctx context.Context, tenantID, clubID uuid.UUID, includeLeft bool) ([]domain.Membership, error)
	ListMembershipsForStudent(ctx context.Context, tenantID, studentID uuid.UUID) ([]StudentMembership, error)

	GetLatestPolicy(ctx context.Context, tenantID uuid.UUID) ([]byte, int, bool, error)
	CreatePolicy(ctx context.Context, tenantID uuid.UUID, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error

	CreateMeeting(ctx context.Context, m domain.Meeting) (domain.Meeting, error)
	GetMeeting(ctx context.Context, tenantID, id uuid.UUID) (domain.Meeting, bool, error)
	ListMeetingsForClub(ctx context.Context, tenantID, clubID uuid.UUID) ([]domain.Meeting, error)
	ListActiveMemberStudentIDs(ctx context.Context, tenantID, clubID uuid.UUID) ([]uuid.UUID, error)
	UpsertAttendance(ctx context.Context, a domain.AttendanceEntry) (domain.AttendanceEntry, error)
	ListAttendanceForMeeting(ctx context.Context, tenantID, meetingID uuid.UUID) ([]domain.AttendanceEntry, error)
	ListAttendanceForClub(ctx context.Context, tenantID, clubID uuid.UUID) ([]domain.AttendanceEntry, error)

	CreateActivity(ctx context.Context, a domain.Activity) (domain.Activity, error)
	GetActivity(ctx context.Context, tenantID, id uuid.UUID) (domain.Activity, bool, error)
	UpdateActivity(ctx context.Context, a domain.Activity) (domain.Activity, error)
	DeleteActivity(ctx context.Context, tenantID, id uuid.UUID) error
	ListActivities(ctx context.Context, tenantID, yearID uuid.UUID, from, to *time.Time) ([]domain.Activity, error)
	AddParticipant(ctx context.Context, tenantID, activityID uuid.UUID, p domain.Participant) (domain.Participant, error)
	RemoveParticipant(ctx context.Context, tenantID, id uuid.UUID) error
	ListParticipants(ctx context.Context, tenantID, activityID uuid.UUID) ([]domain.Participant, error)

	CreateAchievement(ctx context.Context, a domain.Achievement) (domain.Achievement, error)
	GetAchievement(ctx context.Context, tenantID, id uuid.UUID) (domain.Achievement, bool, error)
	UpdateAchievement(ctx context.Context, a domain.Achievement) (domain.Achievement, error)
	DeleteAchievement(ctx context.Context, tenantID, id uuid.UUID) error
	ListAchievements(ctx context.Context, tenantID, yearID uuid.UUID, studentID, classID uuid.NullUUID) ([]domain.Achievement, error)
}

// StudentMembership pairs a membership with the club's name, for the
// student's own "my clubs" list.
type StudentMembership struct {
	domain.Membership
	ClubName string
}

// AcademicYearReader is what activities needs from the school module.
type AcademicYearReader interface {
	GetActiveAcademicYearID(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, bool, error)
}

type Service struct {
	pool  *pgxpool.Pool
	repo  Repository
	years AcademicYearReader
	clock clock.Clock
}

func New(pool *pgxpool.Pool, repo Repository, years AcademicYearReader, clk clock.Clock) *Service {
	if clk == nil {
		clk = clock.Real{}
	}
	return &Service{pool: pool, repo: repo, years: years, clock: clk}
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

// MembershipPolicy returns the tenant's configured club-membership limit,
// seeding the platform default (no limit) on first read.
func (s *Service) MembershipPolicy(ctx context.Context, tenantID uuid.UUID) (domain.MembershipLimitPolicy, error) {
	var policy domain.MembershipLimitPolicy
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		policy, err = s.loadMembershipPolicy(ctx, tenantID)
		return err
	})
	return policy, err
}

func (s *Service) loadMembershipPolicy(ctx context.Context, tenantID uuid.UUID) (domain.MembershipLimitPolicy, error) {
	raw, version, found, err := s.repo.GetLatestPolicy(ctx, tenantID)
	if err != nil {
		return domain.MembershipLimitPolicy{}, err
	}
	if !found {
		def := domain.DefaultMembershipLimitPolicy()
		encoded, err := json.Marshal(policyConfig{MaxClubsPerStudent: def.MaxClubsPerStudent})
		if err != nil {
			return domain.MembershipLimitPolicy{}, err
		}
		if err := s.repo.CreatePolicy(ctx, tenantID, def.Version, encoded, s.clock.Now(), uuid.NullUUID{}); err != nil {
			return domain.MembershipLimitPolicy{}, err
		}
		return def, nil
	}
	var cfg policyConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return domain.MembershipLimitPolicy{}, err
	}
	return domain.MembershipLimitPolicy{Version: version, MaxClubsPerStudent: cfg.MaxClubsPerStudent}, nil
}

type policyConfig struct {
	MaxClubsPerStudent int `json:"max_clubs_per_student"`
}

// UpdateMembershipPolicy appends a new version of the club-membership cap.
func (s *Service) UpdateMembershipPolicy(ctx context.Context, tenantID, actorUserID uuid.UUID, maxClubs int) (domain.MembershipLimitPolicy, error) {
	next := domain.MembershipLimitPolicy{MaxClubsPerStudent: maxClubs}
	if err := next.Validate(); err != nil {
		return domain.MembershipLimitPolicy{}, err
	}
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, err := s.loadMembershipPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		next.Version = current.Version + 1
		encoded, err := json.Marshal(policyConfig{MaxClubsPerStudent: next.MaxClubsPerStudent})
		if err != nil {
			return err
		}
		return s.repo.CreatePolicy(ctx, tenantID, next.Version, encoded, s.clock.Now(), uuid.NullUUID{UUID: actorUserID, Valid: true})
	})
	return next, err
}
