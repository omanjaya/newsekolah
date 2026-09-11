package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
)

// Labels and membership cards are printed server-side, the same way the
// permits module renders its letters (platform/documents), rather than in
// the browser: the client only ever downloads a finished PDF. Unlike a
// warning letter or a leave letter these are reprintable shop-floor
// artifacts, not audited documents, so they are rendered on demand and
// never numbered, stored as an asset, or given a verification code.
// Copy labels are the one exception to the shared documents.Renderer: see
// service/labels.go for why they render directly with fpdf.

// memberCardTemplate renders the QR value and a Code128-shaped monospace
// fallback as plain text -- platform/documents has no barcode-drawing
// primitive, so the scannable value is the member_no rendered both as
// visible text and as the element's id (id="member-barcode-<member_no>")
// so a client that can draw a real barcode/QR code can find the value to
// encode without re-parsing the PDF.
const memberCardTemplate = `
<h1>{{.SchoolName}}</h1>
<h2>Kartu Anggota Perpustakaan</h2>
<p>{{.MemberName}}</p>
<p>No. Anggota: {{.MemberNo}}</p>
<p>Kelas: {{.ClassName}}</p>
<p>Berlaku s.d.: {{.ValidUntil}}</p>
<p>Batas pinjam: {{.MaxActiveLoans}} judul, {{.LoanDays}} hari</p>
<div id="member-barcode-{{.MemberNo}}" data-member-no="{{.MemberNo}}">{{.MemberNo}}</div>
`

const clearanceLetterTemplate = `
<h1>{{.SchoolName}}</h1>
<h2>Surat Keterangan Bebas Pustaka</h2>
<p>Menerangkan bahwa:</p>
<p>Nama: {{.MemberName}}</p>
<p>No. Anggota: {{.MemberNo}}</p>
<p>Kelas: {{.ClassName}}</p>
<p>Tidak memiliki pinjaman aktif maupun denda yang belum diselesaikan pada Perpustakaan {{.SchoolName}} per tanggal {{.IssuedOn}}.</p>
`

// PrintCopyLabel renders one copy's spine/barcode label as a single-label
// PDF, delegating to the batch renderer (old app kept a single-item
// convenience endpoint alongside the batch one; the rebuild does the
// same by reusing it rather than a second template).
func (s *Service) PrintCopyLabel(ctx context.Context, tenantID, copyID uuid.UUID) ([]byte, error) {
	return s.PrintCopyLabels(ctx, tenantID, []uuid.UUID{copyID})
}

// memberCardVars resolves everything the card and clearance letter
// templates need for one member, falling back gracefully when the member
// or class directory lookups come up empty (a card can still be printed
// for a user who is not yet a registered library_members row).
func (s *Service) memberCardVars(ctx context.Context, tenantID, memberUserID uuid.UUID) map[string]any {
	name := memberUserID.String()
	if s.members != nil {
		if resolved, err := s.members.UserDisplayName(ctx, tenantID, memberUserID); err == nil && resolved != "" {
			name = resolved
		}
	}
	className, _ := s.repo.GetActiveClassNameForStudent(ctx, tenantID, memberUserID)

	memberNo, validUntil := "-", "-"
	maxLoanItems, loanDays := 0, 0
	if member, found, err := s.repo.GetMember(ctx, tenantID, memberUserID); err == nil && found {
		memberNo = member.MemberNo
		if member.ValidUntil != nil {
			validUntil = member.ValidUntil.Format("2006-01-02")
		}
		if mt, foundType, err := s.repo.GetMemberType(ctx, tenantID, member.MemberTypeID); err == nil && foundType {
			maxLoanItems, loanDays = mt.MaxLoanItems, mt.MaxLoanDays
		}
	}
	if maxLoanItems == 0 {
		if policy, err := s.Policy(ctx, tenantID); err == nil {
			maxLoanItems, loanDays = policy.MaxActiveLoans, policy.LoanDays
		}
	}
	schoolName := ""
	if policy, err := s.Policy(ctx, tenantID); err == nil {
		schoolName = policy.Name
	}
	return map[string]any{
		"SchoolName": schoolName, "MemberName": name, "MemberNo": memberNo, "ClassName": className,
		"ValidUntil": validUntil, "MaxActiveLoans": maxLoanItems, "LoanDays": loanDays,
	}
}

// PrintMemberCard renders a member's library card as a PDF: name, member
// number, class, validity, and a scannable member-number element (old app:
// library_cards.go:32-153).
func (s *Service) PrintMemberCard(ctx context.Context, tenantID, memberUserID uuid.UUID) ([]byte, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	rendered, err := s.renderer.Render(ctx, documents.Template{Engine: documents.EngineHTML, Body: memberCardTemplate}, s.memberCardVars(ctx, tenantID, memberUserID))
	if err != nil {
		return nil, fmt.Errorf("render member card: %w", err)
	}
	return rendered.PDF, nil
}

// PrintClearanceLetter renders the "bebas pustaka" clearance letter for a
// member already granted clearance; callers should call Clearance first
// and only print once it succeeds.
func (s *Service) PrintClearanceLetter(ctx context.Context, tenantID, memberUserID uuid.UUID) ([]byte, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	member, found, err := s.repo.GetMember(ctx, tenantID, memberUserID)
	if err != nil {
		return nil, err
	}
	if !found || member.Status != domain.MemberCleared {
		return nil, domain.ErrMemberNotClearable
	}
	vars := s.memberCardVars(ctx, tenantID, memberUserID)
	vars["IssuedOn"] = s.clock.Now().Format("2006-01-02")
	rendered, err := s.renderer.Render(ctx, documents.Template{Engine: documents.EngineHTML, Body: clearanceLetterTemplate}, vars)
	if err != nil {
		return nil, fmt.Errorf("render clearance letter: %w", err)
	}
	return rendered.PDF, nil
}
