package wiring

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// analyticsWorld is one tenant seeded with enough attendance, discipline,
// leave and grading history to exercise every branch of the early-warning
// signals: a school-sized roster with sessions over two months, a daily
// summary for only some of the days, issued and unissued leave letters
// (some overlapping), voided and active violations, warning letters, two
// terms with partial grades, publications and report scores.
type analyticsWorld struct {
	tenantID   uuid.UUID
	yearID     uuid.UUID
	studentIDs []uuid.UUID // actively enrolled
	ghostIDs   []uuid.UUID // users with no enrollment at all
	// firstDay and lastDay bound the seeded attendance history.
	firstDay, lastDay time.Time
}

// seedAnalyticsWorld fills a fresh tenant through the admin pool (RLS
// bypassed, like every integration fixture). Randomness is hash based, so
// the same arguments always give the same data. now's date is the last day
// with attendance sessions.
func seedAnalyticsWorld(t *testing.T, pool *pgxpool.Pool, students, classes int, now time.Time) analyticsWorld {
	t.Helper()
	ctx := context.Background()
	q := db.New(pool)

	tn, err := q.CreateTenant(ctx, db.CreateTenantParams{
		Slug: "analytics-equiv-" + uuid.NewString(), Name: "Analytics Equivalence", EducationLevel: "sma",
		Timezone: "UTC", Locale: "id", Status: "active", Plan: "default",
	})
	require.NoError(t, err)
	year, err := q.CreateAcademicYear(ctx, db.CreateAcademicYearParams{
		TenantID: tn.ID, Label: "2026/2027",
		StartsOn: database.Date(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)),
		EndsOn:   database.Date(time.Date(2027, 6, 30, 0, 0, 0, 0, time.UTC)),
		IsActive: true,
	})
	require.NoError(t, err)

	w := analyticsWorld{
		tenantID: tn.ID, yearID: year.ID,
		firstDay: time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC),
		lastDay:  time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC),
	}

	// Temp tables below live on one connection, so every statement of the
	// seed runs on it.
	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := conn.Exec(ctx, sql, args...)
		require.NoError(t, err, sql)
	}

	var gradeLevelID uuid.UUID
	require.NoError(t, conn.QueryRow(ctx,
		`insert into grade_levels (tenant_id, code, name, sequence) values ($1, 'X', 'Kelas X', 1) returning id`, w.tenantID,
	).Scan(&gradeLevelID))

	// Classes, subjects, periods, school days and users.
	exec(`insert into classes (tenant_id, academic_year_id, grade_level_id, name)
	      select $1, $2, $3, 'X-' || lpad(g::text, 3, '0') from generate_series(1, $4::int) g`, w.tenantID, w.yearID, gradeLevelID, classes)
	exec(`insert into subjects (tenant_id, code, name) select $1, 'S' || g, 'Subject ' || g from generate_series(1, 3) g`, w.tenantID)
	var templateID uuid.UUID
	require.NoError(t, conn.QueryRow(ctx,
		`insert into period_templates (tenant_id, name) values ($1, 'Default') returning id`, w.tenantID).Scan(&templateID))
	exec(`insert into periods (tenant_id, template_id, name, sequence, starts_at, ends_at)
	      select $1, $2, 'P' || g, g, time '07:00' + (g - 1) * interval '45 minutes', time '07:00' + g * interval '45 minutes'
	      from generate_series(1, 3) g`, w.tenantID, templateID)
	exec(`insert into school_days (tenant_id, academic_year_id, day_of_week, is_active)
	      select $1, $2, g, g <= 5 from generate_series(1, 6) g`, w.tenantID, w.yearID)
	exec(`insert into users (tenant_id, username, password_hash, name, status)
	      select $1, 'teacher-' || lpad(g::text, 3, '0'), 'x', 'Teacher ' || g, 'active' from generate_series(1, $2::int) g`, w.tenantID, classes)
	exec(`insert into users (tenant_id, username, password_hash, name, status)
	      select $1, 'student-' || lpad(g::text, 6, '0'), 'x', 'Student ' || g, 'active' from generate_series(1, $2::int) g`, w.tenantID, students)
	exec(`insert into users (tenant_id, username, password_hash, name, status)
	      select $1, 'ghost-' || g, 'x', 'Ghost ' || g, 'active' from generate_series(1, 5) g`, w.tenantID)

	// Active enrollments round-robin over the classes, plus a stale "moved"
	// enrollment in another class for some students.
	exec(`create temp table seed_class as
	      select id, row_number() over (order by name) rn from classes where tenant_id = $1`, w.tenantID)
	exec(`create temp table seed_teacher as
	      select id, row_number() over (order by username) rn from users where tenant_id = $1 and username like 'teacher-%'`, w.tenantID)
	exec(`create temp table seed_student as
	      select id, row_number() over (order by username) rn from users where tenant_id = $1 and username like 'student-%'`, w.tenantID)
	exec(`insert into enrollments (tenant_id, academic_year_id, student_user_id, class_id, status, joined_on)
	      select $1, $2, s.id, c.id, 'active', date '2026-07-01'
	      from seed_student s join seed_class c on c.rn = ((s.rn - 1) % $3::int) + 1`, w.tenantID, w.yearID, classes)
	exec(`insert into enrollments (tenant_id, academic_year_id, student_user_id, class_id, status, joined_on, left_on)
	      select $1, $2, s.id, c.id, 'moved', date '2026-07-01', date '2026-08-15'
	      from seed_student s join seed_class c on c.rn = (s.rn % $3::int) + 1
	      where s.rn % 17 = 0 and $3::int > 1`, w.tenantID, w.yearID, classes)

	// Weekly timetable: three lessons a day Monday to Friday per class, each
	// class with its own teacher so the anti-clash constraints hold.
	exec(`insert into schedules (tenant_id, academic_year_id, class_id, subject_id, teacher_user_id, day_of_week,
	                             start_period_id, end_period_id, start_seq, end_seq, source)
	      select $1, $2, c.id, sub.id, t.id, d, p.id, p.id, p.sequence, p.sequence, 'admin'
	      from seed_class c
	      join seed_teacher t on t.rn = c.rn
	      cross join generate_series(1, 5) d
	      join periods p on p.tenant_id = $1
	      join subjects sub on sub.tenant_id = $1 and sub.code = 'S' || p.sequence`, w.tenantID, w.yearID)

	// Sessions every weekday since the first day except two days nobody held
	// school; roughly 7% of sessions were never submitted.
	exec(`insert into attendance_sessions (tenant_id, academic_year_id, schedule_id, date, class_id, subject_id, teacher_user_id,
	                                       start_period_id, end_period_id, submitted_at)
	      select s.tenant_id, s.academic_year_id, s.id, d.day::date, s.class_id, s.subject_id, s.teacher_user_id,
	             s.start_period_id, s.end_period_id,
	             case when mod(abs(hashtextextended(s.id::text || d.day::text, 1)), 100) < 93 then d.day::date + time '10:00' else null end
	      from schedules s
	      join generate_series($2::date, $3::date, interval '1 day') d(day) on extract(isodow from d.day)::int = s.day_of_week
	      where s.tenant_id = $1 and d.day::date not in (date '2026-09-17', date '2026-10-12')`,
		w.tenantID, w.firstDay, w.lastDay)

	// Entries for the submitted sessions; some students are chronic
	// absentees and ~3% of entries were never recorded.
	exec(`insert into attendance_entries (tenant_id, session_id, student_user_id, status_code, source)
	      select ses.tenant_id, ses.id, e.student_user_id,
	             case when x.r < 78 then 'H' when x.r < 84 then 'S' when x.r < 88 then 'I' when x.r < 91 then 'D' else 'A' end,
	             'teacher'
	      from attendance_sessions ses
	      join enrollments e on e.tenant_id = ses.tenant_id and e.class_id = ses.class_id and e.status = 'active'
	      cross join lateral (
	        select least(99, mod(abs(hashtextextended(ses.id::text || e.student_user_id::text, 2)), 100)
	               + case when mod(abs(hashtextextended(e.student_user_id::text, 9)), 10) = 0 then 20 else 0 end) r
	      ) x
	      where ses.tenant_id = $1 and ses.submitted_at is not null
	        and mod(abs(hashtextextended(ses.id::text || e.student_user_id::text, 3)), 100) >= 3`, w.tenantID)

	// A daily summary for only some days, with statuses that do not follow
	// the entries, so a read that wrongly recomputed them would differ.
	exec(`insert into attendance_daily_summary (tenant_id, academic_year_id, student_user_id, date, status_code, expected_sessions, submitted_sessions)
	      select $1, $2, e.student_user_id, d.day::date,
	             (array['H','H','H','S','I','D','A','NONE','INCOMPLETE'])[1 + mod(abs(hashtextextended(e.student_user_id::text || d.day::text, 4)), 9)],
	             3, 3
	      from enrollments e
	      cross join generate_series($3::date, $4::date - 1, interval '1 day') d(day)
	      where e.tenant_id = $1 and e.status = 'active'
	        and mod(abs(hashtextextended(e.student_user_id::text || d.day::text, 5)), 100) < 55`,
		w.tenantID, w.yearID, w.firstDay, w.lastDay)

	// Leave letters: about 6% of students have one, 15% of those unissued,
	// and a few have a second, later-issued overlapping letter.
	exec(`insert into workflow_definitions (tenant_id, kind, version, stages) values ($1, 'leave_request', 1, '[]'::jsonb)`, w.tenantID)
	exec(`create temp table seed_leave as
	      select gen_random_uuid() instance_id, s.id student_id, 1 seq,
	             date '2026-10-05' + mod(abs(hashtextextended(s.id::text, 6)), 22)::int starts_on,
	             mod(abs(hashtextextended(s.id::text, 7)), 4)::int span,
	             (array['sick','dispensation','other','religious_ceremony'])[1 + mod(abs(hashtextextended(s.id::text, 8)), 4)] category,
	             mod(abs(hashtextextended(s.id::text, 10)), 100) < 85 issued
	      from seed_student s where mod(abs(hashtextextended(s.id::text, 11)), 100) < 6
	      union all
	      select gen_random_uuid(), s.id, 2,
	             date '2026-10-06' + mod(abs(hashtextextended(s.id::text, 12)), 20)::int,
	             2 + mod(abs(hashtextextended(s.id::text, 13)), 3)::int,
	             (array['sick','dispensation','other','religious_ceremony'])[1 + mod(abs(hashtextextended(s.id::text, 14)), 4)],
	             true
	      from seed_student s where mod(abs(hashtextextended(s.id::text, 11)), 100) < 2`)
	exec(`insert into workflow_instances (id, tenant_id, academic_year_id, definition_id, kind, subject_user_id, status, local_date)
	      select l.instance_id, $1, $2, (select id from workflow_definitions where tenant_id = $1), 'leave_request', l.student_id, 'approved',
	             date '2026-10-01' + l.seq
	      from seed_leave l`, w.tenantID, w.yearID)
	exec(`insert into leave_requests (instance_id, tenant_id, category, reason, starts_on, ends_on, issued_at,
	                                  student_name_snapshot, class_name_snapshot)
	      select l.instance_id, $1, l.category, 'seed', l.starts_on, l.starts_on + l.span,
	             case when l.issued then timestamptz '2026-10-01 08:00+00' + l.seq * interval '1 hour' else null end,
	             'Student', 'X'
	      from seed_leave l`, w.tenantID)

	// Discipline: records (some voided) for about a third of students, and
	// warning letters for a few.
	exec(`insert into violation_types (tenant_id, code, name, points) values ($1, 'V5', 'Minor', 5), ($1, 'V10', 'Medium', 10), ($1, 'V25', 'Major', 25)`, w.tenantID)
	exec(`insert into violation_records (tenant_id, academic_year_id, student_user_id, violation_type_id, points_snapshot, occurred_on,
	                                     reporter_user_id, voided_at)
	      select $1, $2, s.id, vt.id, vt.points, date '2026-08-01' + mod(abs(hashtextextended(s.id::text || g::text, 15)), 80)::int,
	             (select id from seed_teacher where rn = 1),
	             case when mod(abs(hashtextextended(s.id::text || g::text, 16)), 100) < 20 then timestamptz '2026-10-01 00:00+00' else null end
	      from seed_student s
	      cross join generate_series(1, 4) g
	      join violation_types vt on vt.tenant_id = $1
	        and vt.code = (array['V5','V10','V25'])[1 + mod(abs(hashtextextended(s.id::text || g::text, 17)), 3)]
	      where mod(abs(hashtextextended(s.id::text, 18)), 100) < 35
	        and g <= 1 + mod(abs(hashtextextended(s.id::text, 19)), 4)`, w.tenantID, w.yearID)
	exec(`insert into warning_letters (tenant_id, academic_year_id, student_user_id, level, level_label, threshold_points, total_points, letter_number)
	      select $1, $2, s.id, lv, 'SP' || lv, 25 * lv, 25 * lv, 'SP-' || lv || '-' || s.rn
	      from seed_student s cross join generate_series(1, 2) lv
	      where mod(abs(hashtextextended(s.id::text, 20)), 100) < 10 and (lv = 1 or mod(abs(hashtextextended(s.id::text, 21)), 100) < 40)`,
		w.tenantID, w.yearID)

	// The first few students are in clear trouble, so the fixture always
	// contains someone above the watch cutoff.
	exec(`insert into violation_records (tenant_id, academic_year_id, student_user_id, violation_type_id, points_snapshot, occurred_on, reporter_user_id)
	      select $1, $2, s.id, vt.id, vt.points, date '2026-09-01' + g, (select id from seed_teacher where rn = 1)
	      from seed_student s cross join generate_series(1, 3) g
	      join violation_types vt on vt.tenant_id = $1 and vt.code = 'V25'
	      where s.rn <= 5`, w.tenantID, w.yearID)
	exec(`insert into warning_letters (tenant_id, academic_year_id, student_user_id, level, level_label, threshold_points, total_points, letter_number)
	      select $1, $2, s.id, lv, 'SP' || lv, 25 * lv, 75, 'SPX-' || lv || '-' || s.rn
	      from seed_student s cross join generate_series(1, 2) lv
	      where s.rn <= 5 and not exists (
	        select 1 from warning_letters wl where wl.academic_year_id = $2 and wl.student_user_id = s.id and wl.level = lv)`, w.tenantID, w.yearID)

	// Grading: a previous and an active term, two components per class and
	// subject, most grades, 75% of the subjects published, most report scores.
	exec(`insert into terms (tenant_id, academic_year_id, name, sequence, starts_on, ends_on, is_active) values
	      ($1, $2, 'Semester 1', 1, date '2026-07-01', date '2026-12-20', false),
	      ($1, $2, 'Semester 2', 2, date '2026-12-21', date '2027-06-30', true)`, w.tenantID, w.yearID)
	exec(`insert into assessment_components (tenant_id, academic_year_id, term_id, teacher_user_id, class_id, subject_id, code, kind, weight, sequence)
	      select $1, $2, t.id, tc.id, c.id, sub.id, cd.code, 'summative', cd.weight, cd.seq
	      from terms t
	      cross join seed_class c
	      join seed_teacher tc on tc.rn = c.rn
	      cross join subjects sub
	      cross join (values ('UH', 1.0, 1), ('UTS', 2.0, 2)) cd(code, weight, seq)
	      where t.tenant_id = $1 and sub.tenant_id = $1`, w.tenantID, w.yearID)
	exec(`insert into grades (tenant_id, component_id, student_user_id, score)
	      select $1, ac.id, e.student_user_id, 40 + mod(abs(hashtextextended(ac.id::text || e.student_user_id::text, 22)), 6100) / 100.0
	      from assessment_components ac
	      join enrollments e on e.tenant_id = ac.tenant_id and e.class_id = ac.class_id and e.status = 'active'
	      where ac.tenant_id = $1 and mod(abs(hashtextextended(ac.id::text || e.student_user_id::text, 23)), 100) < 88`, w.tenantID)
	exec(`insert into grade_publications (tenant_id, academic_year_id, term_id, class_id, subject_id, is_published, published_at)
	      select distinct ac.tenant_id, ac.academic_year_id, ac.term_id, ac.class_id, ac.subject_id,
	             mod(abs(hashtextextended(ac.term_id::text || ac.class_id::text || ac.subject_id::text, 24)), 100) < 75, now()
	      from assessment_components ac where ac.tenant_id = $1
	        and mod(abs(hashtextextended(ac.term_id::text || ac.class_id::text || ac.subject_id::text, 25)), 100) < 95`, w.tenantID)
	exec(`insert into report_scores (tenant_id, academic_year_id, term_id, class_id, subject_id, student_user_id, final_score, automatic_score)
	      select x.tenant_id, x.academic_year_id, x.term_id, x.class_id, x.subject_id, x.student_user_id, x.score, x.score
	      from (
	        select distinct ac.tenant_id, ac.academic_year_id, ac.term_id, ac.class_id, ac.subject_id, e.student_user_id,
	               50 + mod(abs(hashtextextended(ac.term_id::text || ac.subject_id::text || e.student_user_id::text, 26)), 4500) / 100.0 score
	        from assessment_components ac
	        join enrollments e on e.tenant_id = ac.tenant_id and e.class_id = ac.class_id and e.status = 'active'
	        where ac.tenant_id = $1
	          and mod(abs(hashtextextended(ac.term_id::text || ac.subject_id::text || e.student_user_id::text, 27)), 100) < 80
	      ) x`, w.tenantID)

	exec(`analyze`)

	rows, err := conn.Query(ctx, `select id from seed_student order by rn`)
	require.NoError(t, err)
	for rows.Next() {
		var id uuid.UUID
		require.NoError(t, rows.Scan(&id))
		w.studentIDs = append(w.studentIDs, id)
	}
	require.NoError(t, rows.Err())
	rows.Close()

	rows, err = conn.Query(ctx, `select id from users where tenant_id = $1 and username like 'ghost-%' order by username`, w.tenantID)
	require.NoError(t, err)
	for rows.Next() {
		var id uuid.UUID
		require.NoError(t, rows.Scan(&id))
		w.ghostIDs = append(w.ghostIDs, id)
	}
	require.NoError(t, rows.Err())
	rows.Close()
	require.Len(t, w.studentIDs, students)
	for _, table := range []string{"seed_class", "seed_teacher", "seed_student", "seed_leave"} {
		exec(`drop table ` + table)
	}

	return w
}
