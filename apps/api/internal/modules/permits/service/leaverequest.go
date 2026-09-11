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
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/storage"
)

// LeaveRequestDetail bundles a leave request with its workflow state.
type LeaveRequestDetail struct {
	Instance     domain.Instance
	LeaveRequest domain.LeaveRequest
	Definition   domain.Definition
	Events       []domain.Event
	HasEvidence  bool
	HasLetter    bool
}

type SubmitLeaveRequestInput struct {
	TenantID      uuid.UUID
	StudentUserID uuid.UUID
	Category      domain.Category
	Reason        string
	StartsOn      time.Time
	EndsOn        time.Time
}

const (
	leaveLetterDocumentKind = "leave_letter"
	leaveEntityType         = "leave_request"
)

// SubmitLeaveRequest opens the planned-leave flow for a student. Two rules
// from the old app (student_leave_api.go) that had no equivalent in the
// rebuilt version: the reason is forced to the category's fixed label for
// every category but "other" (a student cannot free-type over "Sakit"),
// and the class must already have an active homeroom teacher or the
// request would hang forever with nobody able to review it.
func (s *Service) SubmitLeaveRequest(ctx context.Context, in SubmitLeaveRequestInput) (LeaveRequestDetail, error) {
	if !in.Category.Valid() {
		return LeaveRequestDetail{}, fmt.Errorf("%w: category %q", domain.ErrDefinitionInvalid, in.Category)
	}
	if in.EndsOn.Before(in.StartsOn) {
		return LeaveRequestDetail{}, domain.ErrLeaveRequestDateRangeInvalid
	}
	if label, ok := domain.DefaultReasonFor(in.Category); ok {
		in.Reason = label
	}

	var detail LeaveRequestDetail
	err := s.withTx(ctx, in.TenantID, func(ctx context.Context) error {
		yearID, err := s.activeAcademicYear(ctx, in.TenantID)
		if err != nil {
			return err
		}
		enrollment, ok, err := s.repo.GetActiveEnrollment(ctx, in.TenantID, yearID, in.StudentUserID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrEnrollmentNotFound
		}
		if !enrollment.HomeroomTeacherID.Valid {
			return domain.ErrHomeroomTeacherRequired
		}
		studentName, err := s.repo.GetUserName(ctx, in.TenantID, in.StudentUserID)
		if err != nil {
			return err
		}
		guardian, err := s.repo.GetStudentGuardianName(ctx, in.TenantID, in.StudentUserID)
		if err != nil {
			return err
		}

		inst, def, err := s.createInstance(ctx, newInstanceInput{
			tenantID: in.TenantID, kind: domain.KindLeaveRequest, subjectUserID: in.StudentUserID,
			classID:   uuid.NullUUID{UUID: enrollment.ClassID, Valid: true},
			payload:   map[string]any{"category": string(in.Category), "starts_on": in.StartsOn.Format("2006-01-02"), "ends_on": in.EndsOn.Format("2006-01-02")},
			createdBy: in.StudentUserID,
		})
		if err != nil {
			return err
		}
		lr, err := s.repo.CreateLeaveRequest(ctx, domain.LeaveRequest{
			InstanceID: inst.ID, TenantID: in.TenantID, Category: in.Category, Reason: in.Reason,
			StartsOn: in.StartsOn, EndsOn: in.EndsOn, StudentNameSnapshot: studentName,
			ClassNameSnapshot: enrollment.ClassName, GuardianNameSnapshot: guardian,
		})
		if err != nil {
			return err
		}
		detail = LeaveRequestDetail{Instance: inst, LeaveRequest: lr, Definition: def}
		return nil
	})
	if err != nil {
		return LeaveRequestDetail{}, err
	}
	s.publish(ctx, LeaveRequestSubmitted{TenantID: in.TenantID, InstanceID: detail.Instance.ID, StudentUserID: in.StudentUserID, ClassID: detail.Instance.ClassID})
	return detail, nil
}

// EvidenceUploadTarget is a presigned PUT the client uploads the evidence
// image to before calling ConfirmEvidence.
type EvidenceUploadTarget struct {
	UploadURL string
	ObjectKey string
	ExpiresAt time.Time
}

