package service

import (
	"bytes"
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

const dateLayout = "2006-01-02"

func formatDate(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format(dateLayout)
}

func formatDatePtr(t *time.Time) string {
	if t == nil {
		return ""
	}
	return formatDate(*t)
}

// LoansReportXLSX is LoansInPeriod as a single-sheet workbook (old app:
// library_reports.go's format=xlsx on every report).
func (s *Service) LoansReportXLSX(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) ([]byte, error) {
	rows, err := s.LoansInPeriod(ctx, tenantID, from, to)
	if err != nil {
		return nil, err
	}
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // closing an in-memory workbook after Write cannot meaningfully fail.
	headerStyle, err := newXLSXHeaderStyle(f)
	if err != nil {
		return nil, fmt.Errorf("loans report style: %w", err)
	}
	sheet, err := newSheet(f, "Peminjaman", true)
	if err != nil {
		return nil, err
	}
	headers := []string{"Judul", "Peminjam", "Tanggal Pinjam", "Jatuh Tempo", "Tanggal Kembali", "Status", "Denda"}
	body := make([][]any, len(rows))
	for i, r := range rows {
		returned := ""
		if r.Loan.ReturnedAt != nil {
			returned = formatDate(*r.Loan.ReturnedAt)
		}
		body[i] = []any{r.Title, r.MemberName, formatDate(r.Loan.BorrowedAt), formatDate(r.Loan.DueOn), returned, string(r.Loan.Status), r.Loan.FineAmount}
	}
	if err := writeXLSXSheet(f, sheet, headerStyle, headers, body); err != nil {
		return nil, fmt.Errorf("loans report write: %w", err)
	}
	return writeXLSXBuffer(f)
}

// OverdueMembersReportXLSX is OverdueMembers as a single-sheet workbook.
func (s *Service) OverdueMembersReportXLSX(ctx context.Context, tenantID uuid.UUID) ([]byte, error) {
	rows, err := s.OverdueMembers(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // closing an in-memory workbook after Write cannot meaningfully fail.
	headerStyle, err := newXLSXHeaderStyle(f)
	if err != nil {
		return nil, fmt.Errorf("overdue members report style: %w", err)
	}
	sheet, err := newSheet(f, "Terlambat", true)
	if err != nil {
		return nil, err
	}
	headers := []string{"Anggota", "Jumlah Pinjaman Telat", "Estimasi Denda"}
	body := make([][]any, len(rows))
	for i, r := range rows {
		name := r.MemberUserID.String()
		if s.members != nil {
			if resolved, err := s.members.UserDisplayName(ctx, tenantID, r.MemberUserID); err == nil && resolved != "" {
				name = resolved
			}
		}
		body[i] = []any{name, r.LoanCount, r.TotalFine}
	}
	if err := writeXLSXSheet(f, sheet, headerStyle, headers, body); err != nil {
		return nil, fmt.Errorf("overdue members report write: %w", err)
	}
	return writeXLSXBuffer(f)
}

// MostBorrowedReportXLSX is PopularReport as a two-sheet workbook: most
// borrowed titles, then top borrowers with class.
func (s *Service) MostBorrowedReportXLSX(ctx context.Context, tenantID uuid.UUID, from, to *time.Time, limit int) ([]byte, error) {
	report, err := s.PopularReport(ctx, tenantID, from, to, limit)
	if err != nil {
		return nil, err
	}
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // closing an in-memory workbook after Write cannot meaningfully fail.
	headerStyle, err := newXLSXHeaderStyle(f)
	if err != nil {
		return nil, fmt.Errorf("most borrowed report style: %w", err)
	}

	titleSheet, err := newSheet(f, "Judul Terpopuler", true)
	if err != nil {
		return nil, err
	}
	titleRows := make([][]any, len(report.Titles))
	for i, t := range report.Titles {
		titleRows[i] = []any{t.Title.Title.Title, t.Title.Author, t.LoanCount}
	}
	if err := writeXLSXSheet(f, titleSheet, headerStyle, []string{"Judul", "Pengarang", "Jumlah Pinjam"}, titleRows); err != nil {
		return nil, fmt.Errorf("most borrowed report titles write: %w", err)
	}

	borrowerSheet, err := newSheet(f, "Peminjam Teraktif", false)
	if err != nil {
		return nil, err
	}
	borrowerRows := make([][]any, len(report.Borrowers))
	for i, b := range report.Borrowers {
		borrowerRows[i] = []any{b.MemberName, labelClass(b.ClassName), b.LoanCount}
	}
	if err := writeXLSXSheet(f, borrowerSheet, headerStyle, []string{"Anggota", "Kelas", "Jumlah Pinjam"}, borrowerRows); err != nil {
		return nil, fmt.Errorf("most borrowed report borrowers write: %w", err)
	}
	f.SetActiveSheet(0)
	return writeXLSXBuffer(f)
}

// CatalogueSummaryXLSX is CatalogueSummary as a single-sheet key/value
// workbook -- the accreditation summary is a list of figures, not a
// table, so it is laid out as two columns rather than the header+rows
// shape every other report uses.
func (s *Service) CatalogueSummaryXLSX(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) ([]byte, error) {
	summary, err := s.CatalogueSummary(ctx, tenantID, from, to)
	if err != nil {
		return nil, err
	}
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // closing an in-memory workbook after Write cannot meaningfully fail.
	headerStyle, err := newXLSXHeaderStyle(f)
	if err != nil {
		return nil, fmt.Errorf("catalogue summary style: %w", err)
	}
	sheet, err := newSheet(f, "Ringkasan", true)
	if err != nil {
		return nil, err
	}
	rows := [][]any{
		{"Total Judul Aktif", nil},
		{"Judul Baru Periode Ini", summary.AdditionsInPeriod},
		{"Peminjaman Periode Ini", summary.LoansInPeriod},
		{"Peminjam Aktif", summary.ActiveBorrowers},
		{"Terlambat Saat Ini", summary.OverdueNow},
		{"Rasio Fiksi", fmt.Sprintf("%d/%d", summary.FictionCount, summary.FictionTotal)},
		{"Total Siswa Aktif", summary.StudentsTotal},
		{"Total Anggota", summary.MembersTotal},
		{"Eksemplar per Siswa", summary.ItemsPerStudent},
		{"Peminjaman per Siswa", summary.LoansPerStudent},
		{"Kunjungan Periode Ini", summary.VisitsInPeriod},
		{"Kunjungan per Siswa", summary.VisitsPerStudent},
	}
	if err := writeXLSXSheet(f, sheet, headerStyle, []string{"Indikator", "Nilai"}, rows); err != nil {
		return nil, fmt.Errorf("catalogue summary write: %w", err)
	}

	ddcSheet, err := newSheet(f, "Judul per DDC", false)
	if err != nil {
		return nil, err
	}
	ddcRows := make([][]any, len(summary.TitlesByDDC))
	for i, d := range summary.TitlesByDDC {
		ddcRows[i] = []any{d.Code, d.Name, d.TitleCount}
	}
	if err := writeXLSXSheet(f, ddcSheet, headerStyle, []string{"Kelas DDC", "Nama", "Jumlah Judul"}, ddcRows); err != nil {
		return nil, fmt.Errorf("catalogue summary ddc write: %w", err)
	}
	f.SetActiveSheet(0)
	return writeXLSXBuffer(f)
}

// VisitsReportXLSX is VisitsReport as a two-sheet workbook: per-day, then
// per-class.
func (s *Service) VisitsReportXLSX(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) ([]byte, error) {
	report, err := s.VisitsReport(ctx, tenantID, from, to)
	if err != nil {
		return nil, err
	}
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // closing an in-memory workbook after Write cannot meaningfully fail.
	headerStyle, err := newXLSXHeaderStyle(f)
	if err != nil {
		return nil, fmt.Errorf("visits report style: %w", err)
	}
	daySheet, err := newSheet(f, "Per Hari", true)
	if err != nil {
		return nil, err
	}
	dayRows := make([][]any, len(report.PerDay))
	for i, d := range report.PerDay {
		dayRows[i] = []any{formatDate(d.Day), d.Count}
	}
	if err := writeXLSXSheet(f, daySheet, headerStyle, []string{"Tanggal", "Jumlah Kunjungan"}, dayRows); err != nil {
		return nil, fmt.Errorf("visits report per-day write: %w", err)
	}
	classSheet, err := newSheet(f, "Per Kelas", false)
	if err != nil {
		return nil, err
	}
	classRows := make([][]any, len(report.PerClass))
	for i, c := range report.PerClass {
		classRows[i] = []any{c.ClassName, c.Count}
	}
	if err := writeXLSXSheet(f, classSheet, headerStyle, []string{"Kelas", "Jumlah Kunjungan"}, classRows); err != nil {
		return nil, fmt.Errorf("visits report per-class write: %w", err)
	}
	f.SetActiveSheet(0)
	return writeXLSXBuffer(f)
}

// MembersReportXLSX is MembersReport as a two-sheet workbook: per-type,
// then per-class.
func (s *Service) MembersReportXLSX(ctx context.Context, tenantID uuid.UUID) ([]byte, error) {
	report, err := s.MembersReport(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // closing an in-memory workbook after Write cannot meaningfully fail.
	headerStyle, err := newXLSXHeaderStyle(f)
	if err != nil {
		return nil, fmt.Errorf("members report style: %w", err)
	}
	typeSheet, err := newSheet(f, "Per Jenis", true)
	if err != nil {
		return nil, err
	}
	typeRows := make([][]any, len(report.PerType))
	for i, t := range report.PerType {
		typeRows[i] = []any{t.Name, t.Count}
	}
	if err := writeXLSXSheet(f, typeSheet, headerStyle, []string{"Jenis Anggota", "Jumlah"}, typeRows); err != nil {
		return nil, fmt.Errorf("members report per-type write: %w", err)
	}
	classSheet, err := newSheet(f, "Per Kelas", false)
	if err != nil {
		return nil, err
	}
	classRows := make([][]any, len(report.PerClass))
	for i, c := range report.PerClass {
		classRows[i] = []any{c.ClassName, c.Count}
	}
	if err := writeXLSXSheet(f, classSheet, headerStyle, []string{"Kelas", "Jumlah"}, classRows); err != nil {
		return nil, fmt.Errorf("members report per-class write: %w", err)
	}
	f.SetActiveSheet(0)
	return writeXLSXBuffer(f)
}

// AccessionRegisterXLSX is AccessionRegister (Buku Induk) as a
// single-sheet workbook.
func (s *Service) AccessionRegisterXLSX(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) ([]byte, error) {
	copies, err := s.AccessionRegister(ctx, tenantID, from, to)
	if err != nil {
		return nil, err
	}
	f := excelize.NewFile()
	defer f.Close() //nolint:errcheck // closing an in-memory workbook after Write cannot meaningfully fail.
	headerStyle, err := newXLSXHeaderStyle(f)
	if err != nil {
		return nil, fmt.Errorf("accession register style: %w", err)
	}
	sheet, err := newSheet(f, "Buku Induk", true)
	if err != nil {
		return nil, err
	}
	headers := []string{"Nomor Induk", "Barcode", "Nomor Panggil", "Status", "Harga", "Tanggal Pengadaan"}
	body := make([][]any, len(copies))
	for i, c := range copies {
		acquired := ""
		if c.AcquiredOn != nil {
			acquired = formatDate(*c.AcquiredOn)
		}
		body[i] = []any{c.AccessionNumber, c.Barcode, c.CallNumber, string(c.Status), c.Price, acquired}
	}
	if err := writeXLSXSheet(f, sheet, headerStyle, headers, body); err != nil {
		return nil, fmt.Errorf("accession register write: %w", err)
	}
	return writeXLSXBuffer(f)
}

func writeXLSXBuffer(f *excelize.File) ([]byte, error) {
	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		return nil, fmt.Errorf("write xlsx: %w", err)
	}
	return buf.Bytes(), nil
}
