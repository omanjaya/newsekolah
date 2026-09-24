package service

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

func sampleMonthlyReport() MonthlyReport {
	return MonthlyReport{
		Month:           time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC),
		LibraryName:     "Perpustakaan SMA Negeri 1 Denpasar",
		TotalTitles:     842,
		TotalCopies:     1310,
		TitlesAdded:     12,
		CopiesAdded:     18,
		MembersTotal:    645,
		VisitsThisMonth: 1204,
		AvgVisitsPerDay: 40.1,
		Loans:           231,
		Returns:         210,
		LateReturns:     14,
		FinesRecorded:   35000,
		TopTitles: []MostBorrowedTitle{
			{
				Title:     TitleWithAvailability{Title: domain.Title{Title: "Laskar Pelangi", Author: "Andrea Hirata"}},
				LoanCount: 12,
			},
		},
		TopBorrowers: []TopBorrower{
			{MemberName: "Citra Dewi", ClassName: "X-1", LoanCount: 5},
		},
		VisitsPerClass: []ClassCount{{ClassName: "X-1", Count: 40}},
	}
}

// renderMonthlyReportPDF is the pure rendering step MonthlyReportPDF
// wraps around a database call -- see monthly_report.go's doc comment
// for why this report keeps its own fixed layout rather than moving onto
// reportdoc.Document, while still drawing the tenant's configured
// letterhead/signature through reportdoc.DrawLetterhead/DrawSignature.

func TestRenderMonthlyReportPDFWithoutLetterheadOrSignatureUsesFallbacks(t *testing.T) {
	pdf, err := renderMonthlyReportPDF(sampleMonthlyReport(), nil, nil)
	require.NoError(t, err)
	require.NotEmpty(t, pdf)
	assert.Equal(t, "%PDF", string(pdf[:4]))
}

func TestRenderMonthlyReportPDFWithLetterheadAndSignature(t *testing.T) {
	letterhead := &reportdoc.Letterhead{
		Lines:    []string{"Yayasan Dharma Praja", "SMA Negeri 1 Denpasar", "Jl. Kamboja No. 4"},
		Emphasis: 1,
	}
	signature := &reportdoc.Signature{
		Place: "Denpasar", Date: "24 September 2026",
		Signers: []reportdoc.Signer{
			{RoleLabel: "Pustakawan", Name: "Ni Made Sari"},
			{RoleLabel: "Kepala Sekolah", Name: "I Wayan Arta"},
		},
	}

	withHeader, err := renderMonthlyReportPDF(sampleMonthlyReport(), letterhead, signature)
	require.NoError(t, err)
	require.NotEmpty(t, withHeader)
	assert.Equal(t, "%PDF", string(withHeader[:4]))

	withoutHeader, err := renderMonthlyReportPDF(sampleMonthlyReport(), nil, nil)
	require.NoError(t, err)
	assert.NotEqual(t, withHeader, withoutHeader, "a configured letterhead/signature must change the rendered file")
}

func TestRenderMonthlyReportPDFSignatureWithNoSignersUsesFallbackBlock(t *testing.T) {
	// A Signature with a Place/Date but zero Signers (e.g. a tenant that
	// configured "Denpasar" but no signers yet) must still fall back to
	// the old blank-line placeholder rather than an empty reportdoc
	// signature block.
	signature := &reportdoc.Signature{Place: "Denpasar", Date: "24 September 2026"}
	pdf, err := renderMonthlyReportPDF(sampleMonthlyReport(), nil, signature)
	require.NoError(t, err)
	require.NotEmpty(t, pdf)
}
