package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// GetDailyReport builds one class's expected-vs-submitted counts and
// per-student daily status for date, fixing the old system's "expected
// always equals submitted" bug (docs/analysis/backend-inventory.md
// section 1.9/1.11) by routing through the same buildRoster/
// domain.ComputeDailyStatus path every attendance view uses, plus the
// per-session detail rows the old daily report had (section 1.10).
func (s *Service) GetDailyReport(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) (DailyReport, error) {
	var report DailyReport
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeAcademicYear(ctx, tenantID)
		if err != nil {
			return err
		}
		roster, expected, submitted, err := s.buildRoster(ctx, tenantID, yearID, classID, date)
		if err != nil {
			return err
		}
		counts := make(map[string]int, len(roster))
		for _, r := range roster {
			counts[r.StatusCode]++
		}
		sessions, err := s.buildDailyReportSessions(ctx, tenantID, classID, date)
		if err != nil {
			return err
		}
		report = DailyReport{
			ClassID: classID, Date: date, ExpectedSessions: expected, SubmittedSessions: submitted,
			Complete: expected == 0 || submitted >= expected, Students: roster, StatusCounts: counts, Sessions: sessions,
		}
		return nil
	})
	return report, err
}

// GetOwnDailyReport is the "own sessions" report scope for a teacher who
// does not hold view_reports (docs/analysis/backend-inventory.md
// section 1.10): every session teacherUserID submitted on date, as the
// schedule's own teacher or as an accepted substitute, across whatever
// classes they taught that day -- not scoped to one class_id, since a
// teacher's day is not.
func (s *Service) GetOwnDailyReport(ctx context.Context, tenantID, teacherUserID uuid.UUID, date time.Time) ([]DailyReportSession, error) {
	var out []DailyReportSession
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		rows, err := s.repo.ListOwnSubmittedSessionDetails(ctx, tenantID, teacherUserID, date)
		if err != nil {
			return err
		}
		out, err = s.toDailyReportSessions(ctx, tenantID, rows)
		return err
	})
	return out, err
}

// buildDailyReportSessions resolves every session already opened for
// classID on date into its full DailyReportSession detail row.
func (s *Service) buildDailyReportSessions(ctx context.Context, tenantID, classID uuid.UUID, date time.Time) ([]DailyReportSession, error) {
	rows, err := s.repo.ListSessionDetailsForClassDate(ctx, tenantID, classID, date)
	if err != nil {
		return nil, err
	}
	return s.toDailyReportSessions(ctx, tenantID, rows)
}

// toDailyReportSessions attaches every session's per-student entries
// (name + status + notes) to its SessionDetailRow.
func (s *Service) toDailyReportSessions(ctx context.Context, tenantID uuid.UUID, rows []SessionDetailRow) ([]DailyReportSession, error) {
	out := make([]DailyReportSession, 0, len(rows))
	nameByStudent := make(map[uuid.UUID]string)
	for _, row := range rows {
		entries, err := s.repo.ListEntriesBySession(ctx, tenantID, row.SessionID)
		if err != nil {
			return nil, err
		}
		if len(entries) > 0 {
			if err := s.fillStudentNames(ctx, tenantID, entries, nameByStudent); err != nil {
				return nil, err
			}
		}
		sessionEntries := make([]DailyReportSessionEntry, len(entries))
		for i, e := range entries {
			sessionEntries[i] = DailyReportSessionEntry{StudentUserID: e.StudentUserID, Name: nameByStudent[e.StudentUserID], StatusCode: e.StatusCode, Notes: e.Notes}
		}
		out = append(out, DailyReportSession{
			SessionID: row.SessionID, ClassID: row.ClassID, ClassName: row.ClassName, SubjectID: row.SubjectID, SubjectName: row.SubjectName,
			TeacherUserID: row.TeacherUserID, TeacherName: row.TeacherName, PeriodLabel: periodLabel(row.StartPeriodName, row.EndPeriodName),
			SubmittedAt: row.SubmittedAt, Entries: sessionEntries,
		})
	}
	return out, nil
}

// fillStudentNames resolves any student in entries not already cached in
// names, via the identity user reads attendance already has through
// ListActiveEnrollments -- looked up by directly resolving the student's
// own record rather than the whole class roster, since a session's
// entries may span a roster the caller has not otherwise loaded.
func (s *Service) fillStudentNames(ctx context.Context, tenantID uuid.UUID, entries []domain.Entry, names map[uuid.UUID]string) error {
	for _, e := range entries {
		if _, ok := names[e.StudentUserID]; ok {
			continue
		}
		name, err := s.repo.GetUserName(ctx, tenantID, e.StudentUserID)
		if err != nil {
			names[e.StudentUserID] = ""
			continue
		}
		names[e.StudentUserID] = name
	}
	return nil
}

// periodLabel joins a session's start and end period names into one
// display string, collapsing to a single name when the session spans only
// one period.
func periodLabel(start, end string) string {
	if start == end || end == "" {
		return start
	}
	return start + " - " + end
}

