package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/audit"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
)

// counselingAuditPayload is the audit-safe subset of a counseling note's
// fields: structured metadata only. Title and the separately encrypted
// Content, FollowUpPlan, CareerGoals and ProblemDescription never reach
// audit_logs -- a counseling note is sensitive by design (see the
// module's crypto.Sealer use), and the audit trail must prove a note was
// created, changed or read without becoming a second, unencrypted copy of
// what it says.
func counselingAuditPayload(c domain.Counseling) map[string]any {
	return map[string]any{
		"student_user_id":   c.StudentUserID,
		"counselor_user_id": c.CounselorUserID,
		"session_at":        c.SessionAt,
		"kind":              c.Kind,
		"topic":             c.Topic,
		"visibility":        c.Visibility,
	}
}

type CounselingInput struct {
	StudentUserID      uuid.UUID
	SessionAt          time.Time
	Kind               domain.CounselingKind
	Topic              domain.CounselingTopic
	Title              string
	Content            string
	FollowUpPlan       string
	CareerGoals        string
	ProblemDescription string
	Visibility         domain.Visibility
}

func (in *CounselingInput) validate() error {
	if in.Topic == "" {
		in.Topic = domain.DefaultCounselingTopic
	}
	if in.StudentUserID == uuid.Nil || in.SessionAt.IsZero() || !in.Kind.Valid() || !in.Topic.Valid() || !in.Visibility.Valid() {
		return domain.ErrInvalidInput
	}
	if strings.TrimSpace(in.Title) == "" || strings.TrimSpace(in.Content) == "" {
		return domain.ErrInvalidInput
	}
	return nil
}

func (s *Service) readerRole(ctx context.Context, tenantID, yearID, userID, authorID uuid.UUID) (domain.ReaderRole, error) {
	role := domain.ReaderRole{IsAuthor: userID == authorID}
	var err error
	if role.IsCounselor, err = s.repo.HasActiveDuty(ctx, tenantID, yearID, userID, "counselor", uuid.NullUUID{}); err != nil {
		return role, err
	}
	if role.IsLeadership, err = s.repo.HasActiveDuty(ctx, tenantID, yearID, userID, "leadership", uuid.NullUUID{}); err != nil {
		return role, err
	}
	return role, nil
}

func (s *Service) seal(text string) ([]byte, error) {
	if text == "" {
		return nil, nil
	}
	return s.sealer.Seal([]byte(text))
}

func (s *Service) open(enc EncryptedCounseling) (domain.Counseling, error) {
	c := enc.Counseling
	if len(enc.ContentEncrypted) > 0 {
		plain, err := s.sealer.Open(enc.ContentEncrypted)
		if err != nil {
			return c, err
		}
		c.Content = string(plain)
	}
	if len(enc.FollowUpPlanEncrypted) > 0 {
		plain, err := s.sealer.Open(enc.FollowUpPlanEncrypted)
		if err != nil {
			return c, err
		}
		c.FollowUpPlan = string(plain)
	}
	if len(enc.CareerGoalsEncrypted) > 0 {
		plain, err := s.sealer.Open(enc.CareerGoalsEncrypted)
		if err != nil {
			return c, err
		}
		c.CareerGoals = string(plain)
	}
	if len(enc.ProblemDescriptionEncrypted) > 0 {
		plain, err := s.sealer.Open(enc.ProblemDescriptionEncrypted)
		if err != nil {
			return c, err
		}
		c.ProblemDescription = string(plain)
	}
	return c, nil
}

func (s *Service) CreateCounseling(ctx context.Context, tenantID, counselorUserID uuid.UUID, in CounselingInput) (domain.Counseling, error) {
	if err := in.validate(); err != nil {
		return domain.Counseling{}, err
	}
	var out domain.Counseling
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		if err := requireEligibleStudent(ctx, s.repo, tenantID, yearID, in.StudentUserID); err != nil {
			return err
		}
		content, err := s.seal(in.Content)
		if err != nil {
			return err
		}
		followUp, err := s.seal(in.FollowUpPlan)
		if err != nil {
			return err
		}
		careerGoals, err := s.seal(in.CareerGoals)
		if err != nil {
			return err
		}
		problemDescription, err := s.seal(in.ProblemDescription)
		if err != nil {
			return err
		}
		out, err = s.repo.CreateCounseling(ctx, domain.Counseling{
			TenantID: tenantID, AcademicYearID: yearID, StudentUserID: in.StudentUserID, CounselorUserID: counselorUserID,
			SessionAt: in.SessionAt, Kind: in.Kind, Topic: in.Topic, Title: strings.TrimSpace(in.Title), Visibility: in.Visibility,
		}, content, followUp, careerGoals, problemDescription, s.sealer.KeyID)
		if err != nil {
			return err
		}
		if err := audit.Record(ctx, tenantID, "counseling.create", "counseling", out.ID, nil, counselingAuditPayload(out)); err != nil {
			return err
		}
		out.Content, out.FollowUpPlan, out.CareerGoals, out.ProblemDescription = in.Content, in.FollowUpPlan, in.CareerGoals, in.ProblemDescription
		return nil
	})
	return out, err
}

