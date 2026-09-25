package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// Exit permits.

func toExitPermit(row db.ExitPermit) domain.ExitPermit {
	return domain.ExitPermit{
		InstanceID: row.InstanceID, TenantID: row.TenantID, Destination: row.Destination,
		StartPeriodID: row.StartPeriodID, EndPeriodID: row.EndPeriodID, IssuedAt: pdatabase.TimePtr(row.IssuedAt),
		GateTokenID: pdatabase.UUIDOrNil(row.GateTokenID), ExitedAt: pdatabase.TimePtr(row.ExitedAt),
		SecurityUserID:      pdatabase.UUIDOrNil(row.SecurityUserID),
		StudentNameSnapshot: row.StudentNameSnapshot, ClassNameSnapshot: row.ClassNameSnapshot,
	}
}

func (r *Repository) CreateExitPermit(ctx context.Context, p domain.ExitPermit) (domain.ExitPermit, error) {
	row, err := r.queries(ctx).CreateExitPermit(ctx, db.CreateExitPermitParams{
		InstanceID: p.InstanceID, TenantID: p.TenantID, Destination: p.Destination,
		StartPeriodID: p.StartPeriodID, EndPeriodID: p.EndPeriodID,
		StudentNameSnapshot: p.StudentNameSnapshot, ClassNameSnapshot: p.ClassNameSnapshot,
	})
	if err != nil {
		return domain.ExitPermit{}, fmt.Errorf("create exit permit: %w", err)
	}
	return toExitPermit(row), nil
}

func (r *Repository) GetExitPermit(ctx context.Context, tenantID, instanceID uuid.UUID) (domain.ExitPermit, bool, error) {
	row, err := r.queries(ctx).GetExitPermit(ctx, db.GetExitPermitParams{TenantID: tenantID, InstanceID: instanceID})
	if notFound(err) {
		return domain.ExitPermit{}, false, nil
	}
	if err != nil {
		return domain.ExitPermit{}, false, fmt.Errorf("get exit permit: %w", err)
	}
	return toExitPermit(row), true, nil
}

func (r *Repository) MarkExitPermitIssued(ctx context.Context, tenantID, instanceID uuid.UUID, issuedAt time.Time) (domain.ExitPermit, error) {
	row, err := r.queries(ctx).MarkExitPermitIssued(ctx, db.MarkExitPermitIssuedParams{
		TenantID: tenantID, InstanceID: instanceID, IssuedAt: pdatabase.Timestamptz(issuedAt),
	})
	if err != nil {
		return domain.ExitPermit{}, fmt.Errorf("mark exit permit issued: %w", err)
	}
	return toExitPermit(row), nil
}

func (r *Repository) SetExitPermitGateToken(ctx context.Context, tenantID, instanceID, gateTokenID uuid.UUID) (domain.ExitPermit, error) {
	row, err := r.queries(ctx).SetExitPermitGateToken(ctx, db.SetExitPermitGateTokenParams{
		TenantID: tenantID, InstanceID: instanceID, GateTokenID: uuidNullable(gateTokenID),
	})
	if err != nil {
		return domain.ExitPermit{}, fmt.Errorf("set gate token: %w", err)
	}
	return toExitPermit(row), nil
}

func (r *Repository) MarkExitPermitExited(ctx context.Context, tenantID, instanceID uuid.UUID, exitedAt time.Time, securityUserID uuid.UUID) (domain.ExitPermit, error) {
	row, err := r.queries(ctx).MarkExitPermitExited(ctx, db.MarkExitPermitExitedParams{
		TenantID: tenantID, InstanceID: instanceID, ExitedAt: pdatabase.Timestamptz(exitedAt), SecurityUserID: uuidNullable(securityUserID),
	})
	if err != nil {
		return domain.ExitPermit{}, fmt.Errorf("mark exit permit exited: %w", err)
	}
	return toExitPermit(row), nil
}

// Late arrivals.

func toLateArrival(row db.LateArrival) domain.LateArrival {
	return domain.LateArrival{
		InstanceID: row.InstanceID, TenantID: row.TenantID, Reason: row.Reason, OccurrenceNumber: int(row.OccurrenceNumber),
		RequiredAction: domain.RequiredAction(row.RequiredAction), HomeroomReported: row.HomeroomReported, CompletedAt: pdatabase.TimePtr(row.CompletedAt),
		DutyTeacherUserID: pdatabase.UUIDOrNil(row.DutyTeacherUserID),
	}
}

func (r *Repository) CreateLateArrival(ctx context.Context, l domain.LateArrival) (domain.LateArrival, error) {
	row, err := r.queries(ctx).CreateLateArrival(ctx, db.CreateLateArrivalParams{
		InstanceID: l.InstanceID, TenantID: l.TenantID, Reason: l.Reason, OccurrenceNumber: int32(l.OccurrenceNumber), //nolint:gosec // occurrence counts are tiny
		RequiredAction: string(l.RequiredAction), HomeroomReported: l.HomeroomReported,
		DutyTeacherUserID: pdatabase.NullUUID(l.DutyTeacherUserID),
	})
	if err != nil {
		return domain.LateArrival{}, fmt.Errorf("create late arrival: %w", err)
	}
	return toLateArrival(row), nil
}

