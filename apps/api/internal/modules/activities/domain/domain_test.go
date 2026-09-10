package domain_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
)

func uuidValid() uuid.NullUUID { return uuid.NullUUID{UUID: uuid.New(), Valid: true} }

func day(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestExtracurricularHasRoom(t *testing.T) {
	cap5 := 5
	club := domain.Extracurricular{Capacity: &cap5}

	require.True(t, club.HasRoom(0))
	require.True(t, club.HasRoom(4))
	require.False(t, club.HasRoom(5))
	require.False(t, club.HasRoom(6))

	unlimited := domain.Extracurricular{Capacity: nil}
	require.True(t, unlimited.HasRoom(1000))
}

func TestMembershipLimitPolicy_AllowsAnotherClub(t *testing.T) {
	tests := []struct {
		name    string
		policy  domain.MembershipLimitPolicy
		current int
		want    bool
	}{
		{"no limit configured", domain.MembershipLimitPolicy{MaxClubsPerStudent: 0}, 100, true},
		{"under the cap", domain.MembershipLimitPolicy{MaxClubsPerStudent: 3}, 2, true},
		{"at the cap", domain.MembershipLimitPolicy{MaxClubsPerStudent: 3}, 3, false},
		{"over the cap", domain.MembershipLimitPolicy{MaxClubsPerStudent: 3}, 4, false},
		{"cap of one, zero held", domain.MembershipLimitPolicy{MaxClubsPerStudent: 1}, 0, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, tt.policy.AllowsAnotherClub(tt.current))
		})
	}
}

func TestMembershipLimitPolicy_Validate(t *testing.T) {
	require.NoError(t, domain.MembershipLimitPolicy{MaxClubsPerStudent: 0}.Validate())
	require.NoError(t, domain.MembershipLimitPolicy{MaxClubsPerStudent: 2}.Validate())
	require.ErrorIs(t, domain.MembershipLimitPolicy{MaxClubsPerStudent: -1}.Validate(), domain.ErrInvalidInput)
}

func TestMembership_ActiveDuringPeriod(t *testing.T) {
	termStart, termEnd := day("2026-01-01"), day("2026-06-30")

	tests := []struct {
		name     string
		joinedOn time.Time
		leftOn   *time.Time
		want     bool
	}{
		{"joined before term, still active", day("2025-11-01"), nil, true},
		{"joined and left entirely inside term", day("2026-02-01"), ptr(day("2026-03-01")), true},
		{"joined before term, left inside term", day("2025-12-01"), ptr(day("2026-01-15")), true},
		{"joined inside term, still active after term ends", day("2026-05-01"), nil, true},
		{"joined and left entirely before term starts", day("2025-01-01"), ptr(day("2025-12-31")), false},
		{"joined after term ends", day("2026-07-01"), nil, false},
		{"left exactly on the first day of the term", day("2025-06-01"), ptr(termStart), true},
		{"left the day before the term starts", day("2025-06-01"), ptr(day("2025-12-31")), false},
		{"joined exactly on the last day of the term", termEnd, nil, true},
		{"joined the day after the term ends", day("2026-07-01"), ptr(day("2026-08-01")), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := domain.Membership{JoinedOn: tt.joinedOn, LeftOn: tt.leftOn}
			require.Equal(t, tt.want, m.ActiveDuringPeriod(termStart, termEnd))
		})
	}
}

func ptr(t time.Time) *time.Time { return &t }

func TestParticipant_Validate(t *testing.T) {
	classID := domain.Participant{ClassID: uuidValid()}
	require.NoError(t, classID.Validate())

	none := domain.Participant{}
	require.ErrorIs(t, none.Validate(), domain.ErrInvalidParticipant)

	both := domain.Participant{ClassID: uuidValid(), StudentID: uuidValid()}
	require.ErrorIs(t, both.Validate(), domain.ErrInvalidParticipant)
}

func TestAchievement_Validate(t *testing.T) {
	valid := domain.Achievement{CompetitionName: "OSN Matematika", Level: domain.LevelProvince, Placing: "Juara 1", AchievedOn: day("2026-03-01")}
	require.NoError(t, valid.Validate())

	require.ErrorIs(t, domain.Achievement{}.Validate(), domain.ErrInvalidInput)

	badLevel := valid
	badLevel.Level = "galaxy"
	require.ErrorIs(t, badLevel.Validate(), domain.ErrInvalidInput)
}
