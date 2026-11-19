package service_test

import (
	"context"
	"fmt"
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

// TestBulkRegisterSurvivesMemberNoCollisions checks that a member_no unique
// violation during bulk registration is retried or reported per candidate
// instead of aborting the transaction: the request succeeds, the members
// that found a free number are registered, and the one that ran out of
// retries is listed with its domain error.
func TestBulkRegisterSurvivesMemberNoCollisions(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)
	at := time.Date(2026, 8, 1, 9, 0, 0, 0, time.UTC)

	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenant := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ('bulk-register-test','Test School','sma','UTC','id','active','default')`)
	memberType := insertID(`insert into library_member_types (tenant_id,name) values ($1,'Guru')`, tenant)

	user := func(username, name, kind string) uuid.UUID {
		id := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,$2,'x',$3,'active','id')`,
			tenant, username, name)
		_, err := pg.AdminPool.Exec(ctx, `insert into user_profiles (user_id,tenant_id,kind) values ($1,$2,$3)`, id, tenant, kind)
		require.NoError(t, err)
		return id
	}
	// existingMember registers a staff user (never a teacher candidate)
	// directly with the given sequence, taking that member number.
	existingMember := func(seq int) {
		id := user(fmt.Sprintf("staff%d", seq), fmt.Sprintf("Staff %d", seq), "staff")
		_, err := pg.AdminPool.Exec(ctx, `insert into library_members (user_id,tenant_id,member_no,member_type_id,registered_on,status)
			values ($1,$2,$3,$4,current_date,'active')`, id, tenant, domain.GenerateMemberNo(domain.DefaultPolicy().MemberNoFormat, at.Year(), seq), memberType)
		require.NoError(t, err)
	}

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, clock.Frozen{At: at})

	// Four members hold numbers 5..8, so the generator (starting at the
	// member count plus one) collides four times for each new teacher.
	for seq := 5; seq <= 8; seq++ {
		existingMember(seq)
	}
	andi := user("andi", "A Andi", "teacher")
	budi := user("budi", "B Budi", "teacher")

	result, err := svc.BulkRegisterByRole(ctx, tenant, memberType, "teacher", uuid.NullUUID{})
	require.NoError(t, err)
	require.Empty(t, result.Failed)
	require.Len(t, result.Registered, 2)
	require.Equal(t, andi, result.Registered[0].UserID)
	require.Equal(t, budi, result.Registered[1].UserID)

	// Six members now hold 5..10. Five more staff members holding 12..16
	// make the count 11, so every number the next teacher tries (12..16) is
	// taken: that teacher exhausts the retry budget while the request
	// itself still succeeds.
	for seq := 12; seq <= 16; seq++ {
		existingMember(seq)
	}
	citra := user("citra", "C Citra", "teacher")

	result, err = svc.BulkRegisterByRole(ctx, tenant, memberType, "teacher", uuid.NullUUID{})
	require.NoError(t, err)
	require.Empty(t, result.Registered)
	require.Len(t, result.Failed, 1)
	require.Equal(t, citra, result.Failed[0].UserID)
	require.Equal(t, "C Citra", result.Failed[0].UserName)
	require.ErrorIs(t, result.Failed[0].Err, domain.ErrMemberNoExhausted)
}
