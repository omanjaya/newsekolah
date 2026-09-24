package domain

// MaxReportHeaderLines is the most text lines a tenant's kop laporan may
// carry (school name, address, contact, accreditation, ...).
const MaxReportHeaderLines = 5

// MaxReportHeaderSigners caps the default signer list a tenant configures
// (Kepala Sekolah, Wali Kelas, ...); a report picks the ones it needs.
const MaxReportHeaderSigners = 5

// ReportHeaderSigner is one default signer offered to a report's
// signature block: a role, a name, and an optional identifier (NIP, NIK).
type ReportHeaderSigner struct {
	RoleLabel string
	Name      string
	IDLabel   string
	IDNumber  string
}

// ReportHeader is a tenant's configured kop laporan (report letterhead):
// whether to print the tenant's branding logo, the text lines beneath it,
// the place name used in a report's "Denpasar, 1 September 2026" line,
// and the default signers a report's export dialog offers.
type ReportHeader struct {
	ShowLogo bool
	Lines    []string
	Place    string
	Signers  []ReportHeaderSigner
}

// ValidateReportHeaderWrite mirrors the limits ReportHeader's consumers
// (RenderXLSX/RenderPDF's letterhead and signature blocks) can actually
// lay out.
func ValidateReportHeaderWrite(in ReportHeader) error {
	if len(in.Lines) > MaxReportHeaderLines {
		return ErrReportHeaderTooManyLines
	}
	for _, line := range in.Lines {
		if len(line) > 200 {
			return ErrReportHeaderLineTooLong
		}
	}
	if len(in.Place) > 80 {
		return ErrReportHeaderPlaceTooLong
	}
	if len(in.Signers) > MaxReportHeaderSigners {
		return ErrReportHeaderTooManySigners
	}
	for _, s := range in.Signers {
		if s.RoleLabel == "" || s.Name == "" {
			return ErrReportHeaderSignerInvalid
		}
	}
	return nil
}