func (s *Service) RequestEvidenceUpload(ctx context.Context, tenantID, instanceID, studentUserID uuid.UUID) (EvidenceUploadTarget, error) {
	if s.storage == nil {
		return EvidenceUploadTarget{}, domain.ErrEvidenceInvalidType
	}
	if err := s.requireOwnInstance(ctx, tenantID, instanceID, studentUserID, domain.KindLeaveRequest); err != nil {
		return EvidenceUploadTarget{}, err
	}
	key := fmt.Sprintf("tenants/%s/leave/%s/%s", tenantID, instanceID, uuid.New())
	u, err := s.storage.PresignedPutURL(ctx, key, storage.DefaultUploadURLTTL)
	if err != nil {
		return EvidenceUploadTarget{}, fmt.Errorf("presign evidence upload: %w", err)
	}
	return EvidenceUploadTarget{UploadURL: u.String(), ObjectKey: key, ExpiresAt: s.clock.Now().Add(storage.DefaultUploadURLTTL)}, nil
}

// ConfirmEvidence validates the uploaded object (type by sniffing, size
// limit), re-encodes it so any EXIF metadata is dropped, and records it as
// the request's evidence document.
func (s *Service) ConfirmEvidence(ctx context.Context, tenantID, instanceID, studentUserID uuid.UUID, objectKey string) error {
	if err := s.requireOwnInstance(ctx, tenantID, instanceID, studentUserID, domain.KindLeaveRequest); err != nil {
		return err
	}
	expectedPrefix := fmt.Sprintf("tenants/%s/leave/%s/", tenantID, instanceID)
	if len(objectKey) <= len(expectedPrefix) || objectKey[:len(expectedPrefix)] != expectedPrefix {
		return domain.ErrEvidenceInvalidType
	}

	raw, err := s.storage.GetObject(ctx, objectKey)
	if err != nil {
		return fmt.Errorf("read evidence: %w", err)
	}
	if int64(len(raw)) > s.cfg.EvidenceMaxBytes {
		return domain.ErrEvidenceTooLarge
	}
	clean, mime, err := reencodeImage(raw)
	if err != nil {
		return err
	}
	cleanKey := objectKey + ".clean"
	if err := s.storage.PutObject(ctx, cleanKey, clean, mime); err != nil {
		return fmt.Errorf("store evidence: %w", err)
	}
	sum := sha256.Sum256(clean)

	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		assetID, err := s.repo.CreateAsset(ctx, tenantID, s.cfg.Bucket, cleanKey, mime, int64(len(clean)), hex.EncodeToString(sum[:]), "evidence", "private", studentUserID)
		if err != nil {
			return fmt.Errorf("create evidence asset: %w", err)
		}
		_, err = s.repo.UpsertLeaveDocument(ctx, tenantID, instanceID, domain.DocumentKindEvidence, assetID, studentUserID)
		return err
	})
}

// reencodeImage decodes JPEG or PNG input and writes it back out, which
// strips EXIF (including GPS) and rejects anything that is not really an
// image regardless of the declared content type.
func reencodeImage(raw []byte) ([]byte, string, error) {
	switch http.DetectContentType(raw) {
	case "image/jpeg", "image/png":
	default:
		return nil, "", domain.ErrEvidenceInvalidType
	}
	img, format, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", domain.ErrEvidenceInvalidType
	}
	var buf bytes.Buffer
	switch format {
	case "png":
		if err := png.Encode(&buf, img); err != nil {
			return nil, "", fmt.Errorf("encode png: %w", err)
		}
		return buf.Bytes(), "image/png", nil
	default:
		if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 85}); err != nil {
			return nil, "", fmt.Errorf("encode jpeg: %w", err)
		}
		return buf.Bytes(), "image/jpeg", nil
	}
}

func (s *Service) requireOwnInstance(ctx context.Context, tenantID, instanceID, userID uuid.UUID, kind domain.Kind) error {
	return s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInstance(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok || inst.Kind != kind {
			return domain.ErrInstanceNotFound
		}
		if inst.SubjectUserID != userID {
			return domain.ErrNotWorkflowSubject
		}
		return nil
	})
}

