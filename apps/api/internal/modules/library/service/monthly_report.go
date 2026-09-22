package service

import (
	"bytes"
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// MonthlyReport is the printable A4 monthly report's data (old app:
// library_monthly_report.go): 11 headline indicators, the period's top
// titles and borrowers, and visits broken down by class.
type MonthlyReport struct {
	Month           time.Time // first day of the reported month
	LibraryName     string
	TotalTitles     int
	TotalCopies     int
	TitlesAdded     int
	CopiesAdded     int
	MembersTotal    int
	VisitsThisMonth int
	AvgVisitsPerDay float64
	Loans           int
	Returns         int
	LateReturns     int
	FinesRecorded   int
	TopTitles       []MostBorrowedTitle
	TopBorrowers    []TopBorrower
	VisitsPerClass  []ClassCount
}

// parseReportMonth turns a "YYYY-MM" string into the half-open [from, to)
// range that month covers, defaulting to the tenant clock's current month
// when month is empty (old app: parseLibraryReportMonth).
func parseReportMonth(month string, now time.Time) (time.Time, time.Time, error) {
	if month == "" {
		month = now.Format("2006-01")
	}
	from, err := time.Parse("2006-01", month)
	if err != nil {
		return time.Time{}, time.Time{}, domain.ErrInvalidInput
	}
	return from, from.AddDate(0, 1, 0), nil
}

func (s *Service) MonthlyReport(ctx context.Context, tenantID uuid.UUID, month string) (MonthlyReport, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return MonthlyReport{}, err
	}
	from, to, err := parseReportMonth(month, s.clock.Now())
	if err != nil {
		return MonthlyReport{}, err
	}

	var report MonthlyReport
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		totalTitles, err := s.repo.CountTitlesActive(ctx, tenantID)
		if err != nil {
			return err
		}
		totalCopies, err := s.repo.CountCopiesTotal(ctx, tenantID)
		if err != nil {
			return err
		}
		titlesAdded, err := s.repo.CountTitlesAddedInPeriod(ctx, tenantID, from, to)
		if err != nil {
			return err
		}
		copiesAdded, err := s.repo.CountCopiesAddedInPeriod(ctx, tenantID, from, to)
		if err != nil {
			return err
		}
		membersTotal, err := s.repo.CountMembersTotal(ctx, tenantID)
		if err != nil {
			return err
		}
		visits, err := s.repo.CountVisitsBetween(ctx, tenantID, from, to)
		if err != nil {
			return err
		}
		loans, err := s.repo.CountLoansBetween(ctx, tenantID, from, to)
		if err != nil {
			return err
		}
		returns, err := s.repo.CountReturnsBetween(ctx, tenantID, from, to)
		if err != nil {
			return err
		}
		lateReturns, err := s.repo.CountLateReturnsBetween(ctx, tenantID, from, to)
		if err != nil {
			return err
		}
		finesRecorded, err := s.repo.SumFinesRecordedBetween(ctx, tenantID, from, to)
		if err != nil {
			return err
		}

		topTitleCounts, err := s.repo.MostBorrowedTitles(ctx, tenantID, from, to, 10)
		if err != nil {
			return err
		}
		topTitles := make([]MostBorrowedTitle, 0, len(topTitleCounts))
		for _, c := range topTitleCounts {
			title, found, err := s.repo.GetTitle(ctx, tenantID, c.TitleID)
			if err != nil {
				return err
			}
			if !found {
				continue
			}
			withAvailability, err := s.withAvailability(ctx, tenantID, title)
			if err != nil {
				return err
			}
			topTitles = append(topTitles, MostBorrowedTitle{Title: withAvailability, LoanCount: c.LoanCount})
		}

		borrowerRows, err := s.repo.TopBorrowersInPeriod(ctx, tenantID, from, to, 10)
		if err != nil {
			return err
		}
		topBorrowers := make([]TopBorrower, len(borrowerRows))
		for i, r := range borrowerRows {
			name := r.MemberUserID.String()
			if s.members != nil {
				if resolved, err := s.members.UserDisplayName(ctx, tenantID, r.MemberUserID); err == nil && resolved != "" {
					name = resolved
				}
			}
			topBorrowers[i] = TopBorrower{MemberUserID: r.MemberUserID, MemberName: name, ClassName: r.ClassName, LoanCount: r.LoanCount}
		}

		visitsPerClass, err := s.repo.VisitsPerClass(ctx, tenantID, from, to)
		if err != nil {
			return err
		}
		for i := range visitsPerClass {
			visitsPerClass[i].ClassName = labelClass(visitsPerClass[i].ClassName)
		}

		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}

		// Calendar days in the reported month: the day-of-month of the day
		// before the next month starts, e.g. from=2024-02-01 -> to-1day is
		// 2024-02-29 -> 29 (old app: divides by the calendar month length,
		// not by how much of it has elapsed).
		daysInMonth := to.AddDate(0, 0, -1).Day()

		report = MonthlyReport{
			Month: from, LibraryName: policy.Name, TotalTitles: totalTitles, TotalCopies: totalCopies,
			TitlesAdded: titlesAdded, CopiesAdded: copiesAdded, MembersTotal: membersTotal, VisitsThisMonth: visits,
			AvgVisitsPerDay: safeDiv(visits, daysInMonth), Loans: loans, Returns: returns, LateReturns: lateReturns,
			FinesRecorded: finesRecorded, TopTitles: topTitles, TopBorrowers: topBorrowers, VisitsPerClass: visitsPerClass,
		}
		return nil
	})
	if err != nil {
		return MonthlyReport{}, err
	}
	return report, nil
}

