package wiring

import (
	"context"
	"log/slog"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	librarydomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	libraryrepository "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	libraryservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

// TestReturningAReservedTitleNotifiesTheReserver walks the reservation
// hand-off through the real bus, notification bridge and notifications
// module, as the running API wires them: returning a copy someone has
// reserved used to answer 500 (the bridge received its own envelope back
// and panicked) while the return was committed anyway, the retry said the
// loan did not exist, and the member was never notified.
func TestReturningAReservedTitleNotifiesTheReserver(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()

	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}
	slug := "handoff-" + uuid.NewString()[:8]
	tenantID := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ($1,$1,'sma','UTC','id','active','default')`, slug)
	titleID := insertID(`insert into library_titles (tenant_id, title) values ($1, 'Negeri 5 Menara')`, tenantID)
	barcode := "BC-" + slug
	insertID(`insert into library_copies (tenant_id, title_id, barcode, status) values ($1, $2, $3, 'available')`, tenantID, titleID, barcode)
	memberType := insertID(`insert into library_member_types (tenant_id, name) values ($1, 'Siswa')`, tenantID)
	member := func(prefix string) uuid.UUID {
		id := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,$2,'x',$2,'active','id')`,
			tenantID, prefix+"-"+slug)
		_, err := pg.AdminPool.Exec(ctx, `insert into library_members (user_id, tenant_id, member_no, member_type_id, registered_on, status)
			values ($1, $2, $3, $4, current_date, 'active')`, id, tenantID, "M-"+prefix+"-"+slug, memberType)
		require.NoError(t, err)
		return id
	}
	borrower := member("borrower")
	reserver := member("reserver")

	bus := events.NewBus()
	RegisterNotificationBridge(bus, nil, slog.Default())
	notifications.Register(notifications.Dependencies{Pool: pg.AppPool, Bus: bus, Clock: clock.Real{}})
	library := libraryservice.New(pg.AppPool, libraryrepository.New(pg.AppPool), nil, nil, clock.Real{},
		libraryservice.Deps{Events: LibraryEvents{Bus: bus}})

	_, err := library.Borrow(ctx, tenantID, libraryservice.BorrowInput{
		Barcode: barcode, MemberUserID: borrower, CheckedOutBy: borrower, Channel: librarydomain.ChannelDesk,
	})
	require.NoError(t, err)
	_, err = library.Reserve(ctx, tenantID, titleID, reserver)
	require.NoError(t, err)

	require.NotPanics(t, func() {
		_, err = library.Return(ctx, tenantID, libraryservice.ReturnInput{Barcode: barcode, CheckedInBy: borrower})
	})
	require.NoError(t, err, "returning a reserved title succeeds")

	var kind, href string
	require.NoError(t, pg.AdminPool.QueryRow(ctx, `select kind, href from notifications where tenant_id = $1 and user_id = $2`,
		tenantID, reserver).Scan(&kind, &href), "the reserver is told the book is ready")
	require.Equal(t, "library_reservation_ready", kind)
	require.Equal(t, "/library/me", href)

	// The reserver collects the held copy at the desk.
	loan, err := library.Borrow(ctx, tenantID, libraryservice.BorrowInput{
		Barcode: barcode, MemberUserID: reserver, CheckedOutBy: borrower, Channel: librarydomain.ChannelDesk,
	})
	require.NoError(t, err)
	require.Equal(t, reserver, loan.MemberUserID)
}
