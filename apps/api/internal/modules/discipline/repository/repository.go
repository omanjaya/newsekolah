// Package repository is the sqlc-backed implementation of the discipline
// service's data boundary.
package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

type Repository struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

var _ service.Repository = (*Repository)(nil)

func (r *Repository) queries(ctx context.Context) *db.Queries {
	if tx, ok := pdatabase.TxFromContext(ctx); ok {
		return db.New(tx)
	}
	return db.New(r.pool)
}

func isUnique(err error) bool {
	var pgErr interface{ SQLState() string }
	return errors.As(err, &pgErr) && pgErr.SQLState() == "23505"
}

// Violation types.

func (r *Repository) ListViolationTypes(ctx context.Context, tenantID uuid.UUID, includeInactive bool, search string) ([]domain.ViolationType, error) {
	rows, err := r.queries(ctx).ListViolationTypes(ctx, db.ListViolationTypesParams{TenantID: tenantID, IncludeInactive: includeInactive, Search: pdatabase.Text(search)})
	if err != nil {
		return nil, fmt.Errorf("list violation types: %w", err)
	}
	out := make([]domain.ViolationType, len(rows))
	for i, row := range rows {
		out[i] = toType(row)
	}
	return out, nil
}

func (r *Repository) GetViolationType(ctx context.Context, tenantID, id uuid.UUID) (domain.ViolationType, bool, error) {
	row, err := r.queries(ctx).GetViolationType(ctx, db.GetViolationTypeParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ViolationType{}, false, nil
	}
	if err != nil {
		return domain.ViolationType{}, false, fmt.Errorf("get violation type: %w", err)
	}
	return toType(row), true, nil
}

func (r *Repository) CreateViolationType(ctx context.Context, t domain.ViolationType) (domain.ViolationType, error) {
	row, err := r.queries(ctx).CreateViolationType(ctx, db.CreateViolationTypeParams{
		TenantID: t.TenantID, Code: t.Code, Name: t.Name, Points: int32(t.Points), Category: t.Category, //nolint:gosec // validated >= 0 and small
	})
	if isUnique(err) {
		return domain.ViolationType{}, domain.ErrViolationTypeCodeExists
	}
	if err != nil {
		return domain.ViolationType{}, fmt.Errorf("create violation type: %w", err)
	}
	return toType(row), nil
}

func (r *Repository) UpdateViolationType(ctx context.Context, t domain.ViolationType) (domain.ViolationType, error) {
	row, err := r.queries(ctx).UpdateViolationType(ctx, db.UpdateViolationTypeParams{
		TenantID: t.TenantID, ID: t.ID, Code: t.Code, Name: t.Name, Points: int32(t.Points), Category: t.Category, IsActive: t.IsActive, //nolint:gosec // validated
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ViolationType{}, domain.ErrViolationTypeNotFound
	}
	if isUnique(err) {
		return domain.ViolationType{}, domain.ErrViolationTypeCodeExists
	}
	if err != nil {
		return domain.ViolationType{}, fmt.Errorf("update violation type: %w", err)
	}
	return toType(row), nil
}

func (r *Repository) DeleteViolationType(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).DeleteViolationType(ctx, db.DeleteViolationTypeParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete violation type: %w", err)
	}
	return nil
}

// Records.

func (r *Repository) CreateRecord(ctx context.Context, rec domain.ViolationRecord) (domain.ViolationRecord, error) {
	row, err := r.queries(ctx).CreateViolationRecord(ctx, db.CreateViolationRecordParams{
		TenantID: rec.TenantID, AcademicYearID: rec.AcademicYearID, StudentUserID: rec.StudentUserID, ViolationTypeID: rec.ViolationTypeID,
		PointsSnapshot: int32(rec.PointsSnapshot), OccurredOn: pdatabase.Date(rec.OccurredOn), //nolint:gosec // validated
		AttendanceSessionID: pdatabase.NullUUID(rec.AttendanceSessionID), WorkflowInstanceID: pdatabase.NullUUID(rec.WorkflowInstanceID),
		ReporterUserID: rec.ReporterUserID, Notes: rec.Notes,
	})
	if err != nil {
		return domain.ViolationRecord{}, fmt.Errorf("create violation record: %w", err)
	}
	return toRecord(row, "", "", ""), nil
}

