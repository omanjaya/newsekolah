package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateMemberType(ctx context.Context, t domain.MemberType) (domain.MemberType, error) {
	row, err := r.queries(ctx).CreateMemberType(ctx, db.CreateMemberTypeParams{
		TenantID: t.TenantID, Name: t.Name, MaxLoanItems: int32(t.MaxLoanItems), MaxLoanDays: int32(t.MaxLoanDays), //nolint:gosec // validated
		RenewalDays: int32(t.RenewalDays), MaxRenewals: int32(t.MaxRenewals), FineType: string(t.FineType), //nolint:gosec // validated
		FinePerTenor: int32(t.FinePerTenor), TenorDays: int32(t.TenorDays), SuspendDays: int32(t.SuspendDays), //nolint:gosec // validated
		ValidityMonths: int32(t.ValidityMonths), DefaultForRole: pdatabase.Text(t.DefaultForRole), //nolint:gosec // validated
	})
	if isUnique(err) {
		return domain.MemberType{}, domain.ErrInvalidInput
	}
	if err != nil {
		return domain.MemberType{}, fmt.Errorf("create member type: %w", err)
	}
	return toMemberType(row), nil
}

func (r *Repository) UpdateMemberType(ctx context.Context, t domain.MemberType) (domain.MemberType, error) {
	row, err := r.queries(ctx).UpdateMemberType(ctx, db.UpdateMemberTypeParams{
		TenantID: t.TenantID, ID: t.ID, Name: t.Name, MaxLoanItems: int32(t.MaxLoanItems), MaxLoanDays: int32(t.MaxLoanDays), //nolint:gosec // validated
		RenewalDays: int32(t.RenewalDays), MaxRenewals: int32(t.MaxRenewals), FineType: string(t.FineType), //nolint:gosec // validated
		FinePerTenor: int32(t.FinePerTenor), TenorDays: int32(t.TenorDays), SuspendDays: int32(t.SuspendDays), //nolint:gosec // validated
		ValidityMonths: int32(t.ValidityMonths), DefaultForRole: pdatabase.Text(t.DefaultForRole), //nolint:gosec // validated
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MemberType{}, domain.ErrMemberTypeNotFound
	}
	if err != nil {
		return domain.MemberType{}, fmt.Errorf("update member type: %w", err)
	}
	return toMemberType(row), nil
}

func (r *Repository) DeleteMemberType(ctx context.Context, tenantID, id uuid.UUID) (bool, error) {
	n, err := r.queries(ctx).DeleteMemberType(ctx, db.DeleteMemberTypeParams{TenantID: tenantID, ID: id})
	if err != nil {
		return false, fmt.Errorf("delete member type: %w", err)
	}
	return n > 0, nil
}

func (r *Repository) GetMemberType(ctx context.Context, tenantID, id uuid.UUID) (domain.MemberType, bool, error) {
	row, err := r.queries(ctx).GetMemberType(ctx, db.GetMemberTypeParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MemberType{}, false, nil
	}
	if err != nil {
		return domain.MemberType{}, false, fmt.Errorf("get member type: %w", err)
	}
	return toMemberType(row), true, nil
}

func (r *Repository) GetMemberTypeByRole(ctx context.Context, tenantID uuid.UUID, role string) (domain.MemberType, bool, error) {
	row, err := r.queries(ctx).GetMemberTypeByRole(ctx, db.GetMemberTypeByRoleParams{TenantID: tenantID, DefaultForRole: pdatabase.Text(role)})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.MemberType{}, false, nil
	}
	if err != nil {
		return domain.MemberType{}, false, fmt.Errorf("get member type by role: %w", err)
	}
	return toMemberType(row), true, nil
}

func (r *Repository) ListMemberTypes(ctx context.Context, tenantID uuid.UUID) ([]domain.MemberType, error) {
	rows, err := r.queries(ctx).ListMemberTypes(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list member types: %w", err)
	}
	out := make([]domain.MemberType, len(rows))
	for i, row := range rows {
		out[i] = toMemberType(row)
	}
	return out, nil
}

func (r *Repository) CountMembersByType(ctx context.Context, tenantID, memberTypeID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountMembersByType(ctx, db.CountMembersByTypeParams{TenantID: tenantID, MemberTypeID: memberTypeID})
	if err != nil {
		return 0, fmt.Errorf("count members by type: %w", err)
	}
	return int(n), nil
}

// CreateMember distinguishes a member_no collision from a user already
// being a member, so the caller can retry with the next sequence number
// only on the former (old app: 5 retries on duplicate member_no,
// library_common.go:596-614).
func (r *Repository) CreateMember(ctx context.Context, m domain.Member) (domain.Member, error) {
	row, err := r.queries(ctx).CreateMember(ctx, db.CreateMemberParams{
		UserID: m.UserID, TenantID: m.TenantID, MemberNo: m.MemberNo, MemberTypeID: m.MemberTypeID,
		RegisteredOn: pdatabase.Date(m.RegisteredOn), ValidUntil: nullableDate(m.ValidUntil), Status: string(m.Status), Notes: m.Notes,
	})
	if err != nil {
		return domain.Member{}, mapMemberInsertError(err)
	}
	return toMember(row), nil
}

func mapMemberInsertError(err error) error {
	var pgErr interface {
		SQLState() string
		ConstraintName() string
	}
	if errors.As(err, &pgErr) && pgErr.SQLState() == "23505" {
		if pgErr.ConstraintName() == "library_members_pkey" {
			return domain.ErrMemberAlreadyExists
		}
		return domain.ErrMemberNoCollision
	}
	return fmt.Errorf("create member: %w", err)
}

