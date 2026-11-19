package library

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestLookupListsAnExactMemberCodeFirst proves the capped typeahead keeps
// the holder of a short, hand-set member number: the kiosk and the desk
// resolve a card from this response, and more than eight other members
// whose names merely contain the code (and sort earlier by name) must not
// push the holder out of it.
func TestLookupListsAnExactMemberCodeFirst(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedSimulatedLibraryWorld(t, ctx, pg.AdminPool, "lookup-"+uuid.NewString()[:8])

	addUser := func(username, name string) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx,
			`insert into users (tenant_id,username,password_hash,name,status,locale)
			 values ($1,$2,'x',$3,'active','id') returning id`,
			w.tenantID, username, name).Scan(&id))
		return id
	}
	for i := range 10 {
		addUser(fmt.Sprintf("crowd-%d", i), fmt.Sprintf("A Siswa 12%d", i))
	}
	holder := addUser("zaki", "Zaki Holder")
	var memberType uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select id from library_member_types where tenant_id = $1 limit 1`, w.tenantID).Scan(&memberType))
	_, err := pg.AdminPool.Exec(ctx,
		`insert into library_members (user_id, tenant_id, member_no, member_type_id, registered_on, status)
		 values ($1, $2, '12', $3, current_date, 'active')`, holder, w.tenantID, memberType)
	require.NoError(t, err)

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, nil)
	results, err := svc.Lookup(ctx, w.tenantID, "12")
	require.NoError(t, err)
	require.Len(t, results, 8, "the response stays capped")
	require.NotNil(t, results[0].Member)
	require.Equal(t, holder, results[0].Member.UserID)
	require.Equal(t, "12", results[0].Member.MemberNo)

	// The rest keep name order behind the exact match.
	require.NotNil(t, results[1].Member)
	require.Equal(t, "A Siswa 120", results[1].Member.UserName)
}

// TestLookupResolvesAOneCharacterMemberNumber proves a hand-set member
// number one character long still resolves its holder, while the other
// members whose names merely contain that character stay out: a single
// character matches exact codes only.
func TestLookupResolvesAOneCharacterMemberNumber(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedSimulatedLibraryWorld(t, ctx, pg.AdminPool, "lookup-short-"+uuid.NewString()[:8])

	addUser := func(username, name string) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx,
			`insert into users (tenant_id,username,password_hash,name,status,locale)
			 values ($1,$2,'x',$3,'active','id') returning id`,
			w.tenantID, username, name).Scan(&id))
		return id
	}
	addUser("crowd-7", "Siswa 7")
	holder := addUser("yuni", "Yuni Holder")
	var memberType uuid.UUID
	require.NoError(t, pg.AdminPool.QueryRow(ctx,
		`select id from library_member_types where tenant_id = $1 limit 1`, w.tenantID).Scan(&memberType))
	_, err := pg.AdminPool.Exec(ctx,
		`insert into library_members (user_id, tenant_id, member_no, member_type_id, registered_on, status)
		 values ($1, $2, '7', $3, current_date, 'active')`, holder, w.tenantID, memberType)
	require.NoError(t, err)

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, nil)
	results, err := svc.Lookup(ctx, w.tenantID, "7")
	require.NoError(t, err)
	require.Len(t, results, 1, "a one-character query matches exact codes only")
	require.NotNil(t, results[0].Member)
	require.Equal(t, holder, results[0].Member.UserID)

	results, err = svc.Lookup(ctx, w.tenantID, "")
	require.NoError(t, err)
	require.Empty(t, results)
}