func (r *Repository) GetLateArrival(ctx context.Context, tenantID, instanceID uuid.UUID) (domain.LateArrival, bool, error) {
	row, err := r.queries(ctx).GetLateArrival(ctx, db.GetLateArrivalParams{TenantID: tenantID, InstanceID: instanceID})
	if notFound(err) {
		return domain.LateArrival{}, false, nil
	}
	if err != nil {
		return domain.LateArrival{}, false, fmt.Errorf("get late arrival: %w", err)
	}
	return toLateArrival(row), true, nil
}

func (r *Repository) UpdateLateArrivalReview(ctx context.Context, tenantID, instanceID uuid.UUID, reason string, action domain.RequiredAction, homeroomReported bool) (domain.LateArrival, error) {
	row, err := r.queries(ctx).UpdateLateArrivalReview(ctx, db.UpdateLateArrivalReviewParams{
		TenantID: tenantID, InstanceID: instanceID, Reason: reason, RequiredAction: string(action), HomeroomReported: homeroomReported,
	})
	if err != nil {
		return domain.LateArrival{}, fmt.Errorf("update late arrival review: %w", err)
	}
	return toLateArrival(row), nil
}

func (r *Repository) MarkLateArrivalCompleted(ctx context.Context, tenantID, instanceID uuid.UUID, completedAt time.Time) (domain.LateArrival, error) {
	row, err := r.queries(ctx).MarkLateArrivalCompleted(ctx, db.MarkLateArrivalCompletedParams{
		TenantID: tenantID, InstanceID: instanceID, CompletedAt: pdatabase.Timestamptz(completedAt),
	})
	if err != nil {
		return domain.LateArrival{}, fmt.Errorf("mark late arrival completed: %w", err)
	}
	return toLateArrival(row), nil
}

// ListLateArrivalsForReview returns today's open late arrivals with their
// workflow state, scoped to the duty teacher who opened each one (or every
// one, for a caller whose manage_attendance is role-granted -- see
// queries/late_arrivals.sql).
func (r *Repository) ListLateArrivalsForReview(ctx context.Context, tenantID, callerUserID uuid.UUID) ([]service.LateArrivalReviewItem, error) {
	rows, err := r.queries(ctx).ListLateArrivalsForReview(ctx, db.ListLateArrivalsForReviewParams{
		TenantID: tenantID, DutyTeacherUserID: pdatabase.NullUUID(uuid.NullUUID{UUID: callerUserID, Valid: true}),
	})
	if err != nil {
		return nil, fmt.Errorf("list late arrivals for review: %w", err)
	}
	out := make([]service.LateArrivalReviewItem, len(rows))
	for i, row := range rows {
		out[i] = service.LateArrivalReviewItem{
			LateArrival: domain.LateArrival{
				InstanceID: row.InstanceID, TenantID: row.TenantID, Reason: row.Reason, OccurrenceNumber: int(row.OccurrenceNumber),
				RequiredAction: domain.RequiredAction(row.RequiredAction), HomeroomReported: row.HomeroomReported, CompletedAt: pdatabase.TimePtr(row.CompletedAt),
				DutyTeacherUserID: pdatabase.UUIDOrNil(row.DutyTeacherUserID),
			},
			SubjectUserID: row.SubjectUserID, ClassID: pdatabase.UUIDOrNil(row.ClassID),
			CurrentStageIndex: int(row.CurrentStageIndex), Status: domain.Status(row.Status), OpenedAt: pdatabase.TimeOrZero(row.OpenedAt),
		}
	}
	return out, nil
}

// Leave requests.

func toLeaveRequest(row db.LeaveRequest) domain.LeaveRequest {
	return domain.LeaveRequest{
		InstanceID: row.InstanceID, TenantID: row.TenantID, Category: domain.Category(row.Category), Reason: row.Reason,
		StartsOn: pdatabase.DateOrZero(row.StartsOn), EndsOn: pdatabase.DateOrZero(row.EndsOn),
		LetterNumber: pdatabase.TextOrEmpty(row.LetterNumber), IssuedAt: pdatabase.TimePtr(row.IssuedAt), IssuedBy: pdatabase.UUIDOrNil(row.IssuedBy),
		StudentNameSnapshot: row.StudentNameSnapshot, ClassNameSnapshot: row.ClassNameSnapshot, GuardianNameSnapshot: pdatabase.TextOrEmpty(row.GuardianNameSnapshot),
	}
}

func (r *Repository) CreateLeaveRequest(ctx context.Context, lr domain.LeaveRequest) (domain.LeaveRequest, error) {
	row, err := r.queries(ctx).CreateLeaveRequest(ctx, db.CreateLeaveRequestParams{
		InstanceID: lr.InstanceID, TenantID: lr.TenantID, Category: string(lr.Category), Reason: lr.Reason,
		StartsOn: pdatabase.Date(lr.StartsOn), EndsOn: pdatabase.Date(lr.EndsOn),
		StudentNameSnapshot: lr.StudentNameSnapshot, ClassNameSnapshot: lr.ClassNameSnapshot, GuardianNameSnapshot: pdatabase.Text(lr.GuardianNameSnapshot),
	})
	if err != nil {
		return domain.LeaveRequest{}, fmt.Errorf("create leave request: %w", err)
	}
	return toLeaveRequest(row), nil
}

