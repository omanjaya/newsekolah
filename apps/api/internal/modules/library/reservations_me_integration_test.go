package library

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestMyProfileReservationsCarryTitle proves GET /v1/library/me's
// reservations come back with the title's name/author already joined in,
// the same way ListLoansForMemberWithTitle already does for loans --
// apps/web/features/library/components/my-library-reservations.tsx used to
// call GET /v1/library/titles/{id} (LibraryTitleName) to resolve a
// reservation's title, which 403s for a plain member: they hold
// view_own_library_loans, not view_library. MyProfile must give the title
// directly instead.
func TestMyProfileReservationsCarryTitle(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenant := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ('library-reservation-title-test','Test','sma','UTC','id','active','default')`)
	title := insertID(`insert into library_titles (tenant_id, title, author) values ($1, 'Laskar Pelangi', 'Andrea Hirata')`, tenant)
	// No copy is seeded for this title, so CountAvailableCopies is 0 and
	// Reserve succeeds instead of refusing with ErrCopyAvailableForLoan.
	memberType := insertID(`insert into library_member_types
		(tenant_id, name, max_loan_items, max_loan_days, renewal_days, max_renewals, fine_type, fine_per_tenor, tenor_days, suspend_days, validity_months)
		values ($1, 'Siswa', 5, 7, 7, 1, 'per_tenor', 1000, 1, 0, 12)`, tenant)
	member := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'member-reservation-title','x','Member','active','id')`, tenant)
	_, err := pool.Exec(ctx, `insert into library_members (user_id, tenant_id, member_no, member_type_id, registered_on, status)
		values ($1, $2, 'M-RES-TITLE', $3, current_date, 'active')`, member, tenant, memberType)
	require.NoError(t, err)

	repo := repository.New(pg.AppPool)
	svc := service.New(pg.AppPool, repo, nil, nil, nil)

	_, err = svc.ReserveForSelf(ctx, tenant, title, member)
	require.NoError(t, err)

	profile, err := svc.MyProfile(ctx, tenant, member)
	require.NoError(t, err)
	require.Len(t, profile.Reservations, 1)
	require.Equal(t, "Laskar Pelangi", profile.Reservations[0].TitleName)
	require.Equal(t, "Andrea Hirata", profile.Reservations[0].TitleAuthor)
}
