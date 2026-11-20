package service_test

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

// TestRegisterMemberReportsTheRealConflict checks that the two unique
// constraints on library_members surface as their own domain errors: a
// user who is already a member is ErrMemberAlreadyExists on both the
// generated-number and the manual-number path (not "could not generate a
// unique number" or a 500), and a manual number that another member holds
// is ErrMemberNoCollision.
func TestRegisterMemberReportsTheRealConflict(t *testing.T) {
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
		values ('register-member-test','Test School','sma','UTC','id','active','default')`)
	memberType := insertID(`insert into library_member_types (tenant_id,name) values ($1,'Guru')`, tenant)
	user := func(username string) uuid.UUID {
		return insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,$2,'x',$2,'active','id')`,
			tenant, username)
	}

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, clock.Frozen{At: at})

	guru := user("guru")
	_, err := svc.RegisterMember(ctx, tenant, service.RegisterMemberInput{UserID: guru, MemberTypeID: memberType, MemberNo: "LIB-01"})
	require.NoError(t, err)

	_, err = svc.RegisterMember(ctx, tenant, service.RegisterMemberInput{UserID: guru, MemberTypeID: memberType})
	require.ErrorIs(t, err, domain.ErrMemberAlreadyExists, "generated number, user already a member")

	_, err = svc.RegisterMember(ctx, tenant, service.RegisterMemberInput{UserID: guru, MemberTypeID: memberType, MemberNo: "LIB-02"})
	require.ErrorIs(t, err, domain.ErrMemberAlreadyExists, "manual number, user already a member")

	other := user("other")
	_, err = svc.RegisterMember(ctx, tenant, service.RegisterMemberInput{UserID: other, MemberTypeID: memberType, MemberNo: "LIB-01"})
	require.ErrorIs(t, err, domain.ErrMemberNoCollision, "manual number held by another member")

	member, err := svc.RegisterMember(ctx, tenant, service.RegisterMemberInput{UserID: other, MemberTypeID: memberType})
	require.NoError(t, err, "a generated number still works after the failed attempts")
	require.Equal(t, other, member.UserID)
}