func (r *Repository) GetLeaveRequest(ctx context.Context, tenantID, instanceID uuid.UUID) (domain.LeaveRequest, bool, error) {
	row, err := r.queries(ctx).GetLeaveRequest(ctx, db.GetLeaveRequestParams{TenantID: tenantID, InstanceID: instanceID})
	if notFound(err) {
		return domain.LeaveRequest{}, false, nil
	}
	if err != nil {
		return domain.LeaveRequest{}, false, fmt.Errorf("get leave request: %w", err)
	}
	return toLeaveRequest(row), true, nil
}

func (r *Repository) GetIssuedLeaveCoveringDate(ctx context.Context, tenantID, studentUserID uuid.UUID, date time.Time) (domain.LeaveRequest, bool, error) {
	row, err := r.queries(ctx).GetIssuedLeaveCoveringDate(ctx, db.GetIssuedLeaveCoveringDateParams{TenantID: tenantID, SubjectUserID: studentUserID, StartsOn: pdatabase.Date(date)})
	if notFound(err) {
		return domain.LeaveRequest{}, false, nil
	}
	if err != nil {
		return domain.LeaveRequest{}, false, fmt.Errorf("get issued leave covering date: %w", err)
	}
	return toLeaveRequest(row), true, nil
}

func (r *Repository) IssueLeaveRequest(ctx context.Context, tenantID, instanceID uuid.UUID, letterNumber string, issuedAt time.Time, issuedBy uuid.UUID) (domain.LeaveRequest, error) {
	row, err := r.queries(ctx).IssueLeaveRequest(ctx, db.IssueLeaveRequestParams{
		TenantID: tenantID, InstanceID: instanceID, LetterNumber: pdatabase.Text(letterNumber),
		IssuedAt: pdatabase.Timestamptz(issuedAt), IssuedBy: uuidNullable(issuedBy),
	})
	if err != nil {
		return domain.LeaveRequest{}, fmt.Errorf("issue leave request: %w", err)
	}
	return toLeaveRequest(row), nil
}

func (r *Repository) ListLeaveRequestsBySubject(ctx context.Context, tenantID, subjectUserID uuid.UUID, limit, offset int) ([]service.LeaveRequestItem, error) {
	rows, err := r.queries(ctx).ListLeaveRequestsBySubject(ctx, db.ListLeaveRequestsBySubjectParams{
		TenantID: tenantID, SubjectUserID: subjectUserID, Limit: int32(limit), Offset: int32(offset), //nolint:gosec // paging values are clamped
	})
	if err != nil {
		return nil, fmt.Errorf("list leave requests: %w", err)
	}
	out := make([]service.LeaveRequestItem, len(rows))
	for i, row := range rows {
		out[i] = service.LeaveRequestItem{
			LeaveRequest:      toLeaveRequest(db.LeaveRequest(leaveRequestColumns(row))),
			SubjectUserID:     subjectUserID,
			Status:            domain.Status(row.Status),
			OpenedAt:          pdatabase.TimeOrZero(row.OpenedAt),
			CurrentStageIndex: int(row.CurrentStageIndex),
		}
	}
	return out, nil
}

func (r *Repository) ListLeaveRequestsForReview(ctx context.Context, tenantID, reviewerUserID uuid.UUID, classID uuid.NullUUID, today time.Time) ([]service.LeaveRequestItem, error) {
	rows, err := r.queries(ctx).ListLeaveRequestsForReview(ctx, db.ListLeaveRequestsForReviewParams{
		TenantID: tenantID, UserID: reviewerUserID, ClassID: pdatabase.NullUUID(classID), Today: pdatabase.Date(today),
	})
	if err != nil {
		return nil, fmt.Errorf("list leave requests for review: %w", err)
	}
	out := make([]service.LeaveRequestItem, len(rows))
	for i, row := range rows {
		out[i] = service.LeaveRequestItem{
			LeaveRequest: toLeaveRequest(db.LeaveRequest{
				InstanceID: row.InstanceID, TenantID: row.TenantID, Category: row.Category, Reason: row.Reason,
				StartsOn: row.StartsOn, EndsOn: row.EndsOn, LetterNumber: row.LetterNumber, IssuedAt: row.IssuedAt, IssuedBy: row.IssuedBy,
				StudentNameSnapshot: row.StudentNameSnapshot, ClassNameSnapshot: row.ClassNameSnapshot,
				GuardianNameSnapshot: row.GuardianNameSnapshot,
			}),
			SubjectUserID: row.SubjectUserID, ClassID: pdatabase.UUIDOrNil(row.ClassID),
			Status: domain.Status(row.Status), OpenedAt: pdatabase.TimeOrZero(row.OpenedAt), CurrentStageIndex: int(row.CurrentStageIndex),
		}
	}
	return out, nil
}

