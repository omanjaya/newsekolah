package scheduling_test

import (
	"archive/zip"
	"bytes"
	"context"
	"io"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/xuri/excelize/v2"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	schedulehttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/authz"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
	tenantctx "github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// Exercise the actual transactions and database guards. No application data is
// touched: the test owns a disposable PostgreSQL instance.
func TestScheduleBlockMutationsPreserveHistory(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test requires Docker")
	}
	ctx := context.Background()
	pg := dbtest.Start(t)
	dsn, pool := pg.DSN, pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}
	tenant := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ('schedule-test','Test','sma','UTC','id','active','default')`)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenant)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenant)
	class := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, tenant, year, grade)
	subject := insertID(`insert into subjects (tenant_id,code,name) values ($1,'MTK','Math')`, tenant)
	teacher := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'teacher','x','Teacher','active','id')`, tenant)
	substitute := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'substitute','x','Substitute','active','id')`, tenant)
	template := insertID(`insert into period_templates (tenant_id,name) values ($1,'Default')`, tenant)
	p1 := insertID(`insert into periods (tenant_id,template_id,name,sequence,starts_at,ends_at) values ($1,$2,'P1',1,'08:00','09:00')`, tenant, template)
	p2 := insertID(`insert into periods (tenant_id,template_id,name,sequence,starts_at,ends_at) values ($1,$2,'P2',2,'09:00','10:00')`, tenant, template)
	exec(`insert into teaching_assignments (tenant_id,academic_year_id,teacher_user_id,subject_id,class_id) values ($1,$2,$3,$4,$5)`, tenant, year, teacher, subject, class)
	for day := 1; day <= 5; day++ {
		exec(`insert into school_days (tenant_id,academic_year_id,day_of_week) values ($1,$2,$3)`, tenant, year, day)
		exec(`insert into period_day_assignments (tenant_id,academic_year_id,day_of_week,template_id) values ($1,$2,$3,$4)`, tenant, year, day, template)
	}
	svc := service.New(pg.AppPool, repository.New(pg.AppPool))
	actor := service.Actor{CanManage: true, UserID: teacher}
	input := service.ScheduleInput{AcademicYearID: year, ClassID: class, SubjectID: subject, TeacherUserID: teacher, DayOfWeek: 1, StartPeriodID: p1, EndPeriodID: p1, Source: domain.SourceAdmin}
	createPair := func(day int16) (domain.Schedule, domain.Schedule) {
		t.Helper()
		in := input
		in.DayOfWeek = day
		a, err := svc.CreateSchedule(ctx, tenant, in, actor)
		require.NoError(t, err)
		in.StartPeriodID = p2
		in.EndPeriodID = p2
		b, err := svc.CreateSchedule(ctx, tenant, in, actor)
		require.NoError(t, err)
		return a, b
	}
	count := func(table string) int {
		t.Helper()
		var n int
		require.NoError(t, pool.QueryRow(ctx, "select count(*) from "+table+" where tenant_id=$1", tenant).Scan(&n))
		return n
	}
	a, b := createPair(1)
	merged := input
	merged.EndPeriodID = p2
	updated, err := svc.UpdateScheduleBlock(ctx, tenant, a.ID, []uuid.UUID{a.ID, b.ID}, merged, actor)
	require.NoError(t, err)
	require.Equal(t, a.ID, updated.ID)
	require.Equal(t, int16(2), updated.EndSeq)
	require.Equal(t, 1, count("schedules"))
	// A validation failure after sibling deletion must roll the entire edit back.
	c, d := createPair(2)
	invalid := merged
	invalid.DayOfWeek = 2
	invalid.SubjectID = uuid.New()
	_, err = svc.UpdateScheduleBlock(ctx, tenant, c.ID, []uuid.UUID{c.ID, d.ID}, invalid, actor)
	require.Error(t, err)
	require.Equal(t, 3, count("schedules"))
	// A conflict after sibling deletion also leaves both originals intact.
	conflict := merged
	_, err = svc.UpdateScheduleBlock(ctx, tenant, c.ID, []uuid.UUID{c.ID, d.ID}, conflict, actor)
	require.ErrorIs(t, err, domain.ErrConflictClass)
	require.Equal(t, 3, count("schedules"))
	// Users cannot mutate another teacher's block or pass arbitrary row groups.
	require.ErrorIs(t, svc.DeleteScheduleBlock(ctx, tenant, c.ID, []uuid.UUID{c.ID, d.ID}, service.Actor{UserID: substitute}), domain.ErrTeacherEditForbidden)
	require.ErrorIs(t, svc.DeleteScheduleBlock(ctx, tenant, c.ID, []uuid.UUID{a.ID, c.ID}, actor), domain.ErrInvalidScheduleBlock)
	require.Equal(t, 3, count("schedules"))
	// An attendance session on the second row must protect both rows of a delete.
	exec(`insert into attendance_sessions (tenant_id,academic_year_id,schedule_id,date,class_id,subject_id,teacher_user_id,start_period_id,end_period_id) values ($1,$2,$3,'2026-09-15',$4,$5,$6,$7,$7)`, tenant, year, d.ID, class, subject, teacher, p2)
	require.ErrorIs(t, svc.DeleteScheduleBlock(ctx, tenant, c.ID, []uuid.UUID{c.ID, d.ID}, actor), domain.ErrScheduleHasHistory)
	require.Equal(t, 3, count("schedules"))
	require.Equal(t, 1, count("attendance_sessions"))
	changed := input
	changed.DayOfWeek = 3
	changed.StartPeriodID = p2
	changed.EndPeriodID = p2
	_, err = svc.UpdateSchedule(ctx, tenant, d.ID, changed, actor)
	require.ErrorIs(t, err, domain.ErrScheduleHasHistory)
	// A primary row with history fails its update after the sibling was removed;
	// rollback must restore that sibling as well.
	changed = merged
	changed.DayOfWeek = 3
	_, err = svc.UpdateScheduleBlock(ctx, tenant, d.ID, []uuid.UUID{d.ID, c.ID}, changed, actor)
	require.ErrorIs(t, err, domain.ErrScheduleHasHistory)
	require.Equal(t, 3, count("schedules"))
	require.ErrorIs(t, svc.ClearAcademicYear(ctx, tenant, year), domain.ErrScheduleHasHistory)
	require.Equal(t, 3, count("schedules"))
	require.Equal(t, 1, count("attendance_sessions"))
	// Even cancelled substitutions remain historical records.
	e, f := createPair(4)
	exec(`insert into substitution_requests (tenant_id,academic_year_id,schedule_id,date,requester_user_id,substitute_user_id,status) values ($1,$2,$3,'2026-09-17',$4,$5,'cancelled')`, tenant, year, f.ID, teacher, substitute)
	changed = merged
	changed.DayOfWeek = 4
	_, err = svc.UpdateScheduleBlock(ctx, tenant, e.ID, []uuid.UUID{e.ID, f.ID}, changed, actor)
	require.ErrorIs(t, err, domain.ErrScheduleHasHistory)
	require.Equal(t, 5, count("schedules"))
	require.Equal(t, 1, count("substitution_requests"))
	g, h := createPair(5)
	require.NoError(t, svc.DeleteScheduleBlock(ctx, tenant, g.ID, []uuid.UUID{g.ID, h.ID}, actor))
	require.Equal(t, 5, count("schedules"))
	t.Run("journal DOCX export applies tenant RLS and caller scope", func(t *testing.T) {
		exec(`insert into class_journals (tenant_id,academic_year_id,teacher_user_id,written_by_user_id,class_id,subject_id,lesson_date,topic,activities) values ($1,$2,$3,$3,$4,$5,'2026-09-14','Teacher topic','Discussion'), ($1,$2,$6,$6,$4,$5,'2026-09-15','Other teacher topic','Practice')`, tenant, year, teacher, class, subject, substitute)
		// A dedicated SELECT-only role proves lookups run inside the tenant tx.
		exec(`create role journal_reader login password 'test' nosuperuser nobypassrls`)
		exec(`grant usage on schema public to journal_reader`)
		exec(`grant select on all tables in schema public to journal_reader`)
		parsed, err := url.Parse(dsn)
		require.NoError(t, err)
		parsed.User = url.UserPassword("journal_reader", "test")
		readerPool, err := database.NewPool(ctx, parsed.String())
		require.NoError(t, err)
		defer readerPool.Close()
		readerSvc := service.New(readerPool, repository.New(readerPool))
		handler := schedulehttp.New(readerSvc, journalExportPermissions{}, nil)
		actorCtx := httpx.WithUserID(tenantctx.WithTenant(ctx, tenantctx.Tenant{ID: tenant}), teacher)
		request := api.ExportJournalsRequestObject{Params: api.ExportJournalsParams{AcademicYearId: year, Format: api.ExportJournalsParamsFormatDocx}}
		response, err := handler.ExportJournals(actorCtx, request)
		require.NoError(t, err)
		recorder := httptest.NewRecorder()
		require.NoError(t, response.VisitExportJournalsResponse(recorder))
		require.Equal(t, 200, recorder.Code)
		require.Equal(t, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", recorder.Header().Get("Content-Type"))
		doc := journalDocumentXML(t, recorder.Body.Bytes())
		require.Contains(t, doc, "Teacher topic")
		require.NotContains(t, doc, "Other teacher topic")
		for _, name := range []string{"X-A", "Math", "Teacher"} {
			require.Contains(t, doc, name)
		}
		for _, id := range []uuid.UUID{class, subject, teacher} {
			require.NotContains(t, doc, id.String())
		}
		request.Params.ClassId = &class
		_, err = handler.ExportJournals(actorCtx, request)
		require.ErrorIs(t, err, httpx.ErrForbidden)
		handler = schedulehttp.New(readerSvc, journalExportPermissions{all: true}, nil)
		response, err = handler.ExportJournals(actorCtx, request)
		require.NoError(t, err)
		recorder = httptest.NewRecorder()
		require.NoError(t, response.VisitExportJournalsResponse(recorder))
		doc = journalDocumentXML(t, recorder.Body.Bytes())
		require.Contains(t, doc, "Teacher topic")
		require.Contains(t, doc, "Other teacher topic")
		// Foreign tenant context cannot export this tenant's academic year.
		payload, err := readerSvc.ExportJournalsDOCX(ctx, uuid.New(), year, service.JournalFilter{})
		require.NoError(t, err)
		require.NotContains(t, journalDocumentXML(t, payload), "Teacher topic")
	})

	t.Run("journal XLSX/PDF export renders through reportdoc, with an Indonesian scope line and a caller-chosen column subset", func(t *testing.T) {
		exec(`insert into class_journals (tenant_id,academic_year_id,teacher_user_id,written_by_user_id,class_id,subject_id,lesson_date,topic,activities) values ($1,$2,$3,$3,$4,$5,'2026-09-16','XLSX topic','Discussion')`, tenant, year, teacher, class, subject)
		readerSvc := service.New(pool, repository.New(pool))
		handler := schedulehttp.New(readerSvc, journalExportPermissions{}, nil)
		actorCtx := httpx.WithUserID(tenantctx.WithTenant(ctx, tenantctx.Tenant{ID: tenant}), teacher)

		xlsxRequest := api.ExportJournalsRequestObject{Params: api.ExportJournalsParams{AcademicYearId: year, Format: api.ExportJournalsParamsFormatXlsx}}
		response, err := handler.ExportJournals(actorCtx, xlsxRequest)
		require.NoError(t, err)
		recorder := httptest.NewRecorder()
		require.NoError(t, response.VisitExportJournalsResponse(recorder))
		require.Equal(t, 200, recorder.Code)
		require.Equal(t, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", recorder.Header().Get("Content-Type"))
		f, err := excelize.OpenReader(bytes.NewReader(recorder.Body.Bytes()))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		sheet := f.GetSheetList()[0]
		rows, err := f.GetRows(sheet)
		require.NoError(t, err)
		var flat []string
		for _, row := range rows {
			flat = append(flat, row...)
		}
		joined := strings.Join(flat, " | ")
		require.Contains(t, joined, "XLSX topic")
		require.Contains(t, joined, "Jurnal Mengajar", "the report's own default Indonesian title must render")
		require.Contains(t, joined, "16/09/2026", "reportdoc's own ColumnDate formatting for the date column")

		pdfRequest := api.ExportJournalsRequestObject{Params: api.ExportJournalsParams{AcademicYearId: year, Format: api.ExportJournalsParamsFormatPdf}}
		response, err = handler.ExportJournals(actorCtx, pdfRequest)
		require.NoError(t, err)
		recorder = httptest.NewRecorder()
		require.NoError(t, response.VisitExportJournalsResponse(recorder))
		require.Equal(t, "application/pdf", recorder.Header().Get("Content-Type"))
		require.True(t, bytes.HasPrefix(recorder.Body.Bytes(), []byte("%PDF")))

		narrowTitle, narrowLetterhead := "Jurnal Kelas X-A", false
		narrowColumns := "topic:Topik,class"
		narrowRequest := api.ExportJournalsRequestObject{Params: api.ExportJournalsParams{
			AcademicYearId: year, Format: api.ExportJournalsParamsFormatXlsx,
			Title: &narrowTitle, Letterhead: &narrowLetterhead, Columns: &narrowColumns,
		}}
		response, err = handler.ExportJournals(actorCtx, narrowRequest)
		require.NoError(t, err)
		recorder = httptest.NewRecorder()
		require.NoError(t, response.VisitExportJournalsResponse(recorder))
		nf, err := excelize.OpenReader(bytes.NewReader(recorder.Body.Bytes()))
		require.NoError(t, err)
		defer nf.Close() //nolint:errcheck
		nrows, err := nf.GetRows(nf.GetSheetList()[0])
		require.NoError(t, err)
		require.Contains(t, nrows, []string{"Topik", "Kelas"}, "the chosen column subset/relabel/order must be honoured")

		badColumns := "does_not_exist"
		badRequest := api.ExportJournalsRequestObject{Params: api.ExportJournalsParams{AcademicYearId: year, Format: api.ExportJournalsParamsFormatXlsx, Columns: &badColumns}}
		_, err = handler.ExportJournals(actorCtx, badRequest)
		require.Error(t, err)
	})

	t.Run("journal export scoped to one class gets a two-signer signature block: homeroom teacher left, tenant default right", func(t *testing.T) {
		exec(`update classes set homeroom_teacher_id = $1 where tenant_id = $2 and id = $3`, substitute, tenant, class)
		readerSvc := service.New(pool, repository.New(pool))
		readerSvc.SetLetterheadSource(fakeJournalLetterheadSource{
			signature: &reportdoc.Signature{
				Place:   "Denpasar",
				Signers: []reportdoc.Signer{{RoleLabel: "Kepala Sekolah", Name: "Kepala Sekolah Uji"}},
			},
		})

		classScoped, err := readerSvc.ExportJournalsReport(ctx, tenant, year, service.JournalFilter{ClassID: uuid.NullUUID{UUID: class, Valid: true}}, reportdoc.LocaleID, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})
		require.NoError(t, err)
		f, err := excelize.OpenReader(bytes.NewReader(classScoped))
		require.NoError(t, err)
		defer f.Close() //nolint:errcheck
		rows, err := f.GetRows(f.GetSheetList()[0])
		require.NoError(t, err)
		var flat []string
		for _, row := range rows {
			flat = append(flat, row...)
		}
		joined := strings.Join(flat, " | ")
		require.Contains(t, joined, "Wali Kelas")
		require.Contains(t, joined, "Substitute", "the class's homeroom teacher (substitute) must be resolved and rendered")
		require.Contains(t, joined, "Kepala Sekolah Uji")

		unscoped, err := readerSvc.ExportJournalsReport(ctx, tenant, year, service.JournalFilter{TeacherUserID: uuid.NullUUID{UUID: teacher, Valid: true}}, reportdoc.LocaleID, reportdoc.Options{Format: reportdoc.FormatXLSX, ShowLetterhead: true})
		require.NoError(t, err)
		uf, err := excelize.OpenReader(bytes.NewReader(unscoped))
		require.NoError(t, err)
		defer uf.Close() //nolint:errcheck
		urows, err := uf.GetRows(uf.GetSheetList()[0])
		require.NoError(t, err)
		var uflat []string
		for _, row := range urows {
			uflat = append(uflat, row...)
		}
		require.NotContains(t, strings.Join(uflat, " | "), "Wali Kelas", "an unscoped ('own journals') export has no single class to attribute a homeroom teacher to")
	})
}

// noopSubstitutionPublisher discards every event -- these tests assert on
// the repository/service return values, not on what reaches the
// notifications module.
type noopSubstitutionPublisher struct{}

func (noopSubstitutionPublisher) Publish(context.Context, service.Event) error { return nil }

// A substitution request's incoming/outgoing list must come back joined
// with the class/subject/period it covers (domain.SubstitutionWithSchedule),
// not just the bare request row -- what the web substitutions page renders
// as a session-card needs that join to avoid a second round trip per row.
func TestListSubstitutionsWithSchedule(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test requires Docker")
	}
	ctx := context.Background()
	pg := dbtest.Start(t)
	pool := pg.AdminPool
	insertID := func(sql string, args ...any) uuid.UUID {
		t.Helper()
		var id uuid.UUID
		require.NoError(t, pool.QueryRow(ctx, sql+" returning id", args...).Scan(&id))
		return id
	}
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := pool.Exec(ctx, sql, args...)
		require.NoError(t, err)
	}
	tenant := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ('substitution-test','Test','sma','UTC','id','active','default')`)
	year := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on) values ($1,'2026/2027','2026-01-01','2027-12-31')`, tenant)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenant)
	class := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name) values ($1,$2,$3,'X-A')`, tenant, year, grade)
	subject := insertID(`insert into subjects (tenant_id,code,name) values ($1,'MTK','Math')`, tenant)
	teacher := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'teacher-req','x','Requester','active','id')`, tenant)
	substitute := insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,'teacher-sub','x','Substitute','active','id')`, tenant)
	template := insertID(`insert into period_templates (tenant_id,name) values ($1,'Default')`, tenant)
	p1 := insertID(`insert into periods (tenant_id,template_id,name,sequence,starts_at,ends_at) values ($1,$2,'P1',1,'08:00','09:00')`, tenant, template)
	exec(`insert into teaching_assignments (tenant_id,academic_year_id,teacher_user_id,subject_id,class_id) values ($1,$2,$3,$4,$5)`, tenant, year, teacher, subject, class)
	// IsActiveTeacher requires the substitute to have some teaching
	// assignment this year too, not necessarily this class/subject.
	exec(`insert into teaching_assignments (tenant_id,academic_year_id,teacher_user_id,subject_id,class_id) values ($1,$2,$3,$4,$5)`, tenant, year, substitute, subject, class)
	// CreateSchedule requires day 1 (Monday) to be an active school day.
	exec(`insert into school_days (tenant_id,academic_year_id,day_of_week) values ($1,$2,1)`, tenant, year)
	exec(`insert into period_day_assignments (tenant_id,academic_year_id,day_of_week,template_id) values ($1,$2,1,$3)`, tenant, year, template)

	svc := service.New(pg.AppPool, repository.New(pg.AppPool))
	actor := service.Actor{CanManage: true, UserID: teacher}
	sched, err := svc.CreateSchedule(ctx, tenant, service.ScheduleInput{
		AcademicYearID: year, ClassID: class, SubjectID: subject, TeacherUserID: teacher,
		DayOfWeek: 1, StartPeriodID: p1, EndPeriodID: p1, Source: domain.SourceAdmin,
	}, actor)
	require.NoError(t, err)

	// 2026-09-21 is a Monday, matching the schedule's day_of_week above.
	date := mustParseDate(t, "2026-09-21")
	created, err := svc.RequestSubstitution(ctx, tenant, sched.ID, date, teacher, substitute, "tolong gantikan", noopSubstitutionPublisher{})
	require.NoError(t, err)
	require.Equal(t, domain.SubstitutionPending, created.Status)

	incoming, err := svc.ListSubstitutionsIncomingWithSchedule(ctx, tenant, substitute)
	require.NoError(t, err)
	require.Len(t, incoming, 1)
	require.Equal(t, created.ID, incoming[0].ID)
	require.Equal(t, class, incoming[0].ClassID)
	require.Equal(t, subject, incoming[0].SubjectID)
	require.Equal(t, p1, incoming[0].StartPeriodID)
	require.Equal(t, p1, incoming[0].EndPeriodID)

	outgoing, err := svc.ListSubstitutionsOutgoingWithSchedule(ctx, tenant, teacher)
	require.NoError(t, err)
	require.Len(t, outgoing, 1)
	require.Equal(t, created.ID, outgoing[0].ID)
	require.Equal(t, class, outgoing[0].ClassID)
	require.Equal(t, subject, outgoing[0].SubjectID)

	// Accepting it must not change the joined class/subject/period.
	_, err = svc.RespondSubstitution(ctx, tenant, created.ID, substitute, true, "", noopSubstitutionPublisher{})
	require.NoError(t, err)
	incoming, err = svc.ListSubstitutionsIncomingWithSchedule(ctx, tenant, substitute)
	require.NoError(t, err)
	require.Len(t, incoming, 1)
	require.Equal(t, domain.SubstitutionAccepted, incoming[0].Status)
	require.Equal(t, class, incoming[0].ClassID)
}

