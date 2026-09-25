package service_test

import (
	"context"
	"encoding/json"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// recordedRolePublish captures one RealtimePublisher.PublishRole call.
type recordedRolePublish struct {
	tenantID  uuid.UUID
	role      string
	eventType string
	payload   any
}

// fakeRealtimeHub implements library/service.RealtimePublisher without a
// real platform/realtime.Hub, so a test can assert exactly which role
// topic, event type, and payload were published -- the plan's "fake hub
// asserting topic, type, and payload" (docs/analysis/
// realtime-plan-2026-09-25.md section 4, chunk C3's test row).
type fakeRealtimeHub struct {
	mu        sync.Mutex
	published []recordedRolePublish
}

func (f *fakeRealtimeHub) PublishRole(tenantID uuid.UUID, role, eventType string, payload any) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.published = append(f.published, recordedRolePublish{tenantID: tenantID, role: role, eventType: eventType, payload: payload})
	return nil
}

func (f *fakeRealtimeHub) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.published)
}

func requireReservationPayload(t *testing.T, payload any, wantReservationID, wantTitleID uuid.UUID) {
	t.Helper()
	raw, err := json.Marshal(payload)
	require.NoError(t, err)
	var got struct {
		ReservationID uuid.UUID `json:"reservation_id"`
		TitleID       uuid.UUID `json:"title_id"`
	}
	require.NoError(t, json.Unmarshal(raw, &got))
	require.Equal(t, wantReservationID, got.ReservationID)
	require.Equal(t, wantTitleID, got.TitleID)
}

// libraryRealtimeWorld is one tenant with a title, one copy, and two
// members: borrowerID (who checks the copy out) and reserverID (who
// reserves it while it is on loan) -- enough to drive Reserve and Return's
// reservation-ready hand-off.
type libraryRealtimeWorld struct {
	tenantID, titleID, copyID uuid.UUID
	copyBarcode               string
	borrowerID, reserverID    uuid.UUID
}

func seedLibraryRealtimeWorld(t *testing.T, ctx context.Context, pool *pgxpool.Pool, slug string) libraryRealtimeWorld {
	t.Helper()
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	var w libraryRealtimeWorld
	w.tenantID = insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ($1,$1,'sma','UTC','id','active','default')`, slug)

	w.titleID = insertID(`insert into library_titles (tenant_id, title) values ($1, 'Judul Test')`, w.tenantID)
	w.copyBarcode = "BC-" + slug
	w.copyID = insertID(`insert into library_copies (tenant_id, title_id, barcode, status) values ($1, $2, $3, 'available')`,
		w.tenantID, w.titleID, w.copyBarcode)

	memberType := insertID(`insert into library_member_types (tenant_id, name) values ($1, 'Siswa')`, w.tenantID)

	newMemberUser := func(prefix string) uuid.UUID {
		short := uuid.NewString()[:8]
		userID := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,$2,'x',$2,'active','id')`,
			w.tenantID, prefix+"-"+short)
		_, err := pool.Exec(ctx, `insert into library_members (user_id, tenant_id, member_no, member_type_id, registered_on, status)
			values ($1, $2, $3, $4, current_date, 'active')`, userID, w.tenantID, "M-"+short, memberType)
		require.NoError(t, err)
		return userID
	}
	w.borrowerID = newMemberUser("borrower")
	w.reserverID = newMemberUser("reserver")

	return w
}

func buildLibraryServiceWithRealtime(pool *pgxpool.Pool, hub service.RealtimePublisher) *service.Service {
	return service.New(pool, repository.New(pool), nil, nil, clock.Real{}, service.Deps{Realtime: hub})
}