func (r *Repository) DeleteRecordsBySessionStudent(ctx context.Context, tenantID, sessionID, studentUserID uuid.UUID) error {
	if err := r.queries(ctx).DeleteViolationRecordsBySessionStudent(ctx, db.DeleteViolationRecordsBySessionStudentParams{
		TenantID: tenantID, AttendanceSessionID: pgtype.UUID{Bytes: sessionID, Valid: true}, StudentUserID: studentUserID,
	}); err != nil {
		return fmt.Errorf("delete session violation records: %w", err)
	}
	return nil
}

func (r *Repository) GetRecord(ctx context.Context, tenantID, id uuid.UUID) (domain.ViolationRecord, bool, error) {
	row, err := r.queries(ctx).GetViolationRecord(ctx, db.GetViolationRecordParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ViolationRecord{}, false, nil
	}
	if err != nil {
		return domain.ViolationRecord{}, false, fmt.Errorf("get violation record: %w", err)
	}
	return toRecord(row, "", "", ""), true, nil
}

func (r *Repository) GetRecordByWorkflow(ctx context.Context, tenantID, workflowInstanceID, violationTypeID uuid.UUID) (domain.ViolationRecord, bool, error) {
	row, err := r.queries(ctx).GetViolationRecordByWorkflow(ctx, db.GetViolationRecordByWorkflowParams{
		TenantID: tenantID, WorkflowInstanceID: pgtype.UUID{Bytes: workflowInstanceID, Valid: true}, ViolationTypeID: violationTypeID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ViolationRecord{}, false, nil
	}
	if err != nil {
		return domain.ViolationRecord{}, false, fmt.Errorf("get violation record by workflow: %w", err)
	}
	return toRecord(row, "", "", ""), true, nil
}

func (r *Repository) VoidRecord(ctx context.Context, tenantID, id, voidedBy uuid.UUID, reason string) (domain.ViolationRecord, bool, error) {
	row, err := r.queries(ctx).VoidViolationRecord(ctx, db.VoidViolationRecordParams{
		TenantID: tenantID, ID: id, VoidedBy: pgtype.UUID{Bytes: voidedBy, Valid: true}, VoidReason: pdatabase.Text(reason),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ViolationRecord{}, false, nil
	}
	if err != nil {
		return domain.ViolationRecord{}, false, fmt.Errorf("void violation record: %w", err)
	}
	return toRecord(row, "", "", ""), true, nil
}

func (r *Repository) ListRecordsForStudent(ctx context.Context, tenantID, yearID, studentID uuid.UUID) ([]domain.ViolationRecord, error) {
	rows, err := r.queries(ctx).ListViolationRecordsForStudent(ctx, db.ListViolationRecordsForStudentParams{TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID})
	if err != nil {
		return nil, fmt.Errorf("list student violations: %w", err)
	}
	out := make([]domain.ViolationRecord, len(rows))
	for i, row := range rows {
		out[i] = toRecord(db.ViolationRecord{
			ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, StudentUserID: row.StudentUserID, ViolationTypeID: row.ViolationTypeID,
			PointsSnapshot: row.PointsSnapshot, OccurredOn: row.OccurredOn, AttendanceSessionID: row.AttendanceSessionID, WorkflowInstanceID: row.WorkflowInstanceID,
			ReporterUserID: row.ReporterUserID, Notes: row.Notes, CreatedAt: row.CreatedAt, VoidedAt: row.VoidedAt, VoidedBy: row.VoidedBy, VoidReason: row.VoidReason,
		}, row.TypeCode, row.TypeName, row.TypeCategory)
	}
	return out, nil
}

func (r *Repository) ListRecords(ctx context.Context, tenantID, yearID uuid.UUID, f service.RecordFilter) ([]domain.ViolationRecord, error) {
	params := db.ListViolationRecordsParams{
		TenantID: tenantID, AcademicYearID: yearID, Limit: int32(f.Limit), Offset: int32(f.Offset), //nolint:gosec // clamped by the service
		ClassID: pdatabase.NullUUID(f.ClassID), IncludeVoided: f.IncludeVoided,
	}
	if f.From != nil {
		params.FromDate = pdatabase.Date(*f.From)
	}
	if f.To != nil {
		params.ToDate = pdatabase.Date(*f.To)
	}
	rows, err := r.queries(ctx).ListViolationRecords(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("list violations: %w", err)
	}
	out := make([]domain.ViolationRecord, len(rows))
	for i, row := range rows {
		out[i] = toRecord(db.ViolationRecord{
			ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, StudentUserID: row.StudentUserID, ViolationTypeID: row.ViolationTypeID,
			PointsSnapshot: row.PointsSnapshot, OccurredOn: row.OccurredOn, AttendanceSessionID: row.AttendanceSessionID, WorkflowInstanceID: row.WorkflowInstanceID,
			ReporterUserID: row.ReporterUserID, Notes: row.Notes, CreatedAt: row.CreatedAt, VoidedAt: row.VoidedAt, VoidedBy: row.VoidedBy, VoidReason: row.VoidReason,
		}, row.TypeCode, row.TypeName, row.TypeCategory)
	}
	return out, nil
}

func (r *Repository) SumActivePoints(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (int, error) {
	total, err := r.queries(ctx).SumActivePoints(ctx, db.SumActivePointsParams{TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID})
	if err != nil {
		return 0, fmt.Errorf("sum points: %w", err)
	}
	return int(total), nil
}

func (r *Repository) ListPointTotals(ctx context.Context, tenantID, yearID uuid.UUID, classID uuid.NullUUID, limit int) ([]service.PointTotal, error) {
	rows, err := r.queries(ctx).ListStudentPointTotals(ctx, db.ListStudentPointTotalsParams{
		TenantID: tenantID, AcademicYearID: yearID, Limit: int32(limit), ClassID: pdatabase.NullUUID(classID), //nolint:gosec // clamped
	})
	if err != nil {
		return nil, fmt.Errorf("list point totals: %w", err)
	}
	out := make([]service.PointTotal, len(rows))
	for i, row := range rows {
		out[i] = service.PointTotal{StudentUserID: row.StudentUserID, Total: int(row.Total), RecordCount: int(row.RecordCount), LastOccurredOn: pdatabase.DateOrZero(row.LastOccurredOn)}
	}
	return out, nil
}

func (r *Repository) ListActivePoints(ctx context.Context, tenantID, yearID uuid.UUID, classID uuid.NullUUID) ([]service.StudentPointRecord, error) {
	rows, err := r.queries(ctx).ListActivePointsByYear(ctx, db.ListActivePointsByYearParams{TenantID: tenantID, AcademicYearID: yearID, ClassID: pdatabase.NullUUID(classID)})
	if err != nil {
		return nil, fmt.Errorf("list active points: %w", err)
	}
	out := make([]service.StudentPointRecord, len(rows))
	for i, row := range rows {
		out[i] = service.StudentPointRecord{StudentUserID: row.StudentUserID, Points: int(row.PointsSnapshot), OccurredOn: pdatabase.DateOrZero(row.OccurredOn)}
	}
	return out, nil
}

func (r *Repository) ListPointsPreview(ctx context.Context, tenantID, yearID uuid.UUID, studentIDs []uuid.UUID) ([]service.PointsPreviewEntry, error) {
	rows, err := r.queries(ctx).ListPointsPreviewForStudents(ctx, db.ListPointsPreviewForStudentsParams{TenantID: tenantID, AcademicYearID: yearID, StudentIds: studentIDs})
	if err != nil {
		return nil, fmt.Errorf("list points preview: %w", err)
	}
	out := make([]service.PointsPreviewEntry, len(rows))
	for i, row := range rows {
		levels := make([]int, len(row.IssuedLevels))
		for j, l := range row.IssuedLevels {
			levels[j] = int(l)
		}
		out[i] = service.PointsPreviewEntry{StudentUserID: row.StudentUserID, TotalPoints: int(row.TotalPoints), IssuedLevels: levels}
	}
	return out, nil
}

// Violation attachments.

func (r *Repository) CreateViolationAttachment(ctx context.Context, tenantID, recordID, assetID uuid.UUID) (domain.ViolationAttachment, error) {
	row, err := r.queries(ctx).CreateViolationAttachment(ctx, db.CreateViolationAttachmentParams{TenantID: tenantID, ViolationRecordID: recordID, AssetID: assetID})
	if err != nil {
		return domain.ViolationAttachment{}, fmt.Errorf("create violation attachment: %w", err)
	}
	return toViolationAttachment(row), nil
}

func (r *Repository) ListViolationAttachments(ctx context.Context, tenantID, recordID uuid.UUID) ([]domain.ViolationAttachment, error) {
	rows, err := r.queries(ctx).ListViolationAttachments(ctx, db.ListViolationAttachmentsParams{TenantID: tenantID, ViolationRecordID: recordID})
	if err != nil {
		return nil, fmt.Errorf("list violation attachments: %w", err)
	}
	out := make([]domain.ViolationAttachment, len(rows))
	for i, row := range rows {
		out[i] = toViolationAttachment(row)
	}
	return out, nil
}

func (r *Repository) GetViolationAttachment(ctx context.Context, tenantID, id uuid.UUID) (domain.ViolationAttachment, bool, error) {
	row, err := r.queries(ctx).GetViolationAttachment(ctx, db.GetViolationAttachmentParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ViolationAttachment{}, false, nil
	}
	if err != nil {
		return domain.ViolationAttachment{}, false, fmt.Errorf("get violation attachment: %w", err)
	}
	return toViolationAttachment(row), true, nil
}

// Letters.

func (r *Repository) CreateLetter(ctx context.Context, l domain.WarningLetter) (domain.WarningLetter, error) {
	row, err := r.queries(ctx).CreateWarningLetter(ctx, db.CreateWarningLetterParams{
		TenantID: l.TenantID, AcademicYearID: l.AcademicYearID, StudentUserID: l.StudentUserID,
		Level: int32(l.Level), LevelLabel: l.LevelLabel, ThresholdPoints: int32(l.ThresholdPoints), TotalPoints: int32(l.TotalPoints), //nolint:gosec // small ints
		LetterNumber: l.LetterNumber, IssuedBy: pdatabase.NullUUID(l.IssuedBy), Snapshot: l.Snapshot, DocumentAssetID: pdatabase.NullUUID(l.DocumentAssetID),
	})
	if isUnique(err) {
		return domain.WarningLetter{}, domain.ErrLetterAlreadyIssued
	}
	if err != nil {
		return domain.WarningLetter{}, fmt.Errorf("create warning letter: %w", err)
	}
	return toLetter(row), nil
}

func (r *Repository) GetLetter(ctx context.Context, tenantID, id uuid.UUID) (domain.WarningLetter, bool, error) {
	row, err := r.queries(ctx).GetWarningLetter(ctx, db.GetWarningLetterParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WarningLetter{}, false, nil
	}
	if err != nil {
		return domain.WarningLetter{}, false, fmt.Errorf("get warning letter: %w", err)
	}
	return toLetter(row), true, nil
}

func (r *Repository) ListLettersForStudent(ctx context.Context, tenantID, yearID, studentID uuid.UUID) ([]domain.WarningLetter, error) {
	rows, err := r.queries(ctx).ListWarningLettersForStudent(ctx, db.ListWarningLettersForStudentParams{TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID})
	if err != nil {
		return nil, fmt.Errorf("list student letters: %w", err)
	}
	return toLetters(rows), nil
}

func (r *Repository) ListLetters(ctx context.Context, tenantID, yearID uuid.UUID, classID uuid.NullUUID, limit, offset int) ([]domain.WarningLetter, error) {
	rows, err := r.queries(ctx).ListWarningLetters(ctx, db.ListWarningLettersParams{
		TenantID: tenantID, AcademicYearID: yearID, Limit: int32(limit), Offset: int32(offset), ClassID: pdatabase.NullUUID(classID), //nolint:gosec // clamped
	})
	if err != nil {
		return nil, fmt.Errorf("list letters: %w", err)
	}
	return toLetters(rows), nil
}

func (r *Repository) ListSPCandidates(ctx context.Context, tenantID, yearID uuid.UUID, f service.CandidateFilter) ([]service.SPCandidate, error) {
	maxPoints := pgtype.Int4{}
	if f.MaxPoints != nil {
		maxPoints = pgtype.Int4{Int32: int32(*f.MaxPoints), Valid: true} //nolint:gosec // point thresholds are small
	}
	rows, err := r.queries(ctx).ListSPCandidates(ctx, db.ListSPCandidatesParams{
		TenantID: tenantID, AcademicYearID: yearID, Limit: int32(f.Limit), Offset: int32(f.Offset), //nolint:gosec // clamped by the service
		ClassID: pdatabase.NullUUID(f.ClassID), Search: pdatabase.Text(f.Search), MinPoints: int32(f.MinPoints), MaxPoints: maxPoints, //nolint:gosec // clamped
	})
	if err != nil {
		return nil, fmt.Errorf("list SP candidates: %w", err)
	}
	out := make([]service.SPCandidate, len(rows))
	for i, row := range rows {
		levels := make([]int, len(row.IssuedLevels))
		for j, l := range row.IssuedLevels {
			levels[j] = int(l)
		}
		out[i] = service.SPCandidate{
			StudentUserID: row.StudentUserID, StudentName: row.StudentName, NIS: row.Nis, ClassName: row.ClassName,
			TotalPoints: int(row.Total), IssuedLevels: levels,
		}
	}
	return out, nil
}

// Counselings.

func (r *Repository) CreateCounseling(ctx context.Context, c domain.Counseling, content, followUp, careerGoals, problemDescription []byte, keyID string) (domain.Counseling, error) {
	row, err := r.queries(ctx).CreateCounseling(ctx, db.CreateCounselingParams{
		TenantID: c.TenantID, AcademicYearID: c.AcademicYearID, StudentUserID: c.StudentUserID, CounselorUserID: c.CounselorUserID,
		SessionAt: pdatabase.Timestamptz(c.SessionAt), Kind: string(c.Kind), Topic: string(c.Topic), Title: c.Title,
		ContentEncrypted: content, ContentKeyID: keyID, FollowUpPlanEncrypted: followUp,
		CareerGoalsEncrypted: careerGoals, ProblemDescriptionEncrypted: problemDescription, Visibility: string(c.Visibility),
	})
	if err != nil {
		return domain.Counseling{}, fmt.Errorf("create counseling: %w", err)
	}
	return toCounseling(row).Counseling, nil
}

func (r *Repository) UpdateCounseling(ctx context.Context, c domain.Counseling, content, followUp, careerGoals, problemDescription []byte, keyID string) (domain.Counseling, error) {
	row, err := r.queries(ctx).UpdateCounseling(ctx, db.UpdateCounselingParams{
		TenantID: c.TenantID, ID: c.ID, SessionAt: pdatabase.Timestamptz(c.SessionAt), Kind: string(c.Kind), Topic: string(c.Topic), Title: c.Title,
		ContentEncrypted: content, ContentKeyID: keyID, FollowUpPlanEncrypted: followUp,
		CareerGoalsEncrypted: careerGoals, ProblemDescriptionEncrypted: problemDescription, Visibility: string(c.Visibility),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Counseling{}, domain.ErrCounselingNotFound
	}
	if err != nil {
		return domain.Counseling{}, fmt.Errorf("update counseling: %w", err)
	}
	return toCounseling(row).Counseling, nil
}

func (r *Repository) GetCounseling(ctx context.Context, tenantID, id uuid.UUID) (service.EncryptedCounseling, bool, error) {
	row, err := r.queries(ctx).GetCounseling(ctx, db.GetCounselingParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return service.EncryptedCounseling{}, false, nil
	}
	if err != nil {
		return service.EncryptedCounseling{}, false, fmt.Errorf("get counseling: %w", err)
	}
	return toCounseling(row), true, nil
}

func (r *Repository) ListCounselingsForStudent(ctx context.Context, tenantID, yearID, studentID uuid.UUID) ([]service.EncryptedCounseling, error) {
	rows, err := r.queries(ctx).ListCounselingsForStudent(ctx, db.ListCounselingsForStudentParams{TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID})
	if err != nil {
		return nil, fmt.Errorf("list student counselings: %w", err)
	}
	return toCounselings(rows), nil
}

func (r *Repository) ListCounselingsByCounselor(ctx context.Context, tenantID, yearID, counselorID uuid.UUID, limit, offset int) ([]service.EncryptedCounseling, error) {
	rows, err := r.queries(ctx).ListCounselingsByCounselor(ctx, db.ListCounselingsByCounselorParams{
		TenantID: tenantID, AcademicYearID: yearID, CounselorUserID: counselorID, Limit: int32(limit), Offset: int32(offset), //nolint:gosec // clamped
	})
	if err != nil {
		return nil, fmt.Errorf("list counselings: %w", err)
	}
	return toCounselings(rows), nil
}

func (r *Repository) ListCounselingsByVisibility(ctx context.Context, tenantID, yearID uuid.UUID, topic string, limit, offset int) ([]service.EncryptedCounseling, error) {
	rows, err := r.queries(ctx).ListCounselingsByVisibility(ctx, db.ListCounselingsByVisibilityParams{
		TenantID: tenantID, AcademicYearID: yearID, Limit: int32(limit), Offset: int32(offset), Topic: pdatabase.Text(topic), //nolint:gosec // clamped
	})
	if err != nil {
		return nil, fmt.Errorf("list bk team counselings: %w", err)
	}
	return toCounselings(rows), nil
}

func (r *Repository) DeleteCounseling(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).DeleteCounseling(ctx, db.DeleteCounselingParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete counseling: %w", err)
	}
	return nil
}

func (r *Repository) CreateCounselingAttachment(ctx context.Context, tenantID, counselingID, assetID uuid.UUID) (domain.CounselingAttachment, error) {
	row, err := r.queries(ctx).CreateCounselingAttachment(ctx, db.CreateCounselingAttachmentParams{TenantID: tenantID, CounselingID: counselingID, AssetID: assetID})
	if err != nil {
		return domain.CounselingAttachment{}, fmt.Errorf("create counseling attachment: %w", err)
	}
	return toAttachment(row), nil
}

func (r *Repository) ListCounselingAttachments(ctx context.Context, tenantID, counselingID uuid.UUID) ([]domain.CounselingAttachment, error) {
	rows, err := r.queries(ctx).ListCounselingAttachments(ctx, db.ListCounselingAttachmentsParams{TenantID: tenantID, CounselingID: counselingID})
	if err != nil {
		return nil, fmt.Errorf("list counseling attachments: %w", err)
	}
	out := make([]domain.CounselingAttachment, len(rows))
	for i, row := range rows {
		out[i] = toAttachment(row)
	}
	return out, nil
}

func (r *Repository) GetCounselingAttachment(ctx context.Context, tenantID, id uuid.UUID) (domain.CounselingAttachment, bool, error) {
	row, err := r.queries(ctx).GetCounselingAttachment(ctx, db.GetCounselingAttachmentParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.CounselingAttachment{}, false, nil
	}
	if err != nil {
		return domain.CounselingAttachment{}, false, fmt.Errorf("get counseling attachment: %w", err)
	}
	return toAttachment(row), true, nil
}

// Policy and cross-module reads.

func (r *Repository) GetLatestPolicy(ctx context.Context, tenantID uuid.UUID, kind string) ([]byte, int, bool, error) {
	row, err := r.queries(ctx).DisciplineGetLatestPolicy(ctx, db.DisciplineGetLatestPolicyParams{TenantID: tenantID, Kind: kind})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, false, nil
	}
	if err != nil {
		return nil, 0, false, fmt.Errorf("get policy: %w", err)
	}
	return row.Config, int(row.Version), true, nil
}

func (r *Repository) CreatePolicy(ctx context.Context, tenantID uuid.UUID, kind string, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error {
	if err := r.queries(ctx).DisciplineCreatePolicy(ctx, db.DisciplineCreatePolicyParams{
		TenantID: tenantID, Kind: kind, Version: int32(version), Config: config, EffectiveFrom: pdatabase.Date(effectiveFrom), CreatedBy: pdatabase.NullUUID(createdBy), //nolint:gosec // small
	}); err != nil {
		return fmt.Errorf("create policy: %w", err)
	}
	return nil
}

func (r *Repository) StudentSnapshot(ctx context.Context, tenantID, studentID, yearID uuid.UUID) (service.StudentSnapshot, error) {
	row, err := r.queries(ctx).DisciplineStudentSnapshot(ctx, db.DisciplineStudentSnapshotParams{TenantID: tenantID, ID: studentID, AcademicYearID: yearID})
	if err != nil {
		return service.StudentSnapshot{}, fmt.Errorf("student snapshot: %w", err)
	}
	return service.StudentSnapshot{StudentName: row.StudentName, ClassName: row.ClassName, GuardianName: row.GuardianName, NIS: row.Nis}, nil
}

func (r *Repository) StudentEligible(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (bool, bool, error) {
	row, err := r.queries(ctx).DisciplineStudentEligible(ctx, db.DisciplineStudentEligibleParams{TenantID: tenantID, ID: studentID, AcademicYearID: yearID})
	if err != nil {
		return false, false, fmt.Errorf("student eligible: %w", err)
	}
	return row.Enrolled, row.UserActive, nil
}

func (r *Repository) CreateAsset(ctx context.Context, tenantID uuid.UUID, bucket, objectKey, mime string, sizeBytes int64, sha256Hex, kind, visibility string, createdBy uuid.UUID) (uuid.UUID, error) {
	id, err := r.queries(ctx).DisciplineCreateAsset(ctx, db.DisciplineCreateAssetParams{
		TenantID: tenantID, Bucket: bucket, ObjectKey: objectKey, Mime: mime, SizeBytes: sizeBytes, Sha256: sha256Hex,
		Kind: kind, Visibility: visibility, CreatedBy: pgtype.UUID{Bytes: createdBy, Valid: true},
	})
	if err != nil {
		return uuid.Nil, fmt.Errorf("create asset: %w", err)
	}
	return id, nil
}

func (r *Repository) GetAsset(ctx context.Context, tenantID, assetID uuid.UUID) (service.AssetInfo, bool, error) {
	row, err := r.queries(ctx).DisciplineGetAsset(ctx, db.DisciplineGetAssetParams{TenantID: tenantID, ID: assetID})
	if errors.Is(err, pgx.ErrNoRows) {
		return service.AssetInfo{}, false, nil
	}
	if err != nil {
		return service.AssetInfo{}, false, fmt.Errorf("get asset: %w", err)
	}
	return service.AssetInfo{ObjectKey: row.ObjectKey, Mime: row.Mime, SizeBytes: row.SizeBytes}, true, nil
}

func (r *Repository) HasActiveDuty(ctx context.Context, tenantID, yearID, userID uuid.UUID, slug string, classID uuid.NullUUID) (bool, error) {
	return r.queries(ctx).DisciplineHasActiveDuty(ctx, db.DisciplineHasActiveDutyParams{TenantID: tenantID, AcademicYearID: yearID, UserID: userID, Slug: slug, ClassID: pdatabase.NullUUID(classID)})
}

func (r *Repository) ActiveClassID(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (uuid.NullUUID, error) {
	id, err := r.queries(ctx).DisciplineActiveClassID(ctx, db.DisciplineActiveClassIDParams{TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID})
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.NullUUID{}, nil
	}
	if err != nil {
		return uuid.NullUUID{}, fmt.Errorf("active class: %w", err)
	}
	return uuid.NullUUID{UUID: id, Valid: true}, nil
}

// Mapping.

func toType(row db.ViolationType) domain.ViolationType {
	return domain.ViolationType{ID: row.ID, TenantID: row.TenantID, Code: row.Code, Name: row.Name, Points: int(row.Points), Category: row.Category, IsActive: row.IsActive}
}

func toRecord(row db.ViolationRecord, code, name, category string) domain.ViolationRecord {
	return domain.ViolationRecord{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, StudentUserID: row.StudentUserID, ViolationTypeID: row.ViolationTypeID,
		TypeCode: code, TypeName: name, TypeCategory: category, PointsSnapshot: int(row.PointsSnapshot), OccurredOn: pdatabase.DateOrZero(row.OccurredOn),
		AttendanceSessionID: pdatabase.UUIDOrNil(row.AttendanceSessionID), WorkflowInstanceID: pdatabase.UUIDOrNil(row.WorkflowInstanceID),
		ReporterUserID: row.ReporterUserID, Notes: row.Notes, CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
		VoidedAt: pdatabase.TimePtr(row.VoidedAt), VoidedBy: pdatabase.UUIDOrNil(row.VoidedBy), VoidReason: pdatabase.TextOrEmpty(row.VoidReason),
	}
}

func toLetter(row db.WarningLetter) domain.WarningLetter {
	return domain.WarningLetter{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, StudentUserID: row.StudentUserID,
		Level: int(row.Level), LevelLabel: row.LevelLabel, ThresholdPoints: int(row.ThresholdPoints), TotalPoints: int(row.TotalPoints),
		LetterNumber: row.LetterNumber, IssuedBy: pdatabase.UUIDOrNil(row.IssuedBy), IssuedAt: pdatabase.TimeOrZero(row.IssuedAt),
		Snapshot: row.Snapshot, DocumentAssetID: pdatabase.UUIDOrNil(row.DocumentAssetID),
	}
}

func toLetters(rows []db.WarningLetter) []domain.WarningLetter {
	out := make([]domain.WarningLetter, len(rows))
	for i, row := range rows {
		out[i] = toLetter(row)
	}
	return out
}

func toCounseling(row db.Counseling) service.EncryptedCounseling {
	return service.EncryptedCounseling{
		Counseling: domain.Counseling{
			ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, StudentUserID: row.StudentUserID, CounselorUserID: row.CounselorUserID,
			SessionAt: pdatabase.TimeOrZero(row.SessionAt), Kind: domain.CounselingKind(row.Kind), Topic: domain.CounselingTopic(row.Topic),
			Title: row.Title, Visibility: domain.Visibility(row.Visibility),
			CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
		},
		ContentEncrypted: row.ContentEncrypted, FollowUpPlanEncrypted: row.FollowUpPlanEncrypted,
		CareerGoalsEncrypted: row.CareerGoalsEncrypted, ProblemDescriptionEncrypted: row.ProblemDescriptionEncrypted, ContentKeyID: row.ContentKeyID,
	}
}

func toCounselings(rows []db.Counseling) []service.EncryptedCounseling {
	out := make([]service.EncryptedCounseling, len(rows))
	for i, row := range rows {
		out[i] = toCounseling(row)
	}
	return out
}

func toAttachment(row db.CounselingAttachment) domain.CounselingAttachment {
	return domain.CounselingAttachment{
		ID: row.ID, TenantID: row.TenantID, CounselingID: row.CounselingID, AssetID: row.AssetID, CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
	}
}

func toViolationAttachment(row db.ViolationAttachment) domain.ViolationAttachment {
	return domain.ViolationAttachment{
		ID: row.ID, TenantID: row.TenantID, ViolationRecordID: row.ViolationRecordID, AssetID: row.AssetID, CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
	}
}
