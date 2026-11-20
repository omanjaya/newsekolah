package library

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// namedDirectory resolves every user to one fixed name, standing in for the
// identity module the running API wires in.
type namedDirectory struct{ name string }

func (d namedDirectory) UserDisplayName(context.Context, uuid.UUID, uuid.UUID) (string, error) {
	return d.name, nil
}

func (namedDirectory) UserRole(context.Context, uuid.UUID, uuid.UUID) (string, bool, error) {
	return "", false, nil
}

// TestRepeatedVisitTellsTheCallerItWasAlreadyRecorded proves the second
// record of a member's visit inside the 30-minute window says so instead
// of passing for a new visit, keeps the first purpose, and only fills in
// a purpose that was left empty.
func TestRepeatedVisitTellsTheCallerItWasAlreadyRecorded(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := witaWorld(t, ctx, pg, "dup")
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, clock.Frozen{At: time.Date(2020, 6, 15, 12, 0, 0, 0, time.UTC)})

	record := func(at time.Time, member uuid.UUID, purpose string) service.RecordVisitResult {
		t.Helper()
		got, err := svc.RecordVisit(clock.WithTime(ctx, at), w.tenantID, service.RecordVisitInput{
			MemberUserID: uuid.NullUUID{UUID: member, Valid: true}, Kind: domain.VisitMember, Purpose: purpose,
		})
		require.NoError(t, err)
		return got
	}
	at := time.Date(2026, 11, 20, 1, 0, 0, 0, time.UTC)

	first := record(at, w.memberUserID, "Membaca pertama")
	require.False(t, first.AlreadyRecorded)
	second := record(at.Add(10*time.Minute), w.memberUserID, "Membaca kedua")
	require.True(t, second.AlreadyRecorded)
	require.Equal(t, first.Visit.ID, second.Visit.ID)
	require.Equal(t, "Membaca pertama", second.Visit.Purpose, "the first purpose stays")
	third := record(at.Add(31*time.Minute), w.memberUserID, "")
	require.False(t, third.AlreadyRecorded, "a visit after the window is a new one")

	other := newUser(t, ctx, pg, w.tenantID, "other")
	blank := record(at, other, "")
	filled := record(at.Add(5*time.Minute), other, "  Mengerjakan tugas  ")
	require.True(t, filled.AlreadyRecorded)
	require.Equal(t, blank.Visit.ID, filled.Visit.ID)
	require.Equal(t, "Mengerjakan tugas", filled.Visit.Purpose, "an empty purpose is filled in")
}

// TestReadInPlaceSessionsEndAndNameTheReader proves a read-in-place session
// can be ended, that starting the next one on the same copy ends the one
// still open, and that each entry names its member reader.
func TestReadInPlaceSessionsEndAndNameTheReader(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := witaWorld(t, ctx, pg, "rip")
	svc := service.New(pg.AppPool, repository.New(pg.AppPool), namedDirectory{name: "Siswa Dua Contoh"}, nil,
		clock.Frozen{At: time.Date(2020, 6, 15, 12, 0, 0, 0, time.UTC)})
	member := uuid.NullUUID{UUID: w.memberUserID, Valid: true}

	t0 := time.Date(2026, 11, 20, 7, 44, 0, 0, time.UTC)
	first, err := svc.StartReadInPlace(clock.WithTime(ctx, t0), w.tenantID, w.copyID, member, "", uuid.NullUUID{})
	require.NoError(t, err)
	require.Nil(t, first.EndedAt)
	require.Equal(t, "Siswa Dua Contoh", first.MemberName)

	second, err := svc.StartReadInPlace(clock.WithTime(ctx, t0.Add(24*time.Minute)), w.tenantID, w.copyID, uuid.NullUUID{}, " Tamu ", uuid.NullUUID{})
	require.NoError(t, err)
	require.Equal(t, "Tamu", second.VisitorName)
	require.Empty(t, second.MemberName)

	history, err := svc.ReadInPlaceHistory(ctx, w.tenantID, w.copyID)
	require.NoError(t, err)
	require.Len(t, history, 2)
	require.Equal(t, second.ID, history[0].ID)
	require.Nil(t, history[0].EndedAt, "the newest session is still open")
	require.NotNil(t, history[1].EndedAt, "starting the next reader ended the earlier session")
	require.True(t, t0.Add(24*time.Minute).Equal(*history[1].EndedAt))
	require.Equal(t, "Siswa Dua Contoh", history[1].MemberName)

	endAt := t0.Add(40 * time.Minute)
	ended, err := svc.EndReadInPlace(clock.WithTime(ctx, endAt), w.tenantID, second.ID)
	require.NoError(t, err)
	require.NotNil(t, ended.EndedAt)
	require.True(t, endAt.Equal(*ended.EndedAt))

	again, err := svc.EndReadInPlace(clock.WithTime(ctx, endAt.Add(time.Hour)), w.tenantID, second.ID)
	require.NoError(t, err, "ending an ended session is harmless")
	require.True(t, endAt.Equal(*again.EndedAt), "and keeps its first end time")

	_, err = svc.EndReadInPlace(ctx, w.tenantID, uuid.New())
	require.ErrorIs(t, err, domain.ErrReadInPlaceNotFound)
}