// requireEvidenceIfNeeded enforces tenant policy "permits.evidence_required"
// (default true, matching the old app -- docs/02-system-design.md:67) at
// every gate the old app's single synchronous multipart submit collapsed
// into one check: a reviewer must not approve, and a counselor must not
// issue, a request that still has no evidence attached.
func (s *Service) requireEvidenceIfNeeded(ctx context.Context, tenantID, instanceID uuid.UUID) error {
	required, err := s.evidenceRequired(ctx, tenantID)
	if err != nil {
		return err
	}
	if !required {
		return nil
	}
	_, hasEvidence, err := s.repo.GetLeaveDocument(ctx, tenantID, instanceID, domain.DocumentKindEvidence)
	if err != nil {
		return err
	}
	if !hasEvidence {
		return domain.ErrEvidenceRequired
	}
	return nil
}

// ReviewLeaveRequest is the homeroom teacher's approve/reject of the first
// stage. Approval of the final stage is IssueLeaveLetter, never this.
func (s *Service) ReviewLeaveRequest(ctx context.Context, tenantID, instanceID, reviewerUserID uuid.UUID, approve bool, note string) (LeaveRequestDetail, error) {
	var detail LeaveRequestDetail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInstance(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok || inst.Kind != domain.KindLeaveRequest {
			return domain.ErrInstanceNotFound
		}
		def, _, err := s.repo.GetDefinitionByID(ctx, tenantID, inst.DefinitionID)
		if err != nil {
			return err
		}
		if _, isLast := def.NextIndex(inst.CurrentStageIndex); isLast && approve {
			return domain.ErrLeaveRequestNotReviewable
		}
		if approve {
			if err := s.requireEvidenceIfNeeded(ctx, tenantID, instanceID); err != nil {
				return err
			}
		}

		var updated domain.Instance
		if approve {
			updated, def, _, err = s.approveCurrentStage(ctx, stageTransitionInput{
				tenantID: tenantID, instanceID: instanceID, actorUserID: reviewerUserID, note: note, onLastStageStatus: domain.StatusApproved,
			})
		} else {
			updated, err = s.rejectInstance(ctx, tenantID, instanceID, reviewerUserID, note)
		}
		if err != nil {
			return err
		}
		lr, _, err := s.repo.GetLeaveRequest(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		detail = LeaveRequestDetail{Instance: updated, LeaveRequest: lr, Definition: def}
		return nil
	})
	if err != nil {
		return LeaveRequestDetail{}, err
	}
	s.publish(ctx, LeaveRequestReviewed{TenantID: tenantID, InstanceID: instanceID, StudentUserID: detail.Instance.SubjectUserID, Approved: approve, ReviewerID: reviewerUserID})
	return detail, nil
}

// ReviewLeaveRequestAsGuardian is a guardian's approve/reject at their
// stage. It is a thin wrapper over ReviewLeaveRequest -- eligibility (is
// guardianUserID actually a guardian of this request's subject) is
// enforced the same way as any other stage, by evaluateApproverRule -- but
// requires a reason on rejection, since a guardian declining a child's
// planned absence is expected to say why.
func (s *Service) ReviewLeaveRequestAsGuardian(ctx context.Context, tenantID, instanceID, guardianUserID uuid.UUID, approve bool, note string) (LeaveRequestDetail, error) {
	if !approve && note == "" {
		return LeaveRequestDetail{}, domain.ErrLeaveRejectionReasonRequired
	}
	return s.ReviewLeaveRequest(ctx, tenantID, instanceID, guardianUserID, approve, note)
}