// dailyReportColumns are the daily report's stable column keys and
// default Indonesian labels, shared by every scope (class or grade
// level) so Options.Columns always refers to the same keys regardless of
// how many sections the export ends up with.
func dailyReportColumns() []reportdoc.Column {
	return []reportdoc.Column{
		{Key: "no", Label: "No", Kind: reportdoc.ColumnNumber, Width: 5},
		{Key: "name", Label: "Nama Siswa", Kind: reportdoc.ColumnText, Width: 28},
		{Key: "status", Label: "Status", Kind: reportdoc.ColumnText, Width: 12},
		{Key: "expected", Label: "Jumlah Sesi", Kind: reportdoc.ColumnNumber, Width: 12},
		{Key: "submitted", Label: "Sesi Terisi", Kind: reportdoc.ColumnNumber, Width: 12},
		{Key: "complete", Label: "Lengkap", Kind: reportdoc.ColumnPercent, Width: 12},
	}
}

// dailyReportSection turns one class's DailyReport into a reportdoc
// Section: one row per student, ordered to match dailyReportColumns, plus
// a Footer totals row. The status column renders policy's own configured
// label (e.g. "Hadir", tenant content, never translated by locale) or,
// for a day with no recorded outcome yet, the locale's pseudo-status
// label (domain.StatusLabel) -- never the raw code (e.g. "H" or
// "INCOMPLETE") a downloaded report's reader cannot be expected to decode.
func dailyReportSection(name string, report DailyReport, locale string, policy domain.StatusPolicy) reportdoc.Section {
	rows := make([][]any, len(report.Students))
	for i, student := range report.Students {
		rows[i] = []any{
			i + 1, student.Name, domain.StatusLabel(student.StatusCode, locale, policy),
			student.ExpectedSessions, student.SubmittedSessions, completeRatio(student.ExpectedSessions, student.SubmittedSessions),
		}
	}
	footer := [][]any{{nil, "Total", nil, report.ExpectedSessions, report.SubmittedSessions, completeRatio(report.ExpectedSessions, report.SubmittedSessions)}}
	return reportdoc.Section{Name: name, Rows: rows, Footer: footer}
}

// completeRatio is submitted/expected as a fraction for reportdoc's
// ColumnPercent kind (e.g. 0.83 for 5/6), matching domain's own "complete
// once expected is 0 or submitted has caught up" rule: an untaught day
// (expected 0) renders as fully complete (1.0) rather than dividing by
// zero.
func completeRatio(expected, submitted int) float64 {
	if expected <= 0 {
		return 1.0
	}
	ratio := float64(submitted) / float64(expected)
	if ratio > 1 {
		ratio = 1
	}
	return ratio
}

// ExportDailyReport renders GetDailyReport as a reportdoc file (XLSX or
// PDF per opts.Format), for one class or every class of a grade level
// ("angkatan") -- one section per class, in resolveReportScope's order.
// Exactly one of classID/gradeLevelID must be set. locale (reportdoc.
// LocaleID/LocaleEN) drives every reportdoc-provided piece of text
// (dates, the PDF page-number footer, the "no rows" label); report-
// specific text (title, scope labels, column labels) stays Indonesian,
// this module's own default. Called with a zero reportdoc.Options (no
// format/title/letterhead/columns query params), this keeps every
// existing caller's request working: xlsx, every column, the report's
// own default title.
func (s *Service) ExportDailyReport(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID *uuid.UUID, date time.Time, locale string, opts reportdoc.Options) ([]byte, error) {
	var out []byte
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		classes, err := s.resolveReportScope(ctx, tenantID, classID, gradeLevelID)
		if err != nil {
			return err
		}
		scopeLine, err := s.reportScopeLine(ctx, tenantID, classID, gradeLevelID, classes)
		if err != nil {
			return err
		}
		policy, err := s.loadStatusPolicy(ctx, tenantID)
		if err != nil {
			return err
		}

		sections := make([]reportdoc.Section, len(classes))
		for i, class := range classes {
			report, err := s.GetDailyReport(ctx, tenantID, class.ID, date)
			if err != nil {
				return err
			}
			sections[i] = dailyReportSection(class.Name, report, locale, policy)
		}

		doc := reportdoc.Document{
			Title:           "Presensi Harian",
			Scope:           []reportdoc.ScopeLine{scopeLine, {Label: "Tanggal", Value: reportdoc.FormatDate(locale, date)}},
			Columns:         dailyReportColumns(),
			Sections:        sections,
			PageLabelFormat: reportdoc.PageLabel(locale),
			EmptyRowsLabel:  reportdoc.EmptyRowsLabelFor(locale),
		}
		if opts.ShowLetterhead {
			lh, sig, err := s.reportLetterhead(ctx, tenantID)
			if err != nil {
				return err
			}
			doc.Letterhead = lh
			if sig != nil {
				signature := *sig
				signature.Date = reportdoc.FormatDate(locale, date)
				doc.Signature = s.classSignature(ctx, tenantID, classID, &signature)
			}
		}
		out, err = renderReport(doc, opts)
		return err
	})
	return out, err
}