func (s *Service) UpdateCounseling(ctx context.Context, tenantID, id, actorUserID uuid.UUID, in CounselingInput) (domain.Counseling, error) {
	if err := in.validate(); err != nil {
		return domain.Counseling{}, err
	}
	var out domain.Counseling
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetCounseling(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrCounselingNotFound
		}
		if current.CounselorUserID != actorUserID {
			return domain.ErrCounselingForbidden
		}
		content, err := s.seal(in.Content)
		if err != nil {
			return err
		}
		followUp, err := s.seal(in.FollowUpPlan)
		if err != nil {
			return err
		}
		careerGoals, err := s.seal(in.CareerGoals)
		if err != nil {
			return err
		}
		problemDescription, err := s.seal(in.ProblemDescription)
		if err != nil {
			return err
		}
		next := current.Counseling
		next.SessionAt, next.Kind, next.Topic, next.Title, next.Visibility = in.SessionAt, in.Kind, in.Topic, strings.TrimSpace(in.Title), in.Visibility
		out, err = s.repo.UpdateCounseling(ctx, next, content, followUp, careerGoals, problemDescription, s.sealer.KeyID)
		if err != nil {
			return err
		}
		if err := audit.Record(ctx, tenantID, "counseling.update", "counseling", id, counselingAuditPayload(current.Counseling), counselingAuditPayload(out)); err != nil {
			return err
		}
		out.Content, out.FollowUpPlan, out.CareerGoals, out.ProblemDescription = in.Content, in.FollowUpPlan, in.CareerGoals, in.ProblemDescription
		return nil
	})
	return out, err
}

func (s *Service) GetCounseling(ctx context.Context, tenantID, id, readerUserID uuid.UUID) (domain.Counseling, error) {
	var out domain.Counseling
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		enc, ok, err := s.repo.GetCounseling(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrCounselingNotFound
		}
		role, err := s.readerRole(ctx, tenantID, enc.AcademicYearID, readerUserID, enc.CounselorUserID)
		if err != nil {
			return err
		}
		if !enc.VisibleTo(role) {
			return domain.ErrCounselingForbidden
		}
		out, err = s.open(enc)
		if err != nil {
			return err
		}
		return audit.RecordSimple(ctx, tenantID, "counseling.read", "counseling", id)
	})
	return out, err
}

// ListCounselingsForStudent returns every note the reader may see; bodies
// stay encrypted (empty) on rows outside the reader's visibility.
func (s *Service) ListCounselingsForStudent(ctx context.Context, tenantID, studentID, readerUserID uuid.UUID) ([]domain.Counseling, error) {
	var out []domain.Counseling
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		rows, err := s.repo.ListCounselingsForStudent(ctx, tenantID, yearID, studentID)
		if err != nil {
			return err
		}
		out = make([]domain.Counseling, 0, len(rows))
		for _, enc := range rows {
			role, err := s.readerRole(ctx, tenantID, yearID, readerUserID, enc.CounselorUserID)
			if err != nil {
				return err
			}
			if !enc.VisibleTo(role) {
				continue
			}
			c, err := s.open(enc)
			if err != nil {
				return err
			}
			out = append(out, c)
		}
		return nil
	})
	return out, err
}

func (s *Service) ListMyCounselings(ctx context.Context, tenantID, counselorUserID uuid.UUID, limit, offset int) ([]domain.Counseling, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var out []domain.Counseling
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		rows, err := s.repo.ListCounselingsByCounselor(ctx, tenantID, yearID, counselorUserID, limit, max(offset, 0))
		if err != nil {
			return err
		}
		out = make([]domain.Counseling, 0, len(rows))
		for _, enc := range rows {
			c, err := s.open(enc)
			if err != nil {
				return err
			}
			out = append(out, c)
		}
		return nil
	})
	return out, err
}