// leaveRequestColumns narrows a by-subject row to the LeaveRequest columns.
func leaveRequestColumns(row db.ListLeaveRequestsBySubjectRow) db.LeaveRequest {
	return db.LeaveRequest{
		InstanceID: row.InstanceID, TenantID: row.TenantID, Category: row.Category, Reason: row.Reason,
		StartsOn: row.StartsOn, EndsOn: row.EndsOn, LetterNumber: row.LetterNumber, IssuedAt: row.IssuedAt, IssuedBy: row.IssuedBy,
		StudentNameSnapshot: row.StudentNameSnapshot, ClassNameSnapshot: row.ClassNameSnapshot,
		GuardianNameSnapshot: row.GuardianNameSnapshot,
	}
}

func toLeaveDocument(row db.LeaveDocument) service.LeaveDocumentInfo {
	return service.LeaveDocumentInfo{ID: row.ID, Kind: row.Kind, AssetID: row.AssetID, CreatedAt: pdatabase.TimeOrZero(row.CreatedAt)}
}

func (r *Repository) UpsertLeaveDocument(ctx context.Context, tenantID, leaveRequestID uuid.UUID, kind domain.DocumentKind, assetID, createdBy uuid.UUID) (service.LeaveDocumentInfo, error) {
	row, err := r.queries(ctx).CreateLeaveDocument(ctx, db.CreateLeaveDocumentParams{
		TenantID: tenantID, LeaveRequestID: leaveRequestID, Kind: string(kind), AssetID: assetID, CreatedBy: uuidNullable(createdBy),
	})
	if err != nil {
		return service.LeaveDocumentInfo{}, fmt.Errorf("upsert leave document: %w", err)
	}
	return toLeaveDocument(row), nil
}

func (r *Repository) GetLeaveDocument(ctx context.Context, tenantID, leaveRequestID uuid.UUID, kind domain.DocumentKind) (service.LeaveDocumentInfo, bool, error) {
	row, err := r.queries(ctx).GetLeaveDocument(ctx, db.GetLeaveDocumentParams{TenantID: tenantID, LeaveRequestID: leaveRequestID, Kind: string(kind)})
	if notFound(err) {
		return service.LeaveDocumentInfo{}, false, nil
	}
	if err != nil {
		return service.LeaveDocumentInfo{}, false, fmt.Errorf("get leave document: %w", err)
	}
	return toLeaveDocument(row), true, nil
}

// Scan tokens.

func toScanToken(row db.ScanToken) domain.ScanToken {
	return domain.ScanToken{
		ID: row.ID, TenantID: row.TenantID, Purpose: domain.Purpose(row.Purpose), ContextID: pdatabase.UUIDOrNil(row.ContextID),
		IssuedByUserID: row.IssuedByUserID, Hash: row.TokenHash, ExpiresAt: pdatabase.TimeOrZero(row.ExpiresAt),
		ConsumedAt: pdatabase.TimePtr(row.ConsumedAt), ConsumedByUserID: pdatabase.UUIDOrNil(row.ConsumedByUserID), CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
	}
}

func (r *Repository) CreateScanToken(ctx context.Context, t domain.ScanToken) (domain.ScanToken, error) {
	row, err := r.queries(ctx).CreateScanToken(ctx, db.CreateScanTokenParams{
		TenantID: t.TenantID, Purpose: string(t.Purpose), ContextID: pdatabase.NullUUID(t.ContextID), IssuedByUserID: t.IssuedByUserID,
		TokenHash: t.Hash, ExpiresAt: pdatabase.Timestamptz(t.ExpiresAt),
	})
	if err != nil {
		return domain.ScanToken{}, fmt.Errorf("create scan token: %w", err)
	}
	return toScanToken(row), nil
}

func (r *Repository) ConsumeScanToken(ctx context.Context, tenantID uuid.UUID, hash []byte, consumedBy uuid.UUID, now time.Time) (domain.ScanToken, bool, error) {
	row, err := r.queries(ctx).ConsumeScanToken(ctx, db.ConsumeScanTokenParams{
		TenantID: tenantID, TokenHash: hash, ConsumedByUserID: uuidNullable(consumedBy), ConsumedAt: pdatabase.Timestamptz(now),
	})
	if notFound(err) {
		return domain.ScanToken{}, false, nil
	}
	if err != nil {
		return domain.ScanToken{}, false, fmt.Errorf("consume scan token: %w", err)
	}
	return toScanToken(row), true, nil
}

func (r *Repository) GetScanTokenByHash(ctx context.Context, tenantID uuid.UUID, hash []byte) (domain.ScanToken, bool, error) {
	row, err := r.queries(ctx).GetScanTokenByHash(ctx, db.GetScanTokenByHashParams{TenantID: tenantID, TokenHash: hash})
	if notFound(err) {
		return domain.ScanToken{}, false, nil
	}
	if err != nil {
		return domain.ScanToken{}, false, fmt.Errorf("get scan token: %w", err)
	}
	return toScanToken(row), true, nil
}