// TestReservePublishesToLibrarianRole covers opportunity #7's
// "library.reserved" (docs/analysis/realtime-plan-2026-09-25.md section
// 2): placing a reservation must push the librarian desk's queue.
func TestReservePublishesToLibrarianRole(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLibraryRealtimeWorld(t, ctx, pg.AdminPool, "reserve-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildLibraryServiceWithRealtime(pg.AppPool, hub)

	// Reserve refuses while a copy is available for loan (the seeded copy
	// starts 'available'), so the borrower checks it out first -- this
	// already publishes nothing (Borrow is out of this chunk's scope).
	_, err := svc.Borrow(ctx, w.tenantID, service.BorrowInput{
		Barcode: w.copyBarcode, MemberUserID: w.borrowerID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)
	require.Empty(t, hub.published, "borrowing an available copy must not publish anything")

	reservation, err := svc.Reserve(ctx, w.tenantID, w.titleID, w.reserverID)
	require.NoError(t, err)

	require.Len(t, hub.published, 1)
	got := hub.published[0]
	require.Equal(t, w.tenantID, got.tenantID)
	require.Equal(t, "librarian", got.role)
	require.Equal(t, "library.reserved", got.eventType)
	requireReservationPayload(t, got.payload, reservation.ID, w.titleID)
}

// TestReservePublishesNothingWhenACopyIsAvailable is the negative case:
// Reserve refuses when an available copy already exists
// (ErrCopyAvailableForLoan) before ever creating a reservation row, so
// nothing must reach the hub.
func TestReservePublishesNothingWhenACopyIsAvailable(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLibraryRealtimeWorld(t, ctx, pg.AdminPool, "reserve-fail-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildLibraryServiceWithRealtime(pg.AppPool, hub)

	_, err := svc.Reserve(ctx, w.tenantID, w.titleID, w.reserverID)
	require.ErrorIs(t, err, domain.ErrCopyAvailableForLoan, "the seeded copy is still available")
	require.Equal(t, 0, hub.count())
}

// TestReturnPublishesReservationReadyToLibrarianRole covers opportunity
// #7's reused "library.reservation_ready": once a copy is returned and
// handed to the next waiting reservation, the desk must be pushed live so
// staff can pull the book for pickup, in addition to the existing
// persisted-inbox notification to the member (unaffected by this chunk).
func TestReturnPublishesReservationReadyToLibrarianRole(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLibraryRealtimeWorld(t, ctx, pg.AdminPool, "return-ready-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildLibraryServiceWithRealtime(pg.AppPool, hub)

	_, err := svc.Borrow(ctx, w.tenantID, service.BorrowInput{
		Barcode: w.copyBarcode, MemberUserID: w.borrowerID, CheckedOutBy: w.borrowerID, Channel: domain.ChannelDesk,
	})
	require.NoError(t, err)
	require.Empty(t, hub.published, "borrowing an available copy must not publish anything")

	reservation, err := svc.Reserve(ctx, w.tenantID, w.titleID, w.reserverID)
	require.NoError(t, err)
	require.Len(t, hub.published, 1, "the reservation itself already published once")

	_, err = svc.Return(ctx, w.tenantID, service.ReturnInput{
		Barcode: w.copyBarcode, CheckedInBy: w.borrowerID,
	})
	require.NoError(t, err)

	require.Len(t, hub.published, 2)
	got := hub.published[1]
	require.Equal(t, w.tenantID, got.tenantID)
	require.Equal(t, "librarian", got.role)
	require.Equal(t, "library.reservation_ready", got.eventType)
	requireReservationPayload(t, got.payload, reservation.ID, w.titleID)
}

// TestReturnPublishesNothingWhenTheLoanDoesNotExist is the negative case:
// returning an unknown barcode refuses with ErrLoanNotFound before
// touching any row, so nothing must reach the hub.
func TestReturnPublishesNothingWhenTheLoanDoesNotExist(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLibraryRealtimeWorld(t, ctx, pg.AdminPool, "return-fail-"+uuid.NewString())

	hub := &fakeRealtimeHub{}
	svc := buildLibraryServiceWithRealtime(pg.AppPool, hub)

	_, err := svc.Return(ctx, w.tenantID, service.ReturnInput{Barcode: "does-not-exist", CheckedInBy: w.borrowerID})
	require.ErrorIs(t, err, domain.ErrLoanNotFound)
	require.Equal(t, 0, hub.count())
}
