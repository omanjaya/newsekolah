package domain

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateReportHeaderWriteValid(t *testing.T) {
	err := ValidateReportHeaderWrite(ReportHeader{
		ShowLogo: true,
		Lines:    []string{"SMA Negeri 1", "Jl. Merdeka"},
		Place:    "Denpasar",
		Signers:  []ReportHeaderSigner{{RoleLabel: "Kepala Sekolah", Name: "Budi"}},
	})
	require.NoError(t, err)
}

func TestValidateReportHeaderWriteEmptyIsValid(t *testing.T) {
	require.NoError(t, ValidateReportHeaderWrite(ReportHeader{}))
}

func TestValidateReportHeaderWriteTooManyLines(t *testing.T) {
	err := ValidateReportHeaderWrite(ReportHeader{Lines: []string{"1", "2", "3", "4", "5", "6"}})
	assert.ErrorIs(t, err, ErrReportHeaderTooManyLines)
}

func TestValidateReportHeaderWriteLineTooLong(t *testing.T) {
	err := ValidateReportHeaderWrite(ReportHeader{Lines: []string{strings.Repeat("x", 201)}})
	assert.ErrorIs(t, err, ErrReportHeaderLineTooLong)
}

func TestValidateReportHeaderWritePlaceTooLong(t *testing.T) {
	err := ValidateReportHeaderWrite(ReportHeader{Place: strings.Repeat("x", 81)})
	assert.ErrorIs(t, err, ErrReportHeaderPlaceTooLong)
}

func TestValidateReportHeaderWriteTooManySigners(t *testing.T) {
	signers := make([]ReportHeaderSigner, 6)
	for i := range signers {
		signers[i] = ReportHeaderSigner{RoleLabel: "Role", Name: "Name"}
	}
	err := ValidateReportHeaderWrite(ReportHeader{Signers: signers})
	assert.ErrorIs(t, err, ErrReportHeaderTooManySigners)
}

func TestValidateReportHeaderWriteSignerMissingName(t *testing.T) {
	err := ValidateReportHeaderWrite(ReportHeader{Signers: []ReportHeaderSigner{{RoleLabel: "Kepala Sekolah"}}})
	assert.ErrorIs(t, err, ErrReportHeaderSignerInvalid)
}

func TestValidateReportHeaderWriteSignerMissingRole(t *testing.T) {
	err := ValidateReportHeaderWrite(ReportHeader{Signers: []ReportHeaderSigner{{Name: "Budi"}}})
	assert.ErrorIs(t, err, ErrReportHeaderSignerInvalid)
}

func TestValidateReportHeaderWriteEmphasisAutoIsValid(t *testing.T) {
	err := ValidateReportHeaderWrite(ReportHeader{Lines: []string{"A", "B"}, Emphasis: EmphasisAuto})
	require.NoError(t, err)
}

func TestValidateReportHeaderWriteEmphasisInRangeIsValid(t *testing.T) {
	err := ValidateReportHeaderWrite(ReportHeader{Lines: []string{"A", "B"}, Emphasis: 1})
	require.NoError(t, err)
}

func TestValidateReportHeaderWriteEmphasisOutOfRange(t *testing.T) {
	err := ValidateReportHeaderWrite(ReportHeader{Lines: []string{"A", "B"}, Emphasis: 2})
	assert.ErrorIs(t, err, ErrReportHeaderInvalidEmphasis)
}

func TestValidateReportHeaderWriteEmphasisNegativeButNotAuto(t *testing.T) {
	err := ValidateReportHeaderWrite(ReportHeader{Lines: []string{"A"}, Emphasis: -2})
	assert.ErrorIs(t, err, ErrReportHeaderInvalidEmphasis)
}

func TestResolveEmphasisExplicitIndexWins(t *testing.T) {
	got := ResolveEmphasis(0, []string{"Yayasan X", "SMA Negeri 1", "Alamat"}, "SMA Negeri 1")
	assert.Equal(t, 0, got, "an explicit valid index is used as-is, even if another line matches the tenant name")
}

func TestResolveEmphasisMatchesTenantName(t *testing.T) {
	got := ResolveEmphasis(EmphasisAuto, []string{"Yayasan X", "SMA Negeri 1", "Alamat"}, "SMA Negeri 1")
	assert.Equal(t, 1, got)
}

func TestResolveEmphasisMatchIsCaseInsensitive(t *testing.T) {
	got := ResolveEmphasis(EmphasisAuto, []string{"sma negeri 1"}, "SMA Negeri 1")
	assert.Equal(t, 0, got)
}

func TestResolveEmphasisFallsBackToSecondToLast(t *testing.T) {
	got := ResolveEmphasis(EmphasisAuto, []string{"Yayasan X", "SMA Negeri 1", "Alamat", "Telepon"}, "No Match")
	assert.Equal(t, 2, got)
}

func TestResolveEmphasisFallsBackToFirstLineWhenTooFewLines(t *testing.T) {
	assert.Equal(t, 0, ResolveEmphasis(EmphasisAuto, []string{"Only Line"}, "No Match"))
	assert.Equal(t, 0, ResolveEmphasis(EmphasisAuto, []string{"Line A", "Line B"}, "No Match"))
}

func TestResolveEmphasisNoLinesReturnsZero(t *testing.T) {
	assert.Equal(t, 0, ResolveEmphasis(EmphasisAuto, nil, "SMA Negeri 1"))
}

func TestResolveEmphasisOutOfRangeExplicitFallsBackToAuto(t *testing.T) {
	got := ResolveEmphasis(99, []string{"Yayasan X", "SMA Negeri 1"}, "SMA Negeri 1")
	assert.Equal(t, 1, got, "an out-of-range stored value must not panic or be used as-is")
}