func (r *Repository) DeleteExpiredScanTokens(ctx context.Context, tenantID uuid.UUID, olderThan time.Time) (int64, error) {
	return r.queries(ctx).DeleteExpiredScanTokens(ctx, db.DeleteExpiredScanTokensParams{TenantID: tenantID, ExpiresAt: pdatabase.Timestamptz(olderThan)})
}

// Document templates, sequences, issued documents.

func toTemplate(row db.DocumentTemplate) domain.Template {
	var vars []string
	_ = jsonUnmarshal(row.Variables, &vars)
	return domain.Template{
		ID: row.ID, TenantID: row.TenantID, Kind: domain.TemplateKind(row.Kind), Name: row.Name, Engine: domain.Engine(row.Engine),
		Body: row.Body, Variables: vars, IsDefault: row.IsDefault, CreatedBy: pdatabase.UUIDOrNil(row.CreatedBy),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt), DeletedAt: pdatabase.TimePtr(row.DeletedAt),
		LetterheadAssetID: pdatabase.UUIDOrNil(row.LetterheadAssetID),
	}
}

func (r *Repository) GetDefaultTemplate(ctx context.Context, tenantID uuid.UUID, kind domain.TemplateKind) (domain.Template, bool, error) {
	row, err := r.queries(ctx).GetDefaultDocumentTemplate(ctx, db.GetDefaultDocumentTemplateParams{TenantID: tenantID, Kind: string(kind)})
	if notFound(err) {
		return domain.Template{}, false, nil
	}
	if err != nil {
		return domain.Template{}, false, fmt.Errorf("get default template: %w", err)
	}
	return toTemplate(row), true, nil
}

func (r *Repository) GetTemplateByID(ctx context.Context, tenantID, id uuid.UUID) (domain.Template, bool, error) {
	row, err := r.queries(ctx).GetDocumentTemplateByID(ctx, db.GetDocumentTemplateByIDParams{TenantID: tenantID, ID: id})
	if notFound(err) {
		return domain.Template{}, false, nil
	}
	if err != nil {
		return domain.Template{}, false, fmt.Errorf("get template: %w", err)
	}
	return toTemplate(row), true, nil
}

func (r *Repository) ListTemplates(ctx context.Context, tenantID uuid.UUID) ([]domain.Template, error) {
	rows, err := r.queries(ctx).ListDocumentTemplates(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list templates: %w", err)
	}
	out := make([]domain.Template, len(rows))
	for i, row := range rows {
		out[i] = toTemplate(row)
	}
	return out, nil
}

func (r *Repository) CreateTemplate(ctx context.Context, t domain.Template) (domain.Template, error) {
	if t.IsDefault {
		if err := r.queries(ctx).ClearDefaultDocumentTemplate(ctx, db.ClearDefaultDocumentTemplateParams{TenantID: t.TenantID, Kind: string(t.Kind)}); err != nil {
			return domain.Template{}, fmt.Errorf("clear default template: %w", err)
		}
	}
	row, err := r.queries(ctx).CreateDocumentTemplate(ctx, db.CreateDocumentTemplateParams{
		TenantID: t.TenantID, Kind: string(t.Kind), Name: t.Name, Engine: string(t.Engine), Body: t.Body,
		Variables: mustJSON(nonNilStrings(t.Variables)), IsDefault: t.IsDefault, CreatedBy: pdatabase.NullUUID(t.CreatedBy),
		LetterheadAssetID: pdatabase.NullUUID(t.LetterheadAssetID),
	})
	if err != nil {
		return domain.Template{}, fmt.Errorf("create template: %w", err)
	}
	return toTemplate(row), nil
}

func (r *Repository) UpdateTemplate(ctx context.Context, tenantID, id uuid.UUID, name, body string, variables []string, letterheadAssetID uuid.NullUUID) (domain.Template, error) {
	row, err := r.queries(ctx).UpdateDocumentTemplate(ctx, db.UpdateDocumentTemplateParams{
		TenantID: tenantID, ID: id, Name: name, Body: body, Variables: mustJSON(nonNilStrings(variables)),
		LetterheadAssetID: pdatabase.NullUUID(letterheadAssetID),
	})
	if err != nil {
		return domain.Template{}, fmt.Errorf("update template: %w", err)
	}
	return toTemplate(row), nil
}

func (r *Repository) SetDefaultTemplate(ctx context.Context, tenantID, id uuid.UUID, kind domain.TemplateKind) (domain.Template, error) {
	if err := r.queries(ctx).ClearDefaultDocumentTemplate(ctx, db.ClearDefaultDocumentTemplateParams{TenantID: tenantID, Kind: string(kind)}); err != nil {
		return domain.Template{}, fmt.Errorf("clear default template: %w", err)
	}
	row, err := r.queries(ctx).SetDefaultDocumentTemplate(ctx, db.SetDefaultDocumentTemplateParams{TenantID: tenantID, ID: id})
	if err != nil {
		return domain.Template{}, fmt.Errorf("set default template: %w", err)
	}
	return toTemplate(row), nil
}