// ListBKTeamCounselings is the cross-student view for any counselor
// holding duty "counselor": every note its author shared with the whole
// BK team (visibility bk_team), optionally narrowed to one topic.
func (s *Service) ListBKTeamCounselings(ctx context.Context, tenantID, readerUserID uuid.UUID, topic domain.CounselingTopic, limit, offset int) ([]domain.Counseling, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var out []domain.Counseling
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		yearID, err := s.activeYear(ctx, tenantID)
		if err != nil {
			return err
		}
		isCounselor, err := s.repo.HasActiveDuty(ctx, tenantID, yearID, readerUserID, "counselor", uuid.NullUUID{})
		if err != nil {
			return err
		}
		if !isCounselor {
			return domain.ErrCounselingForbidden
		}
		rows, err := s.repo.ListCounselingsByVisibility(ctx, tenantID, yearID, string(topic), limit, max(offset, 0))
		if err != nil {
			return err
		}
		out = make([]domain.Counseling, 0, len(rows))
		for _, enc := range rows {
			c, err := s.open(enc)
			if err != nil {
				return err
			}
			out = append(out, c)
		}
		return nil
	})
	return out, err
}

func (s *Service) DeleteCounseling(ctx context.Context, tenantID, id, actorUserID uuid.UUID) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		current, ok, err := s.repo.GetCounseling(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrCounselingNotFound
		}
		if current.CounselorUserID != actorUserID {
			return domain.ErrCounselingForbidden
		}
		return s.repo.DeleteCounseling(ctx, tenantID, id)
	})
}

// Attachments -- photo evidence on a counseling note, following the same
// presigned-PUT-then-confirm shape as a leave request's evidence
// (permits/service/leaverequest.go): the client uploads straight to
// storage, then confirms so the server can validate, strip metadata and
// record it.

type AttachmentUploadTarget struct {
	UploadURL string
	ObjectKey string
	ExpiresAt time.Time
}

// RequestAttachmentUpload presigns a PUT for a new attachment on note id,
// restricted to the note's author (only the counselor who wrote the note
// attaches evidence to it, matching who may edit the note at all).
func (s *Service) RequestAttachmentUpload(ctx context.Context, tenantID, counselingID, actorUserID uuid.UUID) (AttachmentUploadTarget, error) {
	if s.storage == nil {
		return AttachmentUploadTarget{}, domain.ErrReportUnavailable
	}
	if err := s.requireCounselingOwner(ctx, tenantID, counselingID, actorUserID); err != nil {
		return AttachmentUploadTarget{}, err
	}
	key := fmt.Sprintf("tenants/%s/counseling/%s/%s", tenantID, counselingID, uuid.New())
	u, err := s.storage.PresignedPutURL(ctx, key, storage.DefaultUploadURLTTL)
	if err != nil {
		return AttachmentUploadTarget{}, fmt.Errorf("presign counseling attachment upload: %w", err)
	}
	return AttachmentUploadTarget{UploadURL: u.String(), ObjectKey: key, ExpiresAt: s.clock.Now().Add(storage.DefaultUploadURLTTL)}, nil
}