// formatThousands renders n with "." as the thousands separator, the
// Indonesian convention the old app's libraryFormatRupiah used.
func formatThousands(n int) string {
	neg := n < 0
	if neg {
		n = -n
	}
	digits := strconv.Itoa(n)
	var out []byte
	for i, c := range []byte(digits) {
		if i > 0 && (len(digits)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, c)
	}
	if neg {
		return "-" + string(out)
	}
	return string(out)
}

// formatFloat1 renders a ratio with one decimal and a comma, the old
// app's libraryFormatFloat.
func formatFloat1(v float64) string {
	return fmt.Sprintf("%.1f", v)
}

// MonthlyReportPDF renders MonthlyReport as a single A4 page: the report's
// 11 indicators, its top-10 tables, and Pustakawan/Kepala Sekolah
// signature columns (old app: library_monthly_report.go, HTML with
// auto-print; here a server-rendered PDF since the platform has no
// browser-print step for a generated document).
func (s *Service) MonthlyReportPDF(ctx context.Context, tenantID uuid.UUID, month string) ([]byte, error) {
	report, err := s.MonthlyReport(ctx, tenantID, month)
	if err != nil {
		return nil, err
	}

	pdf := fpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(18, 16, 18)
	pdf.AddPage()

	libraryName := report.LibraryName
	if libraryName == "" {
		libraryName = "Perpustakaan Sekolah"
	}
	pdf.SetFont("Helvetica", "B", 14)
	pdf.CellFormat(0, 7, libraryName, "", 1, "C", false, 0, "")
	pdf.SetFont("Helvetica", "B", 12)
	pdf.CellFormat(0, 6, "Laporan Bulanan Perpustakaan", "", 1, "C", false, 0, "")
	pdf.SetFont("Helvetica", "", 10)
	pdf.CellFormat(0, 6, report.Month.Format("January 2006"), "", 1, "C", false, 0, "")
	pdf.Ln(4)

	indicators := [][2]string{
		{"Total Judul", strconv.Itoa(report.TotalTitles)},
		{"Total Eksemplar", strconv.Itoa(report.TotalCopies)},
		{"Judul Baru Bulan Ini", strconv.Itoa(report.TitlesAdded)},
		{"Eksemplar Baru Bulan Ini", strconv.Itoa(report.CopiesAdded)},
		{"Total Anggota", strconv.Itoa(report.MembersTotal)},
		{"Kunjungan Bulan Ini", strconv.Itoa(report.VisitsThisMonth)},
		{"Rata-rata Kunjungan/Hari", formatFloat1(report.AvgVisitsPerDay)},
		{"Peminjaman", strconv.Itoa(report.Loans)},
		{"Pengembalian", strconv.Itoa(report.Returns)},
		{"Pengembalian Telat", strconv.Itoa(report.LateReturns)},
		{"Total Denda Tercatat", "Rp " + formatThousands(report.FinesRecorded)},
	}
	pdf.SetFont("Helvetica", "B", 11)
	pdf.CellFormat(0, 7, "Ringkasan", "", 1, "L", false, 0, "")
	pdf.SetFont("Helvetica", "", 9)
	colWidth := 90.0
	for i := 0; i < len(indicators); i += 2 {
		pdf.CellFormat(colWidth-40, 6, indicators[i][0], "", 0, "L", false, 0, "")
		pdf.CellFormat(40, 6, indicators[i][1], "", 0, "L", false, 0, "")
		if i+1 < len(indicators) {
			pdf.CellFormat(colWidth-40, 6, indicators[i+1][0], "", 0, "L", false, 0, "")
			pdf.CellFormat(40, 6, indicators[i+1][1], "", 1, "L", false, 0, "")
		} else {
			pdf.Ln(6)
		}
	}
	pdf.Ln(3)

	writeTable := func(title string, headers []string, widths []float64, rows [][]string) {
		pdf.SetFont("Helvetica", "B", 11)
		pdf.CellFormat(0, 7, title, "", 1, "L", false, 0, "")
		pdf.SetFont("Helvetica", "B", 8)
		for i, h := range headers {
			pdf.CellFormat(widths[i], 6, h, "1", 0, "L", false, 0, "")
		}
		pdf.Ln(-1)
		pdf.SetFont("Helvetica", "", 8)
		if len(rows) == 0 {
			pdf.CellFormat(sumWidths(widths), 6, "Tidak ada data.", "1", 1, "L", false, 0, "")
		}
		for _, row := range rows {
			for i, cell := range row {
				pdf.CellFormat(widths[i], 6, cell, "1", 0, "L", false, 0, "")
			}
			pdf.Ln(-1)
		}
		pdf.Ln(3)
	}

	titleRows := make([][]string, len(report.TopTitles))
	for i, t := range report.TopTitles {
		titleRows[i] = []string{strconv.Itoa(i + 1), t.Title.Title.Title, t.Title.Author, strconv.Itoa(t.LoanCount)}
	}
	writeTable("Judul Terpopuler", []string{"No", "Judul", "Pengarang", "Dipinjam"}, []float64{10, 90, 60, 14}, titleRows)

	borrowerRows := make([][]string, len(report.TopBorrowers))
	for i, b := range report.TopBorrowers {
		borrowerRows[i] = []string{strconv.Itoa(i + 1), b.MemberName, b.ClassName, strconv.Itoa(b.LoanCount)}
	}
	writeTable("Peminjam Teraktif", []string{"No", "Nama", "Kelas", "Dipinjam"}, []float64{10, 90, 46, 28}, borrowerRows)

	classRows := make([][]string, len(report.VisitsPerClass))
	for i, c := range report.VisitsPerClass {
		classRows[i] = []string{c.ClassName, strconv.Itoa(c.Count)}
	}
	writeTable("Kunjungan per Kelas", []string{"Kelas", "Jumlah Kunjungan"}, []float64{90, 40}, classRows)

	pdf.Ln(10)
	pdf.SetFont("Helvetica", "", 9)
	_, pageHeight := pdf.GetPageSize()
	_, _, _, bottom := pdf.GetMargins()
	if pdf.GetY() > pageHeight-bottom-40 {
		pdf.AddPage()
	}
	y := pdf.GetY()
	pdf.SetXY(18, y)
	pdf.CellFormat(80, 6, "Pustakawan,", "", 0, "C", false, 0, "")
	pdf.SetXY(112, y)
	pdf.CellFormat(80, 6, "Kepala Sekolah,", "", 1, "C", false, 0, "")
	pdf.SetXY(18, y+25)
	pdf.CellFormat(80, 6, "(_________________________)", "", 0, "C", false, 0, "")
	pdf.SetXY(112, y+25)
	pdf.CellFormat(80, 6, "(_________________________)", "", 1, "C", false, 0, "")

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, fmt.Errorf("render monthly report pdf: %w", err)
	}
	return buf.Bytes(), nil
}

func sumWidths(widths []float64) float64 {
	var total float64
	for _, w := range widths {
		total += w
	}
	return total
}
