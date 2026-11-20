package wiring

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance"
	attendancedomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits"
	permitsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// leaveLetterSync pushes an issued letter's status into attendance, the
// way cmd/api's attendanceSyncAdapter does for a leave letter. svc is set
// once attendance is built, since attendance is built after permits.
type leaveLetterSync struct {
	svc *attendanceservice.Service
}

func (s *leaveLetterSync) ForceStatus(ctx context.Context, tenantID, studentUserID uuid.UUID, from, to time.Time, statusCode, reason string) error {
	return s.svc.ForceStatus(ctx, tenantID, studentUserID, from, to, statusCode, string(attendancedomain.SourceLeave), reason)
}

// TestIssuedLeaveCountsOnlyTheClassLessonDays wires the timetable-aware
// ClassCalendar into permits and attendance the way cmd/api/wire.go does,
// and follows one leave letter through both (audit S13). The school week
// has all seven days active, but class X-B has lessons only on Tuesday and
// Friday, and Monday 15 February 2027 is a holiday. A leave from Friday 12
// to Tuesday 16 February then covers two lesson days: the request counts
// two school days, the student's calendar and monthly recap show Izin on
// Friday and Tuesday only, and the homeroom roster shows Izin on Friday.
func TestIssuedLeaveCountsOnlyTheClassLessonDays(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
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
	tenantUUID := insertID(`insert into tenants (slug,name,education_level,timezone,locale,status,plan) values ('leave-lesson-days','Test','sma','Asia/Makassar','id','active','default')`)
	user := func(username, name string) uuid.UUID {
		t.Helper()
		return insertID(`insert into users (tenant_id,username,password_hash,name,status,locale) values ($1,$2,'x',$3,'active','id')`, tenantUUID, username, name)
	}
	yearID := insertID(`insert into academic_years (tenant_id,label,starts_on,ends_on,is_active) values ($1,'2026/2027','2026-07-01','2027-06-30',true)`, tenantUUID)
	grade := insertID(`insert into grade_levels (tenant_id,code,name,sequence) values ($1,'X','X',1)`, tenantUUID)
	homeroomTeacher := user("wali-xb", "Wali X-B")
	counselor := user("bk-xb", "Guru BK")
	student := user("siswa-xb", "Siswa X-B")
	classXB := insertID(`insert into classes (tenant_id,academic_year_id,grade_level_id,name,homeroom_teacher_id) values ($1,$2,$3,'X-B',$4)`, tenantUUID, yearID, grade, homeroomTeacher)
	exec(`insert into enrollments (tenant_id,academic_year_id,student_user_id,class_id,status,joined_on) values ($1,$2,$3,$4,'active','2026-07-01')`, tenantUUID, yearID, student, classXB)
	for day := 1; day <= 7; day++ {
		exec(`insert into school_days (tenant_id,academic_year_id,day_of_week,is_active) values ($1,$2,$3,true)`, tenantUUID, yearID, day)
	}
	exec(`insert into academic_calendar_events (tenant_id,academic_year_id,date,end_date,kind,name) values ($1,$2,'2027-02-15','2027-02-15','holiday','Cuti bersama')`, tenantUUID, yearID)
	subject := insertID(`insert into subjects (tenant_id,code,name) values ($1,'MTK','Matematika')`, tenantUUID)
	template := insertID(`insert into period_templates (tenant_id,name) values ($1,'Default')`, tenantUUID)
	period := insertID(`insert into periods (tenant_id,template_id,name,sequence,starts_at,ends_at) values ($1,$2,'P1',1,'07:00','08:00')`, tenantUUID, template)
	// X-B is timetabled on Tuesday and Friday only.
	for _, weekday := range []int{2, 5} {
		exec(`insert into schedules (tenant_id,academic_year_id,class_id,subject_id,teacher_user_id,day_of_week,start_period_id,end_period_id,start_seq,end_seq,source,effective_from)
			values ($1,$2,$3,$4,$5,$6,$7,$7,1,1,'admin','2026-07-01')`, tenantUUID, yearID, classXB, subject, homeroomTeacher, weekday, period)
	}
	homeroomDuty := insertID(`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'homeroom','Wali Kelas','class')`, tenantUUID)
	exec(`insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,scope_class_id,starts_on) values ($1,$2,$3,$4,$5,'2026-07-01')`, tenantUUID, yearID, homeroomDuty, homeroomTeacher, classXB)
	counselorDuty := insertID(`insert into duty_types (tenant_id,slug,name,scope_kind) values ($1,'counselor','Guru BK','school')`, tenantUUID)
	exec(`insert into duty_assignments (tenant_id,academic_year_id,duty_type_id,user_id,starts_on) values ($1,$2,$3,$4,'2026-07-01')`, tenantUUID, yearID, counselorDuty, counselor)
	// The approve and issue steps are what this test follows, not the
	// evidence upload, so the tenant does not require evidence.
	exec(`insert into tenant_policies (tenant_id,kind,version,config,effective_from) values ($1,'permits',1,$2,'2026-07-01')`, tenantUUID, []byte(`{"evidence_required": false}`))

	// The same graph cmd/api/wire.go builds: one timetable-aware
	// ClassCalendar shared by permits and attendance, permits' issued
	// letters as attendance's Overrider, and attendance as permits' sync.
	schoolModule := school.Register(pg.AppPool, tenant.ModeSingle, nil)
	academicModule := academic.Register(pg.AppPool, clock.Real{})
	bus := events.NewBus()
	schedulingModule := scheduling.Register(pg.AppPool, bus, allowNothing{})
	classCalendar := ClassCalendar{Calendar: academicModule.Service, Classes: academicModule.Service, Schedules: schedulingModule.ScheduleReader}
	sync := &leaveLetterSync{}
	permitsModule := permits.Register(permits.Dependencies{
		Pool: pg.AppPool, Years: schoolModule.Service, Bus: bus, Sync: sync, Clock: clock.Real{},
		Config: permitsservice.Config{DocumentSigningKey: []byte("a-test-signing-key"), EvidenceMaxBytes: 6 << 20},
	})
	permitsModule.Service.SetCalendar(classCalendar)
	attendanceModule := attendance.Register(attendance.Dependencies{
		Pool: pg.AppPool, Bus: bus, Years: schoolModule.Service,
		Schedules: schedulingModule.ScheduleReader, Access: schedulingModule.AccessChecker, Journals: schedulingModule.JournalService,
		Perms: allowNothing{}, Overrider: PermitsOverrider{Svc: permitsModule.Service},
	})
	attendanceModule.Service.SetCalendar(classCalendar)
	sync.svc = attendanceModule.Service

	at := func(iso string) context.Context {
		instant, err := time.Parse(time.RFC3339, iso)
		require.NoError(t, err)
		return clock.WithTime(ctx, instant)
	}
	day := func(iso string) time.Time {
		d, err := time.Parse(time.DateOnly, iso)
		require.NoError(t, err)
		return d
	}

	// The student applies on 10 February, the homeroom teacher approves
	// and the counselor issues the letter.
	applied := at("2027-02-10T09:00:00+08:00")
	submitted, err := permitsModule.Service.SubmitLeaveRequest(applied, permitsservice.SubmitLeaveRequestInput{
		TenantID: tenantUUID, ActorUserID: student, StudentUserID: student,
		Category: permitsdomain.CategoryOther, Reason: "Acara keluarga", StartsOn: day("2027-02-12"), EndsOn: day("2027-02-16"),
	})
	require.NoError(t, err)
	require.Equal(t, 2, submitted.SchoolDays, "Fri 12 and Tue 16 are X-B's only lesson days in the range")
	_, err = permitsModule.Service.ReviewLeaveRequest(applied, tenantUUID, submitted.Instance.ID, homeroomTeacher, true, "")
	require.NoError(t, err)
	issued, err := permitsModule.Service.IssueLeaveLetter(applied, tenantUUID, submitted.Instance.ID, counselor)
	require.NoError(t, err)
	require.True(t, issued.LeaveRequest.IsIssued())
	require.Equal(t, 2, issued.SchoolDays, "the letter states two school days")
	detail, err := permitsModule.Service.GetLeaveRequest(applied, tenantUUID, submitted.Instance.ID)
	require.NoError(t, err)
	require.Equal(t, 2, detail.SchoolDays)

	// On 17 February the student's calendar shows Izin on the two lesson
	// days and nothing on the weekend or the holiday.
	later := at("2027-02-17T09:00:00+08:00")
	days, err := attendanceModule.Service.GetStudentCalendarMonth(later, tenantUUID, student, "2027-02")
	require.NoError(t, err)
	byDate := map[string]attendanceservice.CalendarDay{}
	for _, d := range days {
		byDate[d.Date.Format(time.DateOnly)] = d
	}
	require.Equal(t, "I", byDate["2027-02-12"].StatusCode, "Friday")
	require.Equal(t, "I", byDate["2027-02-16"].StatusCode, "Tuesday")
	for _, iso := range []string{"2027-02-13", "2027-02-14", "2027-02-15"} {
		require.Equal(t, "NONE", byDate[iso].StatusCode, "%s has no X-B lesson", iso)
	}

	_, totals, err := attendanceModule.Service.GetMonthlySummary(later, tenantUUID, student, "2027-02")
	require.NoError(t, err)
	require.Equal(t, 2, totals["I"], "the monthly recap counts two days of Izin")

	roster, err := attendanceModule.Service.GetHomeroomAttendance(later, tenantUUID, attendanceservice.Actor{UserID: homeroomTeacher}, day("2027-02-12"), attendanceservice.HomeroomFilter{})
	require.NoError(t, err)
	require.Len(t, roster.Students, 1)
	require.Equal(t, student, roster.Students[0].StudentUserID)
	require.Equal(t, "I", roster.Students[0].StatusCode, "the homeroom roster agrees with the student's calendar")
}
