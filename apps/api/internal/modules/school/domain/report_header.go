package domain

import "strings"

// MaxReportHeaderLines is the most text lines a tenant's kop laporan may
// carry (school name, address, contact, accreditation, ...).
const MaxReportHeaderLines = 5

// MaxReportHeaderSigners caps the default signer list a tenant configures
// (Kepala Sekolah, Wali Kelas, ...); a report picks the ones it needs.
const MaxReportHeaderSigners = 5

// EmphasisAuto is ReportHeader.Emphasis' sentinel for "no line explicitly
// chosen": ResolveEmphasis picks one automatically instead of a stored
// index. A tenant that has never configured a kop laporan gets this, not
// 0, so an empty Lines list (or one nobody has looked at yet) never
// silently "chooses" the first line.
const EmphasisAuto = -1

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
// which of those lines is the school name (see ResolveEmphasis), the
// place name used in a report's "Denpasar, 1 September 2026" line, and
// the default signers a report's export dialog offers.
type ReportHeader struct {
	ShowLogo bool
	Lines    []string
	// Emphasis is the index into Lines that is the school name, rendered
	// bold and visibly larger than the rest (reportdoc.Letterhead.Emphasis).
	// EmphasisAuto lets ResolveEmphasis pick it.
	Emphasis int
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
	if len(in.Lines) > 0 && in.Emphasis != EmphasisAuto && (in.Emphasis < 0 || in.Emphasis >= len(in.Lines)) {
		return ErrReportHeaderInvalidEmphasis
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

// ResolveEmphasis picks which of lines is the school name: emphasis
// itself when it is a valid index, otherwise the line equal to
// tenantName (case-insensitive), otherwise the second-to-last line (the
// common "Foundation" / "School Name" / "Address" / "Phone" shape, where
// the school name is not the first line but also not the very last),
// clamped to a valid index for however many lines there actually are.
// Called at render time (school/service.ReportLetterhead), not stored,
// so a tenant's own explicit choice (including EmphasisAuto) is never
// silently overwritten by this heuristic on the next save.
func ResolveEmphasis(emphasis int, lines []string, tenantName string) int {
	if emphasis >= 0 && emphasis < len(lines) {
		return emphasis
	}
	if len(lines) == 0 {
		return 0
	}
	tenantName = strings.TrimSpace(tenantName)
	for i, line := range lines {
		if tenantName != "" && strings.EqualFold(strings.TrimSpace(line), tenantName) {
			return i
		}
	}
	idx := len(lines) - 2
	if idx < 0 {
		idx = 0
	}
	return idx
}