// ConfirmAttachment validates the uploaded object (JPEG/PNG by sniffing,
// <= Config.AttachmentMaxBytes), re-encodes it to drop EXIF metadata, and
// records it against the note.
func (s *Service) ConfirmAttachment(ctx context.Context, tenantID, counselingID, actorUserID uuid.UUID, objectKey string) (domain.CounselingAttachment, error) {
	if s.storage == nil {
		return domain.CounselingAttachment{}, domain.ErrReportUnavailable
	}
	if err := s.requireCounselingOwner(ctx, tenantID, counselingID, actorUserID); err != nil {
		return domain.CounselingAttachment{}, err
	}
	expectedPrefix := fmt.Sprintf("tenants/%s/counseling/%s/", tenantID, counselingID)
	if len(objectKey) <= len(expectedPrefix) || objectKey[:len(expectedPrefix)] != expectedPrefix {
		return domain.CounselingAttachment{}, domain.ErrAttachmentInvalidType
	}
	raw, err := s.storage.GetObject(ctx, objectKey)
	if err != nil {
		return domain.CounselingAttachment{}, fmt.Errorf("read counseling attachment: %w", err)
	}
	maxBytes := s.cfg.AttachmentMaxBytes
	if maxBytes <= 0 {
		maxBytes = DefaultConfig("").AttachmentMaxBytes
	}
	if int64(len(raw)) > maxBytes {
		return domain.CounselingAttachment{}, domain.ErrAttachmentTooLarge
	}
	clean, mime, err := reencodeAttachmentImage(raw)
	if err != nil {
		return domain.CounselingAttachment{}, err
	}
	cleanKey := objectKey + ".clean"
	if err := s.storage.PutObject(ctx, cleanKey, clean, mime); err != nil {
		return domain.CounselingAttachment{}, fmt.Errorf("store counseling attachment: %w", err)
	}
	sum := sha256.Sum256(clean)

	var out domain.CounselingAttachment
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		assetID, err := s.repo.CreateAsset(ctx, tenantID, s.cfg.Bucket, cleanKey, mime, int64(len(clean)), hex.EncodeToString(sum[:]), "evidence", "private", actorUserID)
		if err != nil {
			return fmt.Errorf("create counseling attachment asset: %w", err)
		}
		out, err = s.repo.CreateCounselingAttachment(ctx, tenantID, counselingID, assetID)
		return err
	})
	return out, err
}

// ListAttachments and AttachmentURL are readable by anyone the note
// itself is visible to (its visibility already governs who reaches the
// content), not just the author.
func (s *Service) ListAttachments(ctx context.Context, tenantID, counselingID, readerUserID uuid.UUID) ([]domain.CounselingAttachment, error) {
	var out []domain.CounselingAttachment
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireCounselingVisible(ctx, tenantID, counselingID, readerUserID); err != nil {
			return err
		}
		var err error
		out, err = s.repo.ListCounselingAttachments(ctx, tenantID, counselingID)
		return err
	})
	return out, err
}

func (s *Service) AttachmentURL(ctx context.Context, tenantID, counselingID, attachmentID, readerUserID uuid.UUID) (string, error) {
	var objectKey string
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.requireCounselingVisible(ctx, tenantID, counselingID, readerUserID); err != nil {
			return err
		}
		att, ok, err := s.repo.GetCounselingAttachment(ctx, tenantID, attachmentID)
		if err != nil {
			return err
		}
		if !ok || att.CounselingID != counselingID {
			return domain.ErrAttachmentNotFound
		}
		asset, ok, err := s.repo.GetAsset(ctx, tenantID, att.AssetID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrAttachmentNotFound
		}
		objectKey = asset.ObjectKey
		return nil
	})
	if err != nil {
		return "", err
	}
	if s.storage == nil {
		return "", domain.ErrAttachmentNotFound
	}
	u, err := s.storage.PresignedGetURL(ctx, objectKey, storage.DefaultUploadURLTTL)
	if err != nil {
		return "", fmt.Errorf("presign counseling attachment: %w", err)
	}
	return u.String(), nil
}

func (s *Service) requireCounselingOwner(ctx context.Context, tenantID, counselingID, actorUserID uuid.UUID) error {
	current, ok, err := s.repo.GetCounseling(ctx, tenantID, counselingID)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrCounselingNotFound
	}
	if current.CounselorUserID != actorUserID {
		return domain.ErrCounselingForbidden
	}
	return nil
}

func (s *Service) requireCounselingVisible(ctx context.Context, tenantID, counselingID, readerUserID uuid.UUID) error {
	enc, ok, err := s.repo.GetCounseling(ctx, tenantID, counselingID)
	if err != nil {
		return err
	}
	if !ok {
		return domain.ErrCounselingNotFound
	}
	role, err := s.readerRole(ctx, tenantID, enc.AcademicYearID, readerUserID, enc.CounselorUserID)
	if err != nil {
		return err
	}
	if !enc.VisibleTo(role) {
		return domain.ErrCounselingForbidden
	}
	return nil
}

// reencodeAttachmentImage decodes JPEG or PNG input and writes it back
// out, which strips EXIF (including GPS) and rejects anything that is not
// really an image regardless of the declared content type. Mirrors
// permits' leave-evidence re-encoding (leaverequest.go).
func reencodeAttachmentImage(raw []byte) ([]byte, string, error) {
	switch http.DetectContentType(raw) {
	case "image/jpeg", "image/png":
	default:
		return nil, "", domain.ErrAttachmentInvalidType
	}
	img, format, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", domain.ErrAttachmentInvalidType
	}
	var buf bytes.Buffer
	if format == "png" {
		if err := png.Encode(&buf, img); err != nil {
			return nil, "", fmt.Errorf("encode png: %w", err)
		}
		return buf.Bytes(), "image/png", nil
	}
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 85}); err != nil {
		return nil, "", fmt.Errorf("encode jpeg: %w", err)
	}
	return buf.Bytes(), "image/jpeg", nil
}

