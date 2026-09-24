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
