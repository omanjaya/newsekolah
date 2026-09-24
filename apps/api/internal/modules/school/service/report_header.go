package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// reportHeaderSettingKey is the single tenant_settings row a tenant's kop
// laporan lives under -- one JSON blob, unlike branding's one-row-per-field
// "branding.*" keys, since there is no reason another part of the app
// would want to read just one field of it.
const reportHeaderSettingKey = "report_header.config"

// reportHeaderJSON is the storage/wire shape for domain.ReportHeader, kept
// separate from the domain type so a JSON field rename never has to touch
// domain (and so json struct tags -- an encoding detail -- do not leak
// into it).
type reportHeaderJSON struct {
	ShowLogo bool                     `json:"show_logo"`
	Lines    []string                 `json:"lines"`
	Place    string                   `json:"place"`
	Signers  []reportHeaderSignerJSON `json:"signers"`
}

type reportHeaderSignerJSON struct {
	RoleLabel string `json:"role_label"`
	Name      string `json:"name"`
	IDLabel   string `json:"id_label"`
	IDNumber  string `json:"id_number"`
}

func toReportHeaderJSON(h domain.ReportHeader) reportHeaderJSON {
	signers := make([]reportHeaderSignerJSON, len(h.Signers))
	for i, s := range h.Signers {
		signers[i] = reportHeaderSignerJSON{RoleLabel: s.RoleLabel, Name: s.Name, IDLabel: s.IDLabel, IDNumber: s.IDNumber}
	}
	return reportHeaderJSON{ShowLogo: h.ShowLogo, Lines: h.Lines, Place: h.Place, Signers: signers}
}

func (j reportHeaderJSON) toDomain() domain.ReportHeader {
	signers := make([]domain.ReportHeaderSigner, len(j.Signers))
	for i, s := range j.Signers {
		signers[i] = domain.ReportHeaderSigner{RoleLabel: s.RoleLabel, Name: s.Name, IDLabel: s.IDLabel, IDNumber: s.IDNumber}
	}
	return domain.ReportHeader{ShowLogo: j.ShowLogo, Lines: j.Lines, Place: j.Place, Signers: signers}
}

// ReportHeader returns tenantID's configured kop laporan, or a zero value
// (no logo, no lines, no signers) when it has not configured one yet.
func (s *Service) ReportHeader(ctx context.Context, tenantID uuid.UUID) (domain.ReportHeader, error) {
	var raw json.RawMessage
	var found bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		raw, found, err = s.repo.GetTenantSettingJSON(ctx, tenantID, reportHeaderSettingKey)
		return err
	})
	if err != nil {
		return domain.ReportHeader{}, err
	}
	if !found {
		return domain.ReportHeader{}, nil
	}
	var j reportHeaderJSON
	if err := json.Unmarshal(raw, &j); err != nil {
		return domain.ReportHeader{}, fmt.Errorf("unmarshal report header: %w", err)
	}
	return j.toDomain(), nil
}

// UpdateReportHeader validates and stores tenantID's kop laporan.
func (s *Service) UpdateReportHeader(ctx context.Context, tenantID, actorID uuid.UUID, in domain.ReportHeader) (domain.ReportHeader, error) {
	if err := domain.ValidateReportHeaderWrite(in); err != nil {
		return domain.ReportHeader{}, err
	}
	raw, err := json.Marshal(toReportHeaderJSON(in))
	if err != nil {
		return domain.ReportHeader{}, fmt.Errorf("marshal report header: %w", err)
	}
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		return s.repo.SetTenantSettingJSON(ctx, tenantID, actorID, reportHeaderSettingKey, raw)
	})
	if err != nil {
		return domain.ReportHeader{}, err
	}
	return in, nil
}

// reportLogoMaxBytes bounds how much of a branding logo object
// ReportLetterhead downloads to embed -- the same cap ConfirmLogoUpload
// enforces on the way in.
const reportLogoMaxBytes = domain.BrandingLogoMaxBytes

// ReportLetterhead builds a reportdoc.Letterhead and reportdoc.Signature
// for tenantID from its configured report header and, when ShowLogo is
// set, the tenant's branding logo -- read as raw bytes via platform/storage
// rather than the presigned URL Branding() returns, since reportdoc embeds
// a document's letterhead server-side, not in a browser. Only a PNG or
// JPEG logo can be embedded (RenderXLSX/RenderPDF's own constraint,
// matching platform/documents' placeLetterhead); a WebP or SVG branding
// logo is silently skipped here -- the configured text lines still render
// -- rather than failing the whole report. The returned Signature has no
// Date: that is per-report context (e.g. the attendance date), which the
// caller fills in.
//
// This is the exported helper other modules call (see
// reportdoc.LetterheadSource's doc comment for the narrow-adapter wiring
// pattern) rather than importing this package directly.
func (s *Service) ReportLetterhead(ctx context.Context, tenantID uuid.UUID) (*reportdoc.Letterhead, *reportdoc.Signature, error) {
	header, err := s.ReportHeader(ctx, tenantID)
	if err != nil {
		return nil, nil, err
	}

	var logo []byte
	if header.ShowLogo && s.storage != nil {
		if b, err := s.reportLogoBytes(ctx, tenantID); err == nil {
			logo = b
		}
		// A failed/unsupported logo read degrades to a text-only
		// letterhead rather than failing the whole report.
	}

	var lh *reportdoc.Letterhead
	if len(logo) > 0 || len(header.Lines) > 0 {
		lh = &reportdoc.Letterhead{Logo: logo, Lines: header.Lines}
	}

	var sig *reportdoc.Signature
	if header.Place != "" || len(header.Signers) > 0 {
		signers := make([]reportdoc.Signer, len(header.Signers))
		for i, sg := range header.Signers {
			signers[i] = reportdoc.Signer{RoleLabel: sg.RoleLabel, Name: sg.Name, IDLabel: sg.IDLabel, IDNumber: sg.IDNumber}
		}
		sig = &reportdoc.Signature{Place: header.Place, Signers: signers}
	}
	return lh, sig, nil
}

// reportLogoBytes fetches the tenant's branding logo object, returning
// (nil, nil) when there is none configured or its mime is not one
// RenderXLSX/RenderPDF can embed (PNG/JPEG only).
func (s *Service) reportLogoBytes(ctx context.Context, tenantID uuid.UUID) ([]byte, error) {
	var settings map[string]string
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		settings, err = s.repo.ListBrandingSettings(ctx, tenantID)
		return err
	})
	if err != nil {
		return nil, err
	}
	key := settings["branding.logo_object_key"]
	mime := settings["branding.logo_mime"]
	if key == "" || (mime != "image/png" && mime != "image/jpeg") {
		return nil, nil
	}
	return s.storage.DownloadBounded(ctx, key, reportLogoMaxBytes)
}
