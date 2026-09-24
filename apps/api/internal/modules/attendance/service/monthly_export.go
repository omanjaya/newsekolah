package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// MonthlyRecapRow is one student's per-status attendance totals for a
// month, the row shape behind the monthly recap export (NIS, name, one
// count per configured status code, total counted days, percentage
// present) -- unlike GetMonthlySummary's per-day calendar, this report
// scopes to a whole class or grade level at once.
type MonthlyRecapRow struct {
	StudentUserID uuid.UUID
	Name          string
	NIS           string
	// Counts is keyed by status code (per the tenant's StatusPolicy, e.g.
	// H/S/I/D/A), counting every day of the month that resolved to that
	// code. Days that resolved to domain.StatusNone (nothing scheduled)
	// are not counted anywhere.
	Counts map[string]int
	// TotalDays is the sum of Counts across every status -- the number
	// of school days the student had an attendance outcome for.
	TotalDays int
	// PresentDays is the subset of TotalDays whose status counts as
	// present per the tenant's policy.
	PresentDays int
	// PercentPresent is PresentDays/TotalDays*100, or 0 when TotalDays is 0.
	PercentPresent float64
}

// ClassMonthlyRecap is one class's monthly recap section: its rows plus
// the class identity, so a grade-level export can render one workbook
// sheet per class.
type ClassMonthlyRecap struct {
	ClassID   uuid.UUID
	ClassName string
	Rows      []MonthlyRecapRow
}

// GetMonthlyRecap builds the monthly attendance recap for a report
// export's scope (exactly one of classID/gradeLevelID): one
// ClassMonthlyRecap per class, ordered by class name for the grade-level
// scope, a single-element slice for the class scope.
func (s *Service) GetMonthlyRecap(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID *uuid.UUID, month string) ([]ClassMonthlyRecap, error) {
	from, to, err := parseMonthRange(month)
	if err != nil {
		return nil, err
	}

	var out []ClassMonthlyRecap
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeAcademicYear(ctx, tenantID)
		if err != nil {
			return err
		}
		classes, err := s.resolveReportScope(ctx, tenantID, classID, gradeLevelID)
		if err != nil {
			return err
		}
		policy, err := s.loadStatusPolicy(ctx, tenantID)
		if err != nil {
			return err
		}

		out = make([]ClassMonthlyRecap, 0, len(classes))
		for _, class := range classes {
			recap, err := s.classMonthlyRecap(ctx, tenantID, yearID, class, from, to, policy)
			if err != nil {
				return err
			}
			out = append(out, recap)
		}
		return nil
	})
	return out, err
}

// classMonthlyRecap computes one class's roster's monthly totals, reusing
// calendarDaysForRange per student (the same day-by-day algorithm the
// student calendar and monthly summary use) but passing the class already
// known from the roster read, rather than re-resolving it per student via
// GetEnrolledClass.
func (s *Service) classMonthlyRecap(
	ctx context.Context, tenantID, academicYearID uuid.UUID, class ClassRef, from, to time.Time, policy domain.StatusPolicy,
) (ClassMonthlyRecap, error) {
	students, err := s.repo.ListActiveEnrollments(ctx, tenantID, academicYearID, class.ID)
	if err != nil {
		return ClassMonthlyRecap{}, err
	}

	rows := make([]MonthlyRecapRow, 0, len(students))
	for _, student := range students {
		days, err := s.calendarDaysForRange(ctx, tenantID, academicYearID, student.ID, class.ID, true, from, to, policy)
		if err != nil {
			return ClassMonthlyRecap{}, err
		}
		row := MonthlyRecapRow{StudentUserID: student.ID, Name: student.Name, NIS: student.NIS, Counts: make(map[string]int, len(policy.Statuses))}
		for _, day := range days {
			// Only a day that resolved to one of the tenant's configured
			// status codes counts: domain.StatusNone (nothing scheduled),
			// StatusIncomplete (a session that day was never submitted)
			// and StatusMixed carry no attendance outcome to recap, and
			// StatusIncomplete in particular would otherwise inflate
			// TotalDays with days nobody ever recorded.
			if !policy.IsValid(day.StatusCode) {
				continue
			}
			row.Counts[day.StatusCode]++
			row.TotalDays++
			if policy.CountsAsPresent(day.StatusCode) {
				row.PresentDays++
			}
		}
		if row.TotalDays > 0 {
			row.PercentPresent = float64(row.PresentDays) / float64(row.TotalDays) * 100
		}
		rows = append(rows, row)
	}

	return ClassMonthlyRecap{ClassID: class.ID, ClassName: class.Name, Rows: rows}, nil
}