// IssueLeaveLetter is the counselor's final approval: it numbers the
// letter from the per-year sequence, renders and stores the PDF, records
// the issued document with a verification code, and forces the student's
// attendance status for the covered dates.
//
//nolint:gocyclo // TODO(permits): split issuance into number, render, store, sync steps
func (s *Service) IssueLeaveLetter(ctx context.Context, tenantID, instanceID, issuerUserID uuid.UUID) (LeaveRequestDetail, error) {
	var detail LeaveRequestDetail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInstance(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok || inst.Kind != domain.KindLeaveRequest {
			return domain.ErrInstanceNotFound
		}
		def, _, err := s.repo.GetDefinitionByID(ctx, tenantID, inst.DefinitionID)
		if err != nil {
			return err
		}
		if _, isLast := def.NextIndex(inst.CurrentStageIndex); !isLast {
			return domain.ErrLeaveRequestNotIssuable
		}
		if err := s.requireEvidenceIfNeeded(ctx, tenantID, instanceID); err != nil {
			return err
		}

		updated, def, _, err := s.approveCurrentStage(ctx, stageTransitionInput{
			tenantID: tenantID, instanceID: instanceID, actorUserID: issuerUserID, note: "letter issued", onLastStageStatus: domain.StatusApproved,
		})
		if err != nil {
			return err
		}

		lr, _, err := s.repo.GetLeaveRequest(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		now := s.clock.Now()
		seq, err := s.repo.NextSequenceValue(ctx, tenantID, leaveLetterDocumentKind, inst.AcademicYearID)
		if err != nil {
			return fmt.Errorf("next letter number: %w", err)
		}
		number := domain.RenderNumberingTemplate(domain.DefaultLeaveLetterNumberingTemplate, domain.NumberingVars(seq, now))

		code, codeHash, err := documents.NewVerificationCode(s.cfg.DocumentSigningKey)
		if err != nil {
			return err
		}

		// docs/analysis/backend-inventory.md 1.14: the old app's template
		// carried the student's nis/address and the homeroom teacher's
		// and issuer's names too -- placeholders the rebuilt template had
		// dropped.
		nis, address, err := s.repo.GetStudentNISAndAddress(ctx, tenantID, inst.SubjectUserID)
		if err != nil {
			return err
		}
		homeroomName := ""
		if enrollment, ok, err := s.repo.GetActiveEnrollment(ctx, tenantID, inst.AcademicYearID, inst.SubjectUserID); err == nil && ok && enrollment.HomeroomTeacherID.Valid {
			homeroomName, _ = s.repo.GetUserName(ctx, tenantID, enrollment.HomeroomTeacherID.UUID)
		}
		issuerName, err := s.repo.GetUserName(ctx, tenantID, issuerUserID)
		if err != nil {
			return err
		}

		tmpl := s.leaveLetterTemplate(ctx, tenantID)
		rendered, err := s.renderer.Render(ctx, tmpl, map[string]any{
			"letter_number": number, "student_name": lr.StudentNameSnapshot, "class_name": lr.ClassNameSnapshot,
			"guardian_name": lr.GuardianNameSnapshot, "category": string(lr.Category), "reason": lr.Reason,
			"starts_on": lr.StartsOn.Format("02-01-2006"), "ends_on": lr.EndsOn.Format("02-01-2006"),
			"days": lr.Days(), "issued_at": now.Format("02-01-2006"), "verification_code": code,
			"nis": nis, "address": address, "homeroom_name": homeroomName, "issuer_name": issuerName,
		})
		if err != nil {
			return fmt.Errorf("render leave letter: %w", err)
		}

		var assetID uuid.NullUUID
		if s.storage != nil && len(rendered.PDF) > 0 {
			key := fmt.Sprintf("tenants/%s/documents/leave/%s.pdf", tenantID, instanceID)
			if err := s.storage.PutObject(ctx, key, rendered.PDF, "application/pdf"); err != nil {
				return fmt.Errorf("store leave letter: %w", err)
			}
			sum := sha256.Sum256(rendered.PDF)
			id, err := s.repo.CreateAsset(ctx, tenantID, s.cfg.Bucket, key, "application/pdf", int64(len(rendered.PDF)), hex.EncodeToString(sum[:]), "document", "private", issuerUserID)
			if err != nil {
				return fmt.Errorf("create letter asset: %w", err)
			}
			assetID = uuid.NullUUID{UUID: id, Valid: true}
			if _, err := s.repo.UpsertLeaveDocument(ctx, tenantID, instanceID, domain.DocumentKindLetter, id, issuerUserID); err != nil {
				return err
			}
		}
		sum := sha256.Sum256(rendered.PDF)
		if _, err := s.repo.CreateIssuedDocument(ctx, domain.IssuedDocument{
			TenantID: tenantID, Kind: leaveLetterDocumentKind, EntityType: leaveEntityType, EntityID: instanceID, Number: number,
			AssetID: assetID, SHA256: hex.EncodeToString(sum[:]), VerificationCodeHash: codeHash,
			IssuedBy: uuid.NullUUID{UUID: issuerUserID, Valid: true},
		}); err != nil {
			return err
		}
		lr, err = s.repo.IssueLeaveRequest(ctx, tenantID, instanceID, number, now, issuerUserID)
		if err != nil {
			return err
		}
		if s.sync != nil {
			from := lr.StartsOn
			to := lr.EndsOn.Add(24*time.Hour - time.Second)
			if err := s.sync.ForceStatus(ctx, tenantID, inst.SubjectUserID, from, to, attendanceStatusFor(lr.Category), "leave letter "+number); err != nil {
				return fmt.Errorf("sync attendance: %w", err)
			}
		}
		detail = LeaveRequestDetail{Instance: updated, LeaveRequest: lr, Definition: def, HasLetter: assetID.Valid}
		return nil
	})
	if err != nil {
		return LeaveRequestDetail{}, err
	}
	s.publish(ctx, LeaveRequestIssued{TenantID: tenantID, InstanceID: instanceID, StudentUserID: detail.Instance.SubjectUserID, LetterNumber: detail.LeaveRequest.LetterNumber})
	return detail, nil
}

