package service_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestPreviewClassLoansRejectsWithDomainErrors checks that every student
// the class-loan pairing leaves out carries a domain error (which the
// transport maps to a translatable code) rather than free English text.
func TestPreviewClassLoansRejectsWithDomainErrors(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)

	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenant := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ('class-loans-test','Test School','sma','UTC','id','active','default')`)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenant)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','Kelas X',1)`, tenant)
	class := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, tenant, year, grade)
	memberType := insertID(`insert into library_member_types (tenant_id,name) values ($1,'Siswa')`, tenant)
	title := insertID(`insert into library_titles (tenant_id,title) values ($1,'Buku Paket')`, tenant)
	for _, barcode := range []string{"BP-001", "BP-002"} {
		insertID(`insert into library_copies (tenant_id,title_id,barcode,status) values ($1,$2,$3,'available')`, tenant, title, barcode)
	}

	// The roster is ordered by name, so the names fix the pairing order.
	student := func(username, name, status string) uuid.UUID {
		id := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,$2,'x',$3,'active','id')`,
			tenant, username, name)
		_, err := pg.AdminPool.Exec(ctx, `insert into library_members (user_id,tenant_id,member_no,member_type_id,registered_on,status)
			values ($1,$2,$3,$4,current_date,$5)`, id, tenant, "M-"+username, memberType, status)
		require.NoError(t, err)
		_, err = pg.AdminPool.Exec(ctx, `insert into enrollments (tenant_id,academic_year_id,student_user_id,class_id,status,joined_on)
			values ($1,$2,$3,$4,'active',current_date)`, tenant, year, id, class)
		require.NoError(t, err)
		return id
	}
	andi := student("andi", "A Andi", "active")
	budi := student("budi", "B Budi", "suspended")
	citra := student("citra", "C Citra", "inactive")
	dewi := student("dewi", "D Dewi", "active")
	eka := student("eka", "E Eka", "active")

	librarian := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'pustakawan','x','Pustakawan','active','id')`, tenant)

	svc := service.New(pg.AppPool, repository.New(pg.AppPool), nil, nil, clock.Real{})

	rejectedErrs := func(p service.ClassLoanPreview) map[uuid.UUID]error {
		out := map[uuid.UUID]error{}
		for _, r := range p.Rejected {
			out[r.StudentUserID] = r.Err
		}
		return out
	}

	preview, err := svc.PreviewClassLoans(ctx, tenant, class, title)
	require.NoError(t, err)
	require.Len(t, preview.Pairs, 2)
	require.Equal(t, andi, preview.Pairs[0].StudentUserID)
	require.Equal(t, dewi, preview.Pairs[1].StudentUserID)
	rejected := rejectedErrs(preview)
	require.Len(t, rejected, 3)
	require.ErrorIs(t, rejected[budi], domain.ErrMemberSuspended)
	require.ErrorIs(t, rejected[citra], domain.ErrMemberNotActive)
	require.ErrorIs(t, rejected[eka], domain.ErrNoCopyForClassLoan)

	result, err := svc.CommitClassLoans(ctx, tenant, preview.Pairs[:1], librarian)
	require.NoError(t, err)
	require.Len(t, result.Loans, 1)
	require.Empty(t, result.Rejected)

	again, err := svc.PreviewClassLoans(ctx, tenant, class, title)
	require.NoError(t, err)
	require.ErrorIs(t, rejectedErrs(again)[andi], domain.ErrMemberHasTitle)

	// A reference title's copies stay in the library: the preview pairs
	// none of them, whatever their status.
	_, err = pg.AdminPool.Exec(ctx, `update library_copies set access = 'reference' where title_id = $1`, title)
	require.NoError(t, err)
	reference, err := svc.PreviewClassLoans(ctx, tenant, class, title)
	require.NoError(t, err)
	require.Empty(t, reference.Pairs)
	require.ErrorIs(t, rejectedErrs(reference)[dewi], domain.ErrNoCopyForClassLoan)
}
