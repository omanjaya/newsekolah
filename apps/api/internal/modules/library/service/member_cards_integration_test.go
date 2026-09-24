package service_test

import (
	"bytes"
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

// TestPrintMemberCards exercises the bulk card-print endpoint's three
// selection modes (explicit ids, member type, class), its cap, and its
// invalid-selection errors, against a real Postgres running under RLS
// (dbtest.AppPool, never AdminPool -- see that package's doc comment).
func TestPrintMemberCards(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)

	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}

	tenant := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ('member-cards-test','Test School','sma','UTC','id','active','default')`)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenant)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','Kelas X',1)`, tenant)
	classA := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, tenant, year, grade)
	classB := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-B')`, tenant, year, grade)

	studentType := insertID(`insert into library_member_types (tenant_id,name) values ($1,'Siswa')`, tenant)
	teacherType := insertID(`insert into library_member_types (tenant_id,name) values ($1,'Guru')`, tenant)

	newUser := func(username, name string) uuid.UUID {
		return insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,$2,'x',$3,'active','id')`,
			tenant, username, name)
	}
	newMember := func(userID, memberTypeID uuid.UUID, memberNo string) {
		_, err := pg.AdminPool.Exec(ctx, `insert into library_members (user_id,tenant_id,member_no,member_type_id,registered_on,status)
			values ($1,$2,$3,$4,current_date,'active')`, userID, tenant, memberNo, memberTypeID)
		require.NoError(t, err)
	}
	enroll := func(studentID, classID uuid.UUID) {
		_, err := pg.AdminPool.Exec(ctx, `insert into enrollments (tenant_id,academic_year_id,student_user_id,class_id,status,joined_on)
			values ($1,$2,$3,$4,'active',current_date)`, tenant, year, studentID, classID)
		require.NoError(t, err)
	}

	studentA1 := newUser("student-a1", "Siswa A1")
	studentA2 := newUser("student-a2", "Siswa A2")
	studentB1 := newUser("student-b1", "Siswa B1")
	teacher1 := newUser("teacher-1", "Guru Satu")

	newMember(studentA1, studentType, "S-0001")
	newMember(studentA2, studentType, "S-0002")
	newMember(studentB1, studentType, "S-0003")
	newMember(teacher1, teacherType, "G-0001")

	enroll(studentA1, classA)
	enroll(studentA2, classA)
	enroll(studentB1, classB)

	repo := repository.New(pg.AppPool)
	svc := service.New(pg.AppPool, repo, nil, nil, clock.Real{})

	requirePDF := func(t *testing.T, pdf []byte) {
		t.Helper()
		require.NotEmpty(t, pdf)
		require.True(t, bytes.HasPrefix(pdf, []byte("%PDF")), "output must be a PDF")
	}

	t.Run("explicit member ids, in the given order", func(t *testing.T) {
		pdf, err := svc.PrintMemberCards(ctx, tenant, service.MemberCardFilter{
			MemberIDs: []uuid.UUID{studentB1, studentA1},
		})
		require.NoError(t, err)
		requirePDF(t, pdf)
	})

	t.Run("member type filter", func(t *testing.T) {
		pdf, err := svc.PrintMemberCards(ctx, tenant, service.MemberCardFilter{
			MemberTypeID: uuid.NullUUID{UUID: studentType, Valid: true},
		})
		require.NoError(t, err)
		requirePDF(t, pdf)

		teacherOnly, err := svc.PrintMemberCards(ctx, tenant, service.MemberCardFilter{
			MemberTypeID: uuid.NullUUID{UUID: teacherType, Valid: true},
		})
		require.NoError(t, err)
		// One member type has 3 members, the other has 1: the smaller
		// PDF must be strictly smaller (fewer barcode images and cards
		// drawn), a cheap proxy for "the filter actually narrowed rows"
		// without parsing the PDF's internal page objects.
		require.Less(t, len(teacherOnly), len(pdf))
	})

	t.Run("class filter (active enrollment only)", func(t *testing.T) {
		pdf, err := svc.PrintMemberCards(ctx, tenant, service.MemberCardFilter{
			ClassID: uuid.NullUUID{UUID: classA, Valid: true},
		})
		require.NoError(t, err)
		requirePDF(t, pdf)

		classBOnly, err := svc.PrintMemberCards(ctx, tenant, service.MemberCardFilter{
			ClassID: uuid.NullUUID{UUID: classB, Valid: true},
		})
		require.NoError(t, err)
		require.Less(t, len(classBOnly), len(pdf), "class A has two members, class B has one")
	})

	t.Run("member type and class combine", func(t *testing.T) {
		pdf, err := svc.PrintMemberCards(ctx, tenant, service.MemberCardFilter{
			MemberTypeID: uuid.NullUUID{UUID: studentType, Valid: true},
			ClassID:      uuid.NullUUID{UUID: classA, Valid: true},
		})
		require.NoError(t, err)
		requirePDF(t, pdf)
	})

	t.Run("no selection is rejected", func(t *testing.T) {
		_, err := svc.PrintMemberCards(ctx, tenant, service.MemberCardFilter{})
		require.ErrorIs(t, err, domain.ErrInvalidInput)
	})

	t.Run("ids mixed with a filter is rejected", func(t *testing.T) {
		_, err := svc.PrintMemberCards(ctx, tenant, service.MemberCardFilter{
			MemberIDs:    []uuid.UUID{studentA1},
			MemberTypeID: uuid.NullUUID{UUID: studentType, Valid: true},
		})
		require.ErrorIs(t, err, domain.ErrInvalidInput)
	})

	t.Run("too many explicit ids is rejected", func(t *testing.T) {
		ids := make([]uuid.UUID, domain.CardMaxPerPrint+1)
		for i := range ids {
			ids[i] = uuid.New()
		}
		_, err := svc.PrintMemberCards(ctx, tenant, service.MemberCardFilter{MemberIDs: ids})
		require.ErrorIs(t, err, domain.ErrInvalidInput)
	})

	t.Run("a filter matching nobody is not found", func(t *testing.T) {
		_, err := svc.PrintMemberCards(ctx, tenant, service.MemberCardFilter{
			MemberTypeID: uuid.NullUUID{UUID: uuid.New(), Valid: true},
		})
		require.ErrorIs(t, err, domain.ErrMemberNotFound)
	})

	t.Run("paginates past one page of ten", func(t *testing.T) {
		// CardsPerPage is 10 (2x5 A4 grid); printing 11 members must
		// still succeed and produce a real, larger PDF (a second page).
		ids := make([]uuid.UUID, 0, domain.CardsPerPage+1)
		for i := 0; i < domain.CardsPerPage+1; i++ {
			u := newUser(fmt.Sprintf("bulk-%d", i), fmt.Sprintf("Bulk %d", i))
			newMember(u, studentType, fmt.Sprintf("S-BULK-%03d", i))
			ids = append(ids, u)
		}
		pdf, err := svc.PrintMemberCards(ctx, tenant, service.MemberCardFilter{MemberIDs: ids})
		require.NoError(t, err)
		requirePDF(t, pdf)

		onePage, err := svc.PrintMemberCards(ctx, tenant, service.MemberCardFilter{MemberIDs: ids[:domain.CardsPerPage]})
		require.NoError(t, err)
		require.Less(t, len(onePage), len(pdf), "an 11th card on a second page must add real content")
	})
}

// TestPrintMemberCardRendersBarcode is the single-card counterpart: it
// renders a real Code 128 barcode image of the member number, not the
// bare text the card used to fall back to before this change (parity
// item: reuse the same barcode code path copy labels use).
func TestPrintMemberCardRendersBarcode(t *testing.T) {
	ctx := context.Background()
	pg := dbtest.Start(t)

	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pg.AdminPool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}
	tenant := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan)
		values ('member-card-single-test','Test School','sma','UTC','id','active','default')`)
	memberType := insertID(`insert into library_member_types (tenant_id,name) values ($1,'Siswa')`, tenant)
	student := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'card-student','x','Siswa Kartu','active','id')`, tenant)
	_, err := pg.AdminPool.Exec(ctx, `insert into library_members (user_id,tenant_id,member_no,member_type_id,registered_on,valid_until,status)
		values ($1,$2,'S-9999',$3,current_date,current_date + interval '1 year','active')`, student, tenant, memberType)
	require.NoError(t, err)

	repo := repository.New(pg.AppPool)
	svc := service.New(pg.AppPool, repo, nil, nil, clock.Real{})

	withBarcode, err := svc.PrintMemberCard(ctx, tenant, student)
	require.NoError(t, err)
	require.True(t, bytes.HasPrefix(withBarcode, []byte("%PDF")))
	// fpdf emits a real image XObject ("/Subtype /Image") for a
	// registered image -- the old member card, which only ever rendered
	// the member_no as plain text (platform/documents strips <img> tags
	// down to nothing), never produced one. Its presence is a reliable
	// signal the Code 128 PNG was actually registered and drawn, and it
	// is specific to images (unlike a compression filter, which a
	// plain-text page can carry too).
	require.Contains(t, string(withBarcode), "/Subtype /Image", "expected an embedded barcode image XObject")

	// A user who is not yet a registered library_members row still gets
	// a printable card (old app behavior, preserved by memberCardInfoFor's
	// fallback path).
	unregistered, err := svc.PrintMemberCard(ctx, tenant, uuid.New())
	require.NoError(t, err)
	require.True(t, bytes.HasPrefix(unregistered, []byte("%PDF")))
}