// CounselingReportPDF renders a printable A4 report for one note --
// student, counselor, session details, content and follow-up plan, with a
// signature block for Siswa / Guru BK, matching the old app's printed
// report (counseling.go:949-1001) -- through the same html/template ->
// PDF renderer discipline's warning letters use, stored as an asset
// rather than through permits' numbered-document pipeline since this is
// an internal report, not an issued legal document.
func (s *Service) CounselingReportPDF(ctx context.Context, tenantID, counselingID, readerUserID uuid.UUID) (string, error) {
	if s.renderer == nil || s.storage == nil {
		return "", domain.ErrReportUnavailable
	}
	note, err := s.GetCounseling(ctx, tenantID, counselingID, readerUserID)
	if err != nil {
		return "", err
	}
	var (
		yearID        uuid.UUID
		studentName   string
		counselorName string
	)
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		yearID, err = s.activeYear(ctx, tenantID)
		return err
	})
	if err != nil {
		return "", err
	}
	if snap, err := s.repo.StudentSnapshot(ctx, tenantID, note.StudentUserID, yearID); err == nil {
		studentName = snap.StudentName
	}
	counselorName = s.lookupName(ctx, tenantID, note.CounselorUserID)

	rendered, err := s.renderer.Render(ctx, documents.Template{Engine: documents.EngineHTML, Body: BuiltinCounselingReportHTML}, map[string]any{
		"student_name": studentName, "counselor_name": counselorName, "session_at": note.SessionAt.Format("02-01-2006 15:04"),
		"kind": string(note.Kind), "topic": string(note.Topic), "title": note.Title, "content": note.Content,
		"follow_up_plan": note.FollowUpPlan, "career_goals": note.CareerGoals, "problem_description": note.ProblemDescription,
	})
	if err != nil {
		return "", fmt.Errorf("render counseling report: %w", err)
	}
	objectKey := fmt.Sprintf("tenants/%s/counseling/%s/report.pdf", tenantID, counselingID)
	if err := s.storage.PutObject(ctx, objectKey, rendered.PDF, "application/pdf"); err != nil {
		return "", fmt.Errorf("store counseling report: %w", err)
	}
	u, err := s.storage.PresignedGetURL(ctx, objectKey, storage.DefaultUploadURLTTL)
	if err != nil {
		return "", fmt.Errorf("presign counseling report: %w", err)
	}
	return u.String(), nil
}

// BuiltinCounselingReportHTML is the printable A4 report for one note,
// with the same Siswa/Guru BK signature block the old app printed
// (counseling.go:949-1001).
const BuiltinCounselingReportHTML = `<html><body style="font-family: serif; font-size: 12pt; margin: 40px;">
<h2 style="text-align:center;">LAPORAN KONSELING</h2>
<table>
<tr><td>Siswa</td><td>: {{.student_name}}</td></tr>
<tr><td>Guru BK</td><td>: {{.counselor_name}}</td></tr>
<tr><td>Waktu Sesi</td><td>: {{.session_at}}</td></tr>
<tr><td>Format Sesi</td><td>: {{.kind}}</td></tr>
<tr><td>Topik</td><td>: {{.topic}}</td></tr>
<tr><td>Judul</td><td>: {{.title}}</td></tr>
</table>
<p><strong>Catatan</strong></p>
<p>{{.content}}</p>
{{if .career_goals}}<p><strong>Tujuan Karir</strong></p><p>{{.career_goals}}</p>{{end}}
{{if .problem_description}}<p><strong>Uraian Masalah</strong></p><p>{{.problem_description}}</p>{{end}}
{{if .follow_up_plan}}<p><strong>Rencana Tindak Lanjut</strong></p><p>{{.follow_up_plan}}</p>{{end}}
<table style="width:100%; margin-top:60px; text-align:center;">
<tr><td>Siswa</td><td>Guru BK</td></tr>
<tr><td style="padding-top:70px;">(....................)</td><td style="padding-top:70px;">{{.counselor_name}}</td></tr>
</table>
</body></html>`