func (r *Repository) GetMember(ctx context.Context, tenantID, userID uuid.UUID) (domain.Member, bool, error) {
	row, err := r.queries(ctx).GetMember(ctx, db.GetMemberParams{TenantID: tenantID, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Member{}, false, nil
	}
	if err != nil {
		return domain.Member{}, false, fmt.Errorf("get member: %w", err)
	}
	return toMember(row), true, nil
}

func (r *Repository) GetMemberByNo(ctx context.Context, tenantID uuid.UUID, memberNo string) (domain.Member, bool, error) {
	row, err := r.queries(ctx).GetMemberByNo(ctx, db.GetMemberByNoParams{TenantID: tenantID, MemberNo: memberNo})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Member{}, false, nil
	}
	if err != nil {
		return domain.Member{}, false, fmt.Errorf("get member by no: %w", err)
	}
	return toMember(row), true, nil
}

func (r *Repository) ListMembers(ctx context.Context, tenantID uuid.UUID, filter service.MemberListFilter, limit, offset int) ([]domain.Member, error) {
	params := db.ListMembersParams{TenantID: tenantID, Limit: int32(limit), Offset: int32(offset)} //nolint:gosec // clamped
	if filter.Status != "" {
		params.Status = pdatabase.Text(filter.Status)
	}
	if filter.MemberTypeID.Valid {
		params.MemberTypeID = pdatabase.NullUUID(filter.MemberTypeID)
	}
	if filter.Search != "" {
		params.Search = pdatabase.Text(filter.Search)
	}
	rows, err := r.queries(ctx).ListMembers(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	return toMembers(rows), nil
}

func (r *Repository) GetMembersByIDs(ctx context.Context, tenantID uuid.UUID, ids []uuid.UUID) ([]domain.Member, error) {
	rows, err := r.queries(ctx).GetMembersByIDs(ctx, db.GetMembersByIDsParams{TenantID: tenantID, Ids: ids})
	if err != nil {
		return nil, fmt.Errorf("get members by ids: %w", err)
	}
	return toMembers(rows), nil
}

func (r *Repository) ListMembersForCardPrint(ctx context.Context, tenantID uuid.UUID, filter service.MemberCardListFilter, limit int) ([]domain.Member, error) {
	params := db.ListMembersForCardPrintParams{TenantID: tenantID, Limit: int32(limit)} //nolint:gosec // clamped
	if filter.MemberTypeID.Valid {
		params.MemberTypeID = pdatabase.NullUUID(filter.MemberTypeID)
	}
	if filter.ClassID.Valid {
		params.ClassID = pdatabase.NullUUID(filter.ClassID)
	}
	rows, err := r.queries(ctx).ListMembersForCardPrint(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("list members for card print: %w", err)
	}
	return toMembers(rows), nil
}

func (r *Repository) UpdateMemberStatus(ctx context.Context, tenantID, userID uuid.UUID, status domain.MemberStatus, suspendedUntil *pgtype.Date) (domain.Member, bool, error) {
	params := db.UpdateMemberStatusParams{TenantID: tenantID, UserID: userID, Status: string(status)}
	if suspendedUntil != nil {
		params.SuspendedUntil = *suspendedUntil
	}
	row, err := r.queries(ctx).UpdateMemberStatus(ctx, params)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Member{}, false, nil
	}
	if err != nil {
		return domain.Member{}, false, fmt.Errorf("update member status: %w", err)
	}
	return toMember(row), true, nil
}

func (r *Repository) UpdateMemberProfile(ctx context.Context, tenantID, userID, memberTypeID uuid.UUID, validUntil *time.Time, notes string) (domain.Member, bool, error) {
	row, err := r.queries(ctx).UpdateMemberProfile(ctx, db.UpdateMemberProfileParams{
		TenantID: tenantID, UserID: userID, MemberTypeID: memberTypeID, ValidUntil: nullableDate(validUntil), Notes: notes,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Member{}, false, nil
	}
	if err != nil {
		return domain.Member{}, false, fmt.Errorf("update member profile: %w", err)
	}
	return toMember(row), true, nil
}

func (r *Repository) IncrementLateReturnCount(ctx context.Context, tenantID, userID uuid.UUID) (domain.Member, error) {
	row, err := r.queries(ctx).IncrementLateReturnCount(ctx, db.IncrementLateReturnCountParams{TenantID: tenantID, UserID: userID})
	if err != nil {
		return domain.Member{}, fmt.Errorf("increment late return count: %w", err)
	}
	return toMember(row), nil
}

func (r *Repository) ClearanceCounts(ctx context.Context, tenantID, userID uuid.UUID) (service.ClearanceCounts, error) {
	row, err := r.queries(ctx).CountActiveLoansAndUnpaidFinesForClearance(ctx, db.CountActiveLoansAndUnpaidFinesForClearanceParams{
		TenantID: tenantID, MemberUserID: userID,
	})
	if err != nil {
		return service.ClearanceCounts{}, fmt.Errorf("clearance counts: %w", err)
	}
	return service.ClearanceCounts{ActiveLoans: int(row.ActiveLoans), UnpaidViolations: int(row.UnpaidViolations)}, nil
}

func (r *Repository) ListMemberCandidates(ctx context.Context, tenantID uuid.UUID, role string, classID uuid.NullUUID) ([]service.MemberCandidate, error) {
	rows, err := r.queries(ctx).ListLibraryMemberCandidates(ctx, db.ListLibraryMemberCandidatesParams{
		TenantID: tenantID, Kind: role, ClassID: pdatabase.NullUUID(classID),
	})
	if err != nil {
		return nil, fmt.Errorf("list member candidates: %w", err)
	}
	out := make([]service.MemberCandidate, len(rows))
	for i, row := range rows {
		out[i] = service.MemberCandidate{UserID: row.UserID, UserName: row.UserName}
	}
	return out, nil
}
