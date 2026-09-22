package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
)

// IssueDocumentInput describes any numbered, verifiable PDF another module
// wants issued through the shared document pipeline (templates, sequences,
// verification codes, issued_documents). Warning letters use it; leave
// letters keep their own path because they also update the request row.
type IssueDocumentInput struct {
	Kind              domain.TemplateKind
	NumberingTemplate string
	// SeqPad zero-pads the {{seq}} numbering placeholder to this many
	// digits (0: unpadded, the historical behaviour every existing caller
	// keeps by leaving this unset).
	SeqPad int
	// ExtraNumberingVars adds placeholders beyond the standard {{seq}},
	// {{month}}, {{month_roman}}, {{year}} set (domain.NumberingVars) --
	// e.g. discipline's {{sp_level_number}} -- without widening that
	// standard set for every other caller.
	ExtraNumberingVars map[string]string
	EntityType         string
	EntityID           uuid.UUID
	AcademicYearID     uuid.UUID
	IssuerUserID       uuid.UUID
	// ObjectKey is where the PDF lands in the bucket; the caller owns the
	// naming so its own module directory stays predictable.
	ObjectKey   string
	Vars        map[string]any
	BuiltinHTML string
}

type IssuedDocumentResult struct {
	Number           string
	AssetID          uuid.NullUUID
	VerificationCode string
	IssuedAt         time.Time
	PDF              []byte
}

// IssueDocument numbers, renders, stores and records one document inside
// the caller's tenant transaction (WithTenantTx joins an ambient one).
func (s *Service) IssueDocument(ctx context.Context, tenantID uuid.UUID, in IssueDocumentInput) (IssuedDocumentResult, error) {
	var out IssuedDocumentResult
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		now := s.clock.Now()
		seq, err := s.repo.NextSequenceValue(ctx, tenantID, string(in.Kind), in.AcademicYearID)
		if err != nil {
			return fmt.Errorf("next document number: %w", err)
		}
		numberingVars := domain.NumberingVars(seq, now)
		if in.SeqPad > 0 {
			numberingVars["seq"] = fmt.Sprintf("%0*d", in.SeqPad, seq)
		}
		for k, v := range in.ExtraNumberingVars {
			numberingVars[k] = v
		}
		number := domain.RenderNumberingTemplate(in.NumberingTemplate, numberingVars)
		code, codeHash, err := documents.NewVerificationCode(s.cfg.DocumentSigningKey)
		if err != nil {
			return err
		}
		vars := make(map[string]any, len(in.Vars)+3)
		for k, v := range in.Vars {
			vars[k] = v
		}
		vars["letter_number"] = number
		vars["issued_at"] = now.Format("02-01-2006")
		vars["verification_code"] = code

		rendered, err := s.renderer.Render(ctx, s.templateFor(ctx, tenantID, in.Kind, in.BuiltinHTML), vars)
		if err != nil {
			return fmt.Errorf("render %s: %w", in.Kind, err)
		}
		sum := sha256.Sum256(rendered.PDF)
		var assetID uuid.NullUUID
		if s.storage != nil && len(rendered.PDF) > 0 {
			if err := s.storage.PutObject(ctx, in.ObjectKey, rendered.PDF, "application/pdf"); err != nil {
				return fmt.Errorf("store %s: %w", in.Kind, err)
			}
			id, err := s.repo.CreateAsset(ctx, tenantID, s.cfg.Bucket, in.ObjectKey, "application/pdf", int64(len(rendered.PDF)), hex.EncodeToString(sum[:]), "document", "private", in.IssuerUserID)
			if err != nil {
				return fmt.Errorf("create %s asset: %w", in.Kind, err)
			}
			assetID = uuid.NullUUID{UUID: id, Valid: true}
		}
		if _, err := s.repo.CreateIssuedDocument(ctx, domain.IssuedDocument{
			TenantID: tenantID, Kind: string(in.Kind), EntityType: in.EntityType, EntityID: in.EntityID, Number: number,
			AssetID: assetID, SHA256: hex.EncodeToString(sum[:]), VerificationCodeHash: codeHash,
			IssuedBy: uuid.NullUUID{UUID: in.IssuerUserID, Valid: true},
		}); err != nil {
			return err
		}
		if err := audit.Record(ctx, tenantID, "document.issue", in.EntityType, in.EntityID, nil, map[string]any{
			"kind": in.Kind, "number": number, "asset_id": assetID,
		}); err != nil {
			return err
		}
		out = IssuedDocumentResult{Number: number, AssetID: assetID, VerificationCode: code, IssuedAt: now, PDF: rendered.PDF}
		return nil
	})
	return out, err
}

// DocumentDownloadURLForAsset presigns any asset this module stored, for
// callers that keep the asset id on their own rows (warning letters).
func (s *Service) DocumentDownloadURLForAsset(ctx context.Context, tenantID, assetID uuid.UUID) (string, error) {
	if s.storage == nil {
		return "", domain.ErrDocumentNotFound
	}
	var objectKey string
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		objectKey, err = s.repo.GetAssetObjectKey(ctx, tenantID, assetID)
		return err
	})
	if err != nil {
		return "", err
	}
	u, err := s.storage.PresignedGetURL(ctx, objectKey, storage.DefaultUploadURLTTL)
	if err != nil {
		return "", fmt.Errorf("presign document: %w", err)
	}
	return u.String(), nil
}

// templateFor loads the tenant's default template for kind, with its
// letterhead image bytes loaded (if the template names one) so Render can
// place it above the body -- see documents.Template.Letterhead and
// leaveLetterTemplate's identical loading, which this mirrors so every
// IssueDocument caller (e.g. warning letters), not just leave letters,
// gets its letterhead.
func (s *Service) templateFor(ctx context.Context, tenantID uuid.UUID, kind domain.TemplateKind, builtin string) documents.Template {
	t, ok, err := s.repo.GetDefaultTemplate(ctx, tenantID, kind)
	if err != nil || !ok {
		return documents.Template{Engine: documents.EngineHTML, Body: builtin}
	}
	out := documents.Template{Engine: documents.Engine(t.Engine), Body: t.Body}
	if s.storage != nil && t.LetterheadAssetID.Valid {
		if key, err := s.repo.GetAssetObjectKey(ctx, tenantID, t.LetterheadAssetID.UUID); err == nil {
			if bytes, err := s.storage.GetObject(ctx, key); err == nil {
				out.Letterhead = bytes
			}
		}
	}
	return out
}