func mustParseDate(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse("2006-01-02", value)
	require.NoError(t, err)
	return parsed
}

// fakeJournalLetterheadSource is a minimal reportdoc.LetterheadSource
// stub, for verifying the journal export wires in whatever the school
// module's ReportLetterhead would have returned, without depending on
// that module's own tenant_settings fixture.
type fakeJournalLetterheadSource struct {
	signature *reportdoc.Signature
}

func (f fakeJournalLetterheadSource) Letterhead(context.Context, uuid.UUID) (*reportdoc.Letterhead, *reportdoc.Signature, error) {
	return nil, f.signature, nil
}

type journalExportPermissions struct{ all bool }

func (p journalExportPermissions) EffectivePermissions(context.Context, uuid.UUID, uuid.UUID) (authz.Set, error) {
	if p.all {
		return authz.NewSet(authz.PermViewJournalsAll), nil
	}
	return authz.NewSet(), nil
}
func journalDocumentXML(t *testing.T, payload []byte) string {
	t.Helper()
	archive, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	require.NoError(t, err)
	for _, entry := range archive.File {
		if entry.Name != "word/document.xml" {
			continue
		}
		reader, err := entry.Open()
		require.NoError(t, err)
		defer reader.Close()
		content, err := io.ReadAll(reader)
		require.NoError(t, err)
		return string(content)
	}
	t.Fatal("DOCX has no document.xml")
	return ""
}
