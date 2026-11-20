package service_test

import (
	"io/fs"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/migrations"
)

func memberType(name string) domain.MemberType {
	return domain.MemberType{
		Name: name, MaxLoanItems: 3, MaxLoanDays: 7, RenewalDays: 7, MaxRenewals: 1,
		FineType: domain.FineConstant, FinePerTenor: 500, TenorDays: 1, ValidityMonths: 12,
	}
}

// Two member types could share a name, and every picker then offered two
// identical options that may carry different loan and fine rules.
func TestMemberTypeNamesAreUniquePerTenant(t *testing.T) {
	f := newImportFixture(t, "member-type-name-test")

	first, err := f.svc.CreateMemberType(f.ctx, f.tenant, memberType("Siswa Kelas XII"))
	require.NoError(t, err)

	_, err = f.svc.CreateMemberType(f.ctx, f.tenant, memberType("  siswa kelas xii "))
	require.ErrorIs(t, err, domain.ErrMemberTypeNameExists, "case and surrounding spaces do not make a new name")

	other, err := f.svc.CreateMemberType(f.ctx, f.tenant, memberType("Guru Tamu"))
	require.NoError(t, err)
	rename := other
	rename.Name = "Siswa Kelas XII"
	_, err = f.svc.UpdateMemberType(f.ctx, f.tenant, rename)
	require.ErrorIs(t, err, domain.ErrMemberTypeNameExists, "a rename onto a taken name")

	// Saving a type under its own name is not a clash, and names are stored trimmed.
	same := first
	same.Name = " Siswa Kelas XII "
	saved, err := f.svc.UpdateMemberType(f.ctx, f.tenant, same)
	require.NoError(t, err)
	require.Equal(t, "Siswa Kelas XII", saved.Name)

	// A name used only by a deleted type is free again.
	require.NoError(t, f.svc.DeleteMemberType(f.ctx, f.tenant, other.ID))
	_, err = f.svc.CreateMemberType(f.ctx, f.tenant, memberType("Guru Tamu"))
	require.NoError(t, err)

	// The default-role clash has its own error instead of a vague 400 (on
	// create) or a 500 (on update).
	withRole := memberType("Siswa Reguler")
	withRole.DefaultForRole = "student"
	_, err = f.svc.CreateMemberType(f.ctx, f.tenant, withRole)
	require.NoError(t, err)
	another := memberType("Siswa Khusus")
	another.DefaultForRole = "student"
	_, err = f.svc.CreateMemberType(f.ctx, f.tenant, another)
	require.ErrorIs(t, err, domain.ErrMemberTypeDefaultRoleTaken)
}

// The migration that adds the unique index first renames the duplicates a
// school already has, oldest keeping the plain name, so it can be applied.
func TestMemberTypeNameMigrationRenamesExistingDuplicates(t *testing.T) {
	f := newImportFixture(t, "member-type-name-migration-test")
	matches, err := fs.Glob(migrations.FS, "*_library_member_type_name_unique.up.sql")
	require.NoError(t, err)
	require.Len(t, matches, 1)
	up, err := fs.ReadFile(migrations.FS, matches[0])
	require.NoError(t, err)

	// The state before the migration: no index, three live "Siswa" types
	// and a deleted one.
	_, err = f.pg.AdminPool.Exec(f.ctx, `drop index ux_library_member_types_name`)
	require.NoError(t, err)
	for i, name := range []string{"Siswa", "siswa ", "SISWA"} {
		_, err = f.pg.AdminPool.Exec(f.ctx, `insert into library_member_types (tenant_id,name,created_at)
			values ($1,$2,now() + make_interval(secs => $3))`, f.tenant, name, i)
		require.NoError(t, err)
	}
	_, err = f.pg.AdminPool.Exec(f.ctx, `insert into library_member_types (tenant_id,name,deleted_at) values ($1,'Siswa',now())`, f.tenant)
	require.NoError(t, err)
	// A school that already worked around the clash by hand: the rename
	// must not take a name a live type uses, or the index cannot be built.
	for i, name := range []string{"Guru", "guru", "Guru (2)"} {
		_, err = f.pg.AdminPool.Exec(f.ctx, `insert into library_member_types (tenant_id,name,created_at)
			values ($1,$2,now() + make_interval(secs => $3))`, f.tenant, name, 10+i)
		require.NoError(t, err)
	}

	_, err = f.pg.AdminPool.Exec(f.ctx, string(up))
	require.NoError(t, err)

	rows, err := f.pg.AdminPool.Query(f.ctx, `select name from library_member_types
		where tenant_id = $1 and deleted_at is null order by created_at`, f.tenant)
	require.NoError(t, err)
	names, err := pgx.CollectRows(rows, pgx.RowTo[string])
	require.NoError(t, err)
	require.Equal(t, []string{"Siswa", "siswa (2)", "SISWA (3)", "Guru", "guru (3)", "Guru (2)"}, names)
}