func (r *Repository) NextSequenceValue(ctx context.Context, tenantID uuid.UUID, kind string, academicYearID uuid.UUID) (int64, error) {
	return r.queries(ctx).NextDocumentSequenceValue(ctx, db.NextDocumentSequenceValueParams{TenantID: tenantID, Kind: kind, AcademicYearID: academicYearID})
}

func toIssuedDocument(row db.IssuedDocument) domain.IssuedDocument {
	return domain.IssuedDocument{
		ID: row.ID, TenantID: row.TenantID, Kind: row.Kind, EntityType: row.EntityType, EntityID: row.EntityID, Number: row.Number,
		AssetID: pdatabase.UUIDOrNil(row.AssetID), SHA256: row.Sha256, VerificationCodeHash: row.VerificationCodeHash,
		IssuedBy: pdatabase.UUIDOrNil(row.IssuedBy), IssuedAt: pdatabase.TimeOrZero(row.IssuedAt), RevokedAt: pdatabase.TimePtr(row.RevokedAt),
	}
}

func (r *Repository) CreateIssuedDocument(ctx context.Context, d domain.IssuedDocument) (domain.IssuedDocument, error) {
	row, err := r.queries(ctx).CreateIssuedDocument(ctx, db.CreateIssuedDocumentParams{
		TenantID: d.TenantID, Kind: d.Kind, EntityType: d.EntityType, EntityID: d.EntityID, Number: d.Number,
		AssetID: pdatabase.NullUUID(d.AssetID), Sha256: d.SHA256, VerificationCodeHash: d.VerificationCodeHash, IssuedBy: pdatabase.NullUUID(d.IssuedBy),
	})
	if err != nil {
		return domain.IssuedDocument{}, fmt.Errorf("create issued document: %w", err)
	}
	return toIssuedDocument(row), nil
}

func (r *Repository) GetIssuedDocumentByVerificationHash(ctx context.Context, tenantID uuid.UUID, hash []byte) (domain.IssuedDocument, bool, error) {
	row, err := r.queries(ctx).GetIssuedDocumentByVerificationHash(ctx, db.GetIssuedDocumentByVerificationHashParams{TenantID: tenantID, VerificationCodeHash: hash})
	if notFound(err) {
		return domain.IssuedDocument{}, false, nil
	}
	if err != nil {
		return domain.IssuedDocument{}, false, fmt.Errorf("get issued document: %w", err)
	}
	return toIssuedDocument(row), true, nil
}

func (r *Repository) GetIssuedDocumentByEntity(ctx context.Context, tenantID uuid.UUID, entityType string, entityID uuid.UUID, kind string) (domain.IssuedDocument, bool, error) {
	row, err := r.queries(ctx).GetIssuedDocumentByEntity(ctx, db.GetIssuedDocumentByEntityParams{TenantID: tenantID, EntityType: entityType, EntityID: entityID, Kind: kind})
	if notFound(err) {
		return domain.IssuedDocument{}, false, nil
	}
	if err != nil {
		return domain.IssuedDocument{}, false, fmt.Errorf("get issued document by entity: %w", err)
	}
	return toIssuedDocument(row), true, nil
}

// Cross-module reads (replace with reader interfaces after the academic
// and identity modules expose them).

func (r *Repository) GetActiveEnrollment(ctx context.Context, tenantID, academicYearID, studentUserID uuid.UUID) (service.EnrollmentInfo, bool, error) {
	row, err := r.queries(ctx).GetActiveEnrollment(ctx, db.GetActiveEnrollmentParams{TenantID: tenantID, AcademicYearID: academicYearID, StudentUserID: studentUserID})
	if notFound(err) {
		return service.EnrollmentInfo{}, false, nil
	}
	if err != nil {
		return service.EnrollmentInfo{}, false, fmt.Errorf("get active enrollment: %w", err)
	}
	return service.EnrollmentInfo{ClassID: row.ClassID, ClassName: row.ClassName, HomeroomTeacherID: pdatabase.UUIDOrNil(row.HomeroomTeacherID)}, true, nil
}

func (r *Repository) GetClassName(ctx context.Context, tenantID, classID uuid.UUID) (string, error) {
	return r.queries(ctx).GetClassName(ctx, db.GetClassNameParams{TenantID: tenantID, ID: classID})
}

func (r *Repository) GetUserName(ctx context.Context, tenantID, userID uuid.UUID) (string, error) {
	return r.queries(ctx).GetUserName(ctx, db.GetUserNameParams{TenantID: tenantID, ID: userID})
}

func (r *Repository) GetStudentGuardianName(ctx context.Context, tenantID, userID uuid.UUID) (string, error) {
	name, err := r.queries(ctx).GetStudentGuardianName(ctx, db.GetStudentGuardianNameParams{TenantID: tenantID, UserID: userID})
	if notFound(err) {
		return "", nil
	}
	return name, err
}