func attendanceStatusFor(c domain.Category) string {
	switch c {
	case domain.CategorySick:
		return "S"
	case domain.CategoryDispensation:
		return "D"
	default:
		return "I"
	}
}

// leaveLetterTemplate returns the tenant's default template or the
// built-in one so issuance never fails for lack of configuration, with its
// letterhead image bytes loaded (if the template names one) so Render can
// place it above the body -- see documents.Template.Letterhead.
func (s *Service) leaveLetterTemplate(ctx context.Context, tenantID uuid.UUID) documents.Template {
	t, ok, err := s.repo.GetDefaultTemplate(ctx, tenantID, domain.TemplateKindLeaveLetter)
	if err != nil || !ok {
		return documents.Template{Engine: documents.EngineHTML, Body: builtinLeaveLetterHTML}
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

const builtinLeaveLetterHTML = `<html><body style="font-family: serif; font-size: 12pt; margin: 40px;">
<h2 style="text-align:center; margin-bottom: 4px;">SURAT IZIN TIDAK MASUK SEKOLAH</h2>
<p style="text-align:center; margin-top:0;">Nomor: {{.letter_number}}</p>
<p>Dengan ini menerangkan bahwa:</p>
<table>
<tr><td>Nama</td><td>: {{.student_name}}</td></tr>
<tr><td>NIS</td><td>: {{.nis}}</td></tr>
<tr><td>Kelas</td><td>: {{.class_name}}</td></tr>
<tr><td>Alamat</td><td>: {{.address}}</td></tr>
<tr><td>Wali</td><td>: {{.guardian_name}}</td></tr>
</table>
<p>diizinkan tidak mengikuti kegiatan belajar mengajar pada tanggal {{.starts_on}} sampai {{.ends_on}} ({{.days}} hari) dengan keterangan {{.category}}: {{.reason}}.</p>
<p>Surat ini diterbitkan pada {{.issued_at}} oleh {{.issuer_name}}, diketahui oleh wali kelas {{.homeroom_name}}. Kode verifikasi: <strong>{{.verification_code}}</strong></p>
</body></html>`

// leaveLetterTemplateVariables lists every placeholder the default leave
// letter template understands, for a tenant editing a custom template to
// discover them from (also the set the discipline warning letter's
// renderer shares -- keep names in sync with
// discipline/service.BuiltinWarningLetterHTML if either changes).
var leaveLetterTemplateVariables = []string{
	"letter_number", "student_name", "nis", "class_name", "address", "guardian_name",
	"category", "reason", "starts_on", "ends_on", "days", "issued_at", "issuer_name", "homeroom_name", "verification_code",
}

func (s *Service) GetLeaveRequest(ctx context.Context, tenantID, instanceID uuid.UUID) (LeaveRequestDetail, error) {
	var detail LeaveRequestDetail
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		inst, ok, err := s.repo.GetInstance(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok || inst.Kind != domain.KindLeaveRequest {
			return domain.ErrInstanceNotFound
		}
		lr, ok, err := s.repo.GetLeaveRequest(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrInstanceNotFound
		}
		def, _, err := s.repo.GetDefinitionByID(ctx, tenantID, inst.DefinitionID)
		if err != nil {
			return err
		}
		events, err := s.repo.ListEvents(ctx, tenantID, instanceID)
		if err != nil {
			return err
		}
		_, hasEvidence, err := s.repo.GetLeaveDocument(ctx, tenantID, instanceID, domain.DocumentKindEvidence)
		if err != nil {
			return err
		}
		_, hasLetter, err := s.repo.GetLeaveDocument(ctx, tenantID, instanceID, domain.DocumentKindLetter)
		if err != nil {
			return err
		}
		detail = LeaveRequestDetail{Instance: inst, LeaveRequest: lr, Definition: def, Events: events, HasEvidence: hasEvidence, HasLetter: hasLetter}
		return nil
	})
	return detail, err
}

func (s *Service) ListMyLeaveRequests(ctx context.Context, tenantID, studentUserID uuid.UUID, limit, offset int) ([]LeaveRequestItem, error) {
	var out []LeaveRequestItem
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListLeaveRequestsBySubject(ctx, tenantID, studentUserID, clampPage(limit), offset)
		return err
	})
	return out, err
}

