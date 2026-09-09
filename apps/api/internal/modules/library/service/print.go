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

const copyLabelTemplate = `
<h1>{{.Title}}</h1>
<p>{{.Author}}</p>
<p>{{.Classification}}</p>
<p>Barcode: {{.Barcode}}</p>
`

const memberCardTemplate = `
<h1>{{.SchoolName}}</h1>
<h2>Kartu Anggota Perpustakaan</h2>
<p>{{.MemberName}}</p>
<p>Batas pinjam: {{.MaxActiveLoans}} judul, {{.LoanDays}} hari</p>
`

// PrintCopyLabel renders one copy's spine/barcode label as a PDF.
func (s *Service) PrintCopyLabel(ctx context.Context, tenantID, copyID uuid.UUID) ([]byte, error) {
	item, found, err := s.repo.GetCopy(ctx, tenantID, copyID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, domain.ErrCopyNotFound
	}
	title, found, err := s.repo.GetTitle(ctx, tenantID, item.TitleID)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, domain.ErrTitleNotFound
	}
	rendered, err := s.renderer.Render(ctx, documents.Template{Engine: documents.EngineHTML, Body: copyLabelTemplate}, map[string]any{
		"Title": title.Title, "Author": title.Author, "Classification": title.Classification, "Barcode": item.Barcode,
	})
	if err != nil {
		return nil, fmt.Errorf("render copy label: %w", err)
	}
	return rendered.PDF, nil
}

// PrintMemberCard renders a member's library card as a PDF.
func (s *Service) PrintMemberCard(ctx context.Context, tenantID, memberUserID uuid.UUID) ([]byte, error) {
	policy, err := s.Policy(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	name := memberUserID.String()
	if s.members != nil {
		if resolved, err := s.members.UserDisplayName(ctx, tenantID, memberUserID); err == nil && resolved != "" {
			name = resolved
		}
	}
	rendered, err := s.renderer.Render(ctx, documents.Template{Engine: documents.EngineHTML, Body: memberCardTemplate}, map[string]any{
		"SchoolName": "", "MemberName": name, "MaxActiveLoans": policy.MaxActiveLoans, "LoanDays": policy.LoanDays,
	})
	if err != nil {
		return nil, fmt.Errorf("render member card: %w", err)
	}
	return rendered.PDF, nil
}