func (r *Repository) IsActiveTeacher(ctx context.Context, tenantID, userID uuid.UUID) (bool, error) {
	return r.queries(ctx).IsActiveTeacher(ctx, db.IsActiveTeacherParams{TenantID: tenantID, UserID: userID})
}

func (r *Repository) HasActiveDuty(ctx context.Context, tenantID, academicYearID, userID uuid.UUID, slug string, classID uuid.NullUUID, today time.Time) (bool, error) {
	return r.queries(ctx).HasActiveDuty(ctx, db.HasActiveDutyParams{
		TenantID: tenantID, AcademicYearID: academicYearID, UserID: userID, Slug: slug, ClassID: pdatabase.NullUUID(classID), Today: pdatabase.Date(today),
	})
}

func (r *Repository) GetPeriod(ctx context.Context, tenantID, periodID uuid.UUID) (service.PeriodInfo, error) {
	row, err := r.queries(ctx).GetPeriod(ctx, db.GetPeriodParams{TenantID: tenantID, ID: periodID})
	if err != nil {
		return service.PeriodInfo{}, fmt.Errorf("get period: %w", err)
	}
	return service.PeriodInfo{
		ID: row.ID, TemplateID: row.TemplateID, Name: row.Name, Sequence: int(row.Sequence),
		StartsAt: pgTimeToDuration(row.StartsAt), EndsAt: pgTimeToDuration(row.EndsAt),
	}, nil
}

func pgTimeToDuration(t pgtype.Time) time.Duration {
	if !t.Valid {
		return 0
	}
	return time.Duration(t.Microseconds) * time.Microsecond
}

func (r *Repository) ListActiveTenants(ctx context.Context) ([]service.TenantInfo, error) {
	rows, err := db.New(r.pool).ListActiveTenants(ctx)
	if err != nil {
		return nil, fmt.Errorf("list tenants: %w", err)
	}
	out := make([]service.TenantInfo, len(rows))
	for i, row := range rows {
		out[i] = service.TenantInfo{ID: row.ID, Timezone: row.Timezone}
	}
	return out, nil
}

func (r *Repository) CreateAsset(ctx context.Context, tenantID uuid.UUID, bucket, objectKey, mime string, sizeBytes int64, sha256Hex, kind, visibility string, createdBy uuid.UUID) (uuid.UUID, error) {
	return r.queries(ctx).CreatePermitsAsset(ctx, db.CreatePermitsAssetParams{
		TenantID: tenantID, Bucket: bucket, ObjectKey: objectKey, Mime: mime, SizeBytes: sizeBytes, Sha256: sha256Hex,
		Kind: kind, Visibility: visibility, CreatedBy: uuidNullable(createdBy),
	})
}

func (r *Repository) GetAssetObjectKey(ctx context.Context, tenantID, assetID uuid.UUID) (string, error) {
	return r.queries(ctx).GetAssetObjectKey(ctx, db.GetAssetObjectKeyParams{TenantID: tenantID, ID: assetID})
}

func (r *Repository) GetTenantTimezone(ctx context.Context, tenantID uuid.UUID) (string, error) {
	return r.queries(ctx).GetTenantTimezoneForPermits(ctx, tenantID)
}

func (r *Repository) HasPermission(ctx context.Context, tenantID, academicYearID, userID uuid.UUID, permissionCode string, today time.Time) (bool, error) {
	return r.queries(ctx).HasPermission(ctx, db.HasPermissionParams{
		TenantID: tenantID, UserID: userID, PermissionCode: permissionCode, AcademicYearID: academicYearID, Today: pdatabase.Date(today),
	})
}

func (r *Repository) HasRolePermission(ctx context.Context, tenantID, userID uuid.UUID, permissionCode string) (bool, error) {
	return r.queries(ctx).HasRolePermission(ctx, db.HasRolePermissionParams{TenantID: tenantID, UserID: userID, PermissionCode: permissionCode})
}

func (r *Repository) IsStudentProfile(ctx context.Context, tenantID, userID uuid.UUID) (bool, error) {
	return r.queries(ctx).IsStudentProfile(ctx, db.IsStudentProfileParams{TenantID: tenantID, UserID: userID})
}

func (r *Repository) GetStudentNISAndAddress(ctx context.Context, tenantID, studentUserID uuid.UUID) (string, string, error) {
	row, err := r.queries(ctx).GetStudentNISAndAddress(ctx, db.GetStudentNISAndAddressParams{TenantID: tenantID, ID: studentUserID})
	if notFound(err) {
		return "", "", nil
	}
	if err != nil {
		return "", "", fmt.Errorf("get student nis/address: %w", err)
	}
	return row.Nis, row.Address, nil
}

func (r *Repository) GetExitPermitInstanceForSubjectToday(ctx context.Context, tenantID, studentUserID uuid.UUID, today time.Time) (domain.Instance, bool, error) {
	row, err := r.queries(ctx).GetExitPermitInstanceForSubjectToday(ctx, db.GetExitPermitInstanceForSubjectTodayParams{
		TenantID: tenantID, SubjectUserID: studentUserID, Today: pdatabase.Date(today),
	})
	if notFound(err) {
		return domain.Instance{}, false, nil
	}
	if err != nil {
		return domain.Instance{}, false, fmt.Errorf("get exit permit instance for subject today: %w", err)
	}
	return toInstance(row), true, nil
}