// ListLeaveRequestsForReview returns the requests reviewerUserID may act
// on: their homeroom classes, or every class for counselors and
// leadership. classID narrows the result further.
func (s *Service) ListLeaveRequestsForReview(ctx context.Context, tenantID, reviewerUserID uuid.UUID, classID uuid.NullUUID) ([]LeaveRequestItem, error) {
	var out []LeaveRequestItem
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListLeaveRequestsForReview(ctx, tenantID, reviewerUserID, classID)
		return err
	})
	return out, err
}

// ListLeaveRequestsForGuardianReview is a guardian's queue: the
// in-progress leave request of each child they hold approval rights for,
// but only when its current stage is actually "guardian_of_student" --
// a tenant that has not opted a guardian stage into its workflow (see
// domain.DefaultStages) leaves this queue empty rather than surfacing
// requests the guardian has no say over.
func (s *Service) ListLeaveRequestsForGuardianReview(ctx context.Context, tenantID, guardianUserID uuid.UUID) ([]LeaveRequestItem, error) {
	var out []LeaveRequestItem
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if s.guardians == nil {
			return nil
		}
		children, err := s.guardians.ApprovingChildrenOf(ctx, tenantID, guardianUserID)
		if err != nil {
			return err
		}
		for _, studentID := range children {
			inst, ok, err := s.repo.GetInProgressInstance(ctx, tenantID, domain.KindLeaveRequest, studentID)
			if err != nil {
				return err
			}
			if !ok {
				continue
			}
			def, ok, err := s.repo.GetDefinitionByID(ctx, tenantID, inst.DefinitionID)
			if err != nil {
				return err
			}
			if !ok {
				continue
			}
			stage, err := def.StageAt(inst.CurrentStageIndex)
			if err != nil || stage.ApproverRule != domain.RuleGuardianOfStudent {
				continue
			}
			lr, ok, err := s.repo.GetLeaveRequest(ctx, tenantID, inst.ID)
			if err != nil {
				return err
			}
			if !ok {
				continue
			}
			out = append(out, LeaveRequestItem{
				LeaveRequest: lr, SubjectUserID: inst.SubjectUserID, ClassID: inst.ClassID,
				Status: inst.Status, OpenedAt: inst.OpenedAt, CurrentStageIndex: inst.CurrentStageIndex,
			})
		}
		return nil
	})
	return out, err
}

