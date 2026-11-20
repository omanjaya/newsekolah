package scheduling_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
)

type journalFixture struct {
	svc                          *service.Service
	tenant, year, class, subject uuid.UUID
	teacher, otherTeacher        uuid.UUID
}

func seedJournalFixture(t *testing.T, ctx context.Context) journalFixture {
	t.Helper()
	pg := dbtest.Start(t)
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}
	f := journalFixture{svc: service.New(pg.AppPool, repository.New(pg.AppPool))}
	f.tenant = insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ('journal-test','Test','sma','UTC','id','active','default')`)
	f.year = insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, f.tenant)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, f.tenant)
	f.class = insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, f.tenant, f.year, grade)
	f.subject = insertID(`insert into subjects (tenant_id,code,name) values ($1,'MTK','Math')`, f.tenant)
	f.teacher = insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'teacher','x','Teacher','active','id')`, f.tenant)
	f.otherTeacher = insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'other','x','Other','active','id')`, f.tenant)
	for _, teacher := range []uuid.UUID{f.teacher, f.otherTeacher} {
		_, err := pool.Exec(ctx, `insert into teaching_assignments (tenant_id,academic_year_id,teacher_user_id,subject_id,class_id) values ($1,$2,$3,$4,$5)`,
			f.tenant, f.year, teacher, f.subject, f.class)
		require.NoError(t, err)
	}
	return f
}

func (f journalFixture) input(topic, activities, reflection string) service.JournalInput {
	return service.JournalInput{
		AcademicYearID: f.year, ClassID: f.class, SubjectID: f.subject,
		LessonDate: time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC),
		Topic:      topic, Activities: activities, Reflection: reflection,
	}
}

// TestSaveJournalNeverReplacesAnotherJournal: a second "new journal" for a
// lesson that already has one is refused instead of silently replacing
// its topic, activities and reflection; editing goes by id.
func TestSaveJournalNeverReplacesAnotherJournal(t *testing.T) {
	ctx := context.Background()
	f := seedJournalFixture(t, ctx)

	first, err := f.svc.SaveJournal(ctx, f.tenant, f.teacher, f.teacher, f.input("Fungsi kuadrat", "Menggambar grafik", "Titik puncak membingungkan"))
	require.NoError(t, err)

	_, err = f.svc.SaveJournal(ctx, f.tenant, f.teacher, f.teacher, f.input("Duplikat hari ini", "Uji duplikat", ""))
	require.ErrorIs(t, err, domain.ErrJournalDuplicate)

	stored, err := f.svc.GetJournal(ctx, f.tenant, first.ID, f.teacher, false)
	require.NoError(t, err)
	require.Equal(t, "Fungsi kuadrat", stored.Topic)
	require.Equal(t, "Titik puncak membingungkan", stored.Reflection)

	// The same text again (a repeated submit) is the same journal.
	again, err := f.svc.SaveJournal(ctx, f.tenant, f.teacher, f.teacher, f.input("Fungsi kuadrat", "Menggambar grafik", "Titik puncak membingungkan"))
	require.NoError(t, err)
	require.Equal(t, first.ID, again.ID)

	// Editing names the journal.
	edit := f.input("Fungsi kuadrat (revisi)", "Menggambar grafik", "")
	edit.ID = uuid.NullUUID{UUID: first.ID, Valid: true}
	edited, err := f.svc.SaveJournal(ctx, f.tenant, f.teacher, f.teacher, edit)
	require.NoError(t, err)
	require.Equal(t, first.ID, edited.ID)
	require.Equal(t, "Fungsi kuadrat (revisi)", edited.Topic)

	// Another teacher cannot edit it by id.
	_, err = f.svc.SaveJournal(ctx, f.tenant, f.otherTeacher, f.otherTeacher, edit)
	require.ErrorIs(t, err, domain.ErrJournalNotOwner)
}

// TestJournalWritesSurviveADoubleSubmit: two identical saves racing each
// other (a double click) both succeed with one journal, rather than the
// loser hitting the unique key as a server error; the attendance editor's
// upsert is atomic the same way.
func TestJournalWritesSurviveADoubleSubmit(t *testing.T) {
	ctx := context.Background()
	f := seedJournalFixture(t, ctx)

	for _, write := range []func(service.JournalInput) (domain.Journal, error){
		func(in service.JournalInput) (domain.Journal, error) {
			return f.svc.SaveJournal(ctx, f.tenant, f.teacher, f.teacher, in)
		},
		func(in service.JournalInput) (domain.Journal, error) {
			in.LessonDate = in.LessonDate.AddDate(0, 0, 1)
			return f.svc.UpsertJournal(ctx, f.tenant, f.teacher, f.teacher, in)
		},
	} {
		in := f.input("Persamaan linear", "Latihan", "")
		var wg sync.WaitGroup
		ids := make([]uuid.UUID, 8)
		errs := make([]error, 8)
		for i := range ids {
			wg.Add(1)
			go func() {
				defer wg.Done()
				j, err := write(in)
				ids[i], errs[i] = j.ID, err
			}()
		}
		wg.Wait()
		for i := range ids {
			require.NoError(t, errs[i])
			require.Equal(t, ids[0], ids[i], "every save lands on the one journal")
		}
	}
}