func (r *Repository) ListExitPermitsForApproval(ctx context.Context, tenantID, callerUserID uuid.UUID, today time.Time) ([]service.ExitPermitReviewItem, error) {
	rows, err := r.queries(ctx).ListExitPermitsForApproval(ctx, db.ListExitPermitsForApprovalParams{TenantID: tenantID, UserID: callerUserID, Today: pdatabase.Date(today)})
	if err != nil {
		return nil, fmt.Errorf("list exit permits for approval: %w", err)
	}
	out := make([]service.ExitPermitReviewItem, len(rows))
	for i, row := range rows {
		out[i] = service.ExitPermitReviewItem{
			ExitPermit: domain.ExitPermit{
				InstanceID: row.InstanceID, TenantID: row.TenantID, Destination: row.Destination,
				StartPeriodID: row.StartPeriodID, EndPeriodID: row.EndPeriodID, IssuedAt: pdatabase.TimePtr(row.IssuedAt),
				GateTokenID: pdatabase.UUIDOrNil(row.GateTokenID), ExitedAt: pdatabase.TimePtr(row.ExitedAt),
				SecurityUserID: pdatabase.UUIDOrNil(row.SecurityUserID), StudentNameSnapshot: row.StudentNameSnapshot, ClassNameSnapshot: row.ClassNameSnapshot,
			},
			SubjectUserID: row.SubjectUserID, ClassID: pdatabase.UUIDOrNil(row.ClassID),
			CurrentStageIndex: int(row.CurrentStageIndex), Status: domain.Status(row.Status), OpenedAt: pdatabase.TimeOrZero(row.OpenedAt),
		}
	}
	return out, nil
}

func (r *Repository) ListExitPermitsForYear(ctx context.Context, tenantID, academicYearID uuid.UUID) ([]service.ExitPermitReportRow, error) {
	yearRange, err := r.queries(ctx).GetAcademicYearRange(ctx, db.GetAcademicYearRangeParams{TenantID: tenantID, ID: academicYearID})
	if err != nil {
		return nil, fmt.Errorf("get academic year range: %w", err)
	}
	from := pdatabase.DateOrZero(yearRange.StartsOn)
	// ends_on is inclusive; opened_at < to needs the day after.
	to := pdatabase.DateOrZero(yearRange.EndsOn).AddDate(0, 0, 1)

	rows, err := r.queries(ctx).ListExitPermitsForReport(ctx, db.ListExitPermitsForReportParams{
		TenantID: tenantID, AcademicYearID: academicYearID,
		OpenedAt: pdatabase.Timestamptz(from), OpenedAt_2: pdatabase.Timestamptz(to),
	})
	if err != nil {
		return nil, fmt.Errorf("list exit permits for year: %w", err)
	}
	out := make([]service.ExitPermitReportRow, len(rows))
	for i, row := range rows {
		out[i] = service.ExitPermitReportRow{
			ExitPermit: domain.ExitPermit{
				InstanceID: row.InstanceID, TenantID: row.TenantID, Destination: row.Destination,
				StartPeriodID: row.StartPeriodID, EndPeriodID: row.EndPeriodID, IssuedAt: pdatabase.TimePtr(row.IssuedAt),
				GateTokenID: pdatabase.UUIDOrNil(row.GateTokenID), ExitedAt: pdatabase.TimePtr(row.ExitedAt),
				SecurityUserID: pdatabase.UUIDOrNil(row.SecurityUserID), StudentNameSnapshot: row.StudentNameSnapshot, ClassNameSnapshot: row.ClassNameSnapshot,
			},
			Status: domain.Status(row.Status), OpenedAt: pdatabase.TimeOrZero(row.OpenedAt), ClosedAt: pdatabase.TimePtr(row.ClosedAt),
		}
	}
	return out, nil
}

func (r *Repository) GetLatestPolicy(ctx context.Context, tenantID uuid.UUID, kind string) ([]byte, int, bool, error) {
	row, err := r.queries(ctx).GetLatestTenantPolicyForPermits(ctx, db.GetLatestTenantPolicyForPermitsParams{TenantID: tenantID, Kind: kind})
	if notFound(err) {
		return nil, 0, false, nil
	}
	if err != nil {
		return nil, 0, false, fmt.Errorf("get latest tenant policy: %w", err)
	}
	return row.Config, int(row.Version), true, nil
}

func (r *Repository) CreatePolicy(ctx context.Context, tenantID uuid.UUID, kind string, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error {
	_, err := r.queries(ctx).CreateTenantPolicyForPermits(ctx, db.CreateTenantPolicyForPermitsParams{
		TenantID: tenantID, Kind: kind, Version: int32(version), //nolint:gosec // policy versions are small
		Config: config, EffectiveFrom: pdatabase.Date(effectiveFrom), CreatedBy: pdatabase.NullUUID(createdBy),
	})
	return err
}

func nonNilStrings(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