// DocumentDownloadURL returns a short-lived signed URL for the evidence or
// letter of a leave request.
func (s *Service) DocumentDownloadURL(ctx context.Context, tenantID, instanceID uuid.UUID, kind domain.DocumentKind) (string, error) {
	if s.storage == nil {
		return "", domain.ErrDocumentNotFound
	}
	var objectKey string
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		doc, ok, err := s.repo.GetLeaveDocument(ctx, tenantID, instanceID, kind)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrDocumentNotFound
		}
		objectKey, err = s.repo.GetAssetObjectKey(ctx, tenantID, doc.AssetID)
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

// DocumentVerification is the public, minimal view of an issued document.
type DocumentVerification struct {
	Number      string
	Kind        string
	IssuedAt    time.Time
	StudentName string
	ClassName   string
	ValidFrom   time.Time
	ValidUntil  time.Time
	Revoked     bool
}

// VerifyDocument resolves a verification code printed on a letter. It
// deliberately omits the reason: the endpoint is public.
func (s *Service) VerifyDocument(ctx context.Context, tenantID uuid.UUID, code string) (DocumentVerification, error) {
	hash := documents.HashVerificationCode(s.cfg.DocumentSigningKey, code)
	var out DocumentVerification
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		doc, ok, err := s.repo.GetIssuedDocumentByVerificationHash(ctx, tenantID, hash)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrDocumentNotFound
		}
		out = DocumentVerification{Number: doc.Number, Kind: doc.Kind, IssuedAt: doc.IssuedAt, Revoked: doc.IsRevoked()}
		if doc.EntityType == leaveEntityType {
			if lr, ok, err := s.repo.GetLeaveRequest(ctx, tenantID, doc.EntityID); err == nil && ok {
				out.StudentName, out.ClassName, out.ValidFrom, out.ValidUntil = lr.StudentNameSnapshot, lr.ClassNameSnapshot, lr.StartsOn, lr.EndsOn
			}
		}
		return nil
	})
	return out, err
}

// Templates administration.

func (s *Service) ListTemplates(ctx context.Context, tenantID uuid.UUID) ([]domain.Template, error) {
	var out []domain.Template
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.ListTemplates(ctx, tenantID)
		return err
	})
	return out, err
}

func (s *Service) CreateTemplate(ctx context.Context, t domain.Template) (domain.Template, error) {
	if t.Engine == "" {
		t.Engine = domain.EngineHTML
	}
	if t.Kind == domain.TemplateKindLeaveLetter && len(t.Variables) == 0 {
		t.Variables = leaveLetterTemplateVariables
	}
	var out domain.Template
	err := s.withTx(ctx, t.TenantID, func(ctx context.Context) error {
		var err error
		out, err = s.repo.CreateTemplate(ctx, t)
		return err
	})
	return out, err
}

func (s *Service) UpdateTemplate(ctx context.Context, tenantID, id uuid.UUID, name, body string, variables []string, letterheadAssetID uuid.NullUUID) (domain.Template, error) {
	var out domain.Template
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if _, ok, err := s.repo.GetTemplateByID(ctx, tenantID, id); err != nil {
			return err
		} else if !ok {
			return domain.ErrTemplateNotFound
		}
		var err error
		out, err = s.repo.UpdateTemplate(ctx, tenantID, id, name, body, variables, letterheadAssetID)
		return err
	})
	return out, err
}

func (s *Service) SetDefaultTemplate(ctx context.Context, tenantID, id uuid.UUID) (domain.Template, error) {
	var out domain.Template
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		t, ok, err := s.repo.GetTemplateByID(ctx, tenantID, id)
		if err != nil {
			return err
		}
		if !ok {
			return domain.ErrTemplateNotFound
		}
		out, err = s.repo.SetDefaultTemplate(ctx, tenantID, id, t.Kind)
		return err
	})
	return out, err
}

func clampPage(limit int) int {
	if limit <= 0 {
		return 25
	}
	if limit > 100 {
		return 100
	}
	return limit
}