// monthlyRecapColumns are the monthly recap's stable column keys and
// default Indonesian labels: NIS, name, one column per the tenant's
// configured status code (key "status_<code>", so it never collides with
// "total"/"percentage" even if a tenant ever configured a status code
// spelled that way), total counted days, and percentage present.
//
// A per-day column group was considered and left out -- 28-31 extra
// columns per student duplicates what the existing per-student calendar
// view (GET .../reports/monthly, and the on-screen monthly tab) already
// shows, and would not fit a printed recap the way a one-row-per-student
// summary does.
func monthlyRecapColumns(policy domain.StatusPolicy) []reportdoc.Column {
	columns := make([]reportdoc.Column, 0, 5+len(policy.Statuses))
	columns = append(columns,
		reportdoc.Column{Key: "no", Label: "No", Kind: reportdoc.ColumnNumber, Width: 5},
		reportdoc.Column{Key: "nis", Label: "NIS", Kind: reportdoc.ColumnText, Width: 14},
		reportdoc.Column{Key: "name", Label: "Nama Siswa", Kind: reportdoc.ColumnText, Width: 28},
	)
	for _, def := range policy.Statuses {
		columns = append(columns, reportdoc.Column{Key: "status_" + def.Code, Label: def.Label, Kind: reportdoc.ColumnNumber, Width: 10})
	}
	columns = append(columns,
		reportdoc.Column{Key: "total", Label: "Total", Kind: reportdoc.ColumnNumber, Width: 10},
		reportdoc.Column{Key: "percentage", Label: "Persentase Hadir", Kind: reportdoc.ColumnPercent, Width: 14},
	)
	return columns
}

// monthlyRecapSection turns one class's ClassMonthlyRecap into a
// reportdoc Section, ordered to match monthlyRecapColumns.
func monthlyRecapSection(recap ClassMonthlyRecap, policy domain.StatusPolicy) reportdoc.Section {
	rows := make([][]any, len(recap.Rows))
	for i, row := range recap.Rows {
		values := make([]any, 0, 5+len(policy.Statuses))
		values = append(values, i+1, row.NIS, row.Name)
		for _, def := range policy.Statuses {
			values = append(values, row.Counts[def.Code])
		}
		percent := 0.0
		if row.TotalDays > 0 {
			percent = row.PercentPresent / 100
		}
		values = append(values, row.TotalDays, percent)
		rows[i] = values
	}
	return reportdoc.Section{Name: recap.ClassName, Rows: rows}
}

// ExportMonthlyRecap renders GetMonthlyRecap as a reportdoc file (XLSX or
// PDF per opts.Format): one section per class, one row per student.
// Exactly one of classID/gradeLevelID must be set. Called with a zero
// reportdoc.Options, this keeps every existing caller's request working.
func (s *Service) ExportMonthlyRecap(ctx context.Context, tenantID uuid.UUID, classID, gradeLevelID *uuid.UUID, month string, opts reportdoc.Options) ([]byte, error) {
	var out []byte
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		// GetMonthlyRecap opens its own s.withTx, which joins this
		// ambient one (database.withTx's nested-call rule) rather than
		// starting a second transaction -- so loadStatusPolicy below runs
		// under the same tenant-scoped transaction, needed the first time
		// a tenant is asked (it seeds and writes a default policy row).
		recaps, err := s.GetMonthlyRecap(ctx, tenantID, classID, gradeLevelID, month)
		if err != nil {
			return err
		}
		policy, err := s.loadStatusPolicy(ctx, tenantID)
		if err != nil {
			return err
		}

		sections := make([]reportdoc.Section, len(recaps))
		for i, recap := range recaps {
			sections[i] = monthlyRecapSection(recap, policy)
		}
		doc := reportdoc.Document{
			Title:    "Rekap Presensi Bulanan",
			Scope:    []reportdoc.ScopeLine{{Label: "Bulan", Value: month}},
			Columns:  monthlyRecapColumns(policy),
			Sections: sections,
		}
		out, err = renderReport(doc, opts)
		return err
	})
	return out, err
}
