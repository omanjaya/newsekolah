// Package repository is the sqlc-backed implementation of the activities
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
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/activities/service"
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

// -- time-of-day helpers (no shared pgtype.Time converter exists in
// platform/database, only Date/Timestamptz) --

func toPGTime(s *string) pgtype.Time {
	if s == nil || *s == "" {
		return pgtype.Time{}
	}
	t, err := time.Parse("15:04", *s)
	if err != nil {
		return pgtype.Time{}
	}
	micros := (t.Hour()*3600 + t.Minute()*60) * 1_000_000
	return pgtype.Time{Microseconds: int64(micros), Valid: true}
}

func fromPGTime(t pgtype.Time) *string {
	if !t.Valid {
		return nil
	}
	total := t.Microseconds / 1_000_000
	hh, mm := total/3600, (total/60)%60
	s := fmt.Sprintf("%02d:%02d", hh, mm)
	return &s
}

func toPGInt2(n *int16) pgtype.Int2 {
	if n == nil {
		return pgtype.Int2{}
	}
	return pgtype.Int2{Int16: *n, Valid: true}
}

func fromPGInt2(n pgtype.Int2) *int16 {
	if !n.Valid {
		return nil
	}
	v := n.Int16
	return &v
}

func toPGInt4(n *int) pgtype.Int4 {
	if n == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(*n), Valid: true} //nolint:gosec // capacities are small positive numbers
}

func fromPGInt4(n pgtype.Int4) *int {
	if !n.Valid {
		return nil
	}
	v := int(n.Int32)
	return &v
}

// -- extracurriculars --

func toClub(row db.Extracurricular) domain.Extracurricular {
	return domain.Extracurricular{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, Name: row.Name, Description: row.Description,
		CoachUserID: pdatabase.UUIDOrNil(row.CoachUserID), Capacity: fromPGInt4(row.Capacity), MeetingDay: fromPGInt2(row.MeetingDay),
		MeetingStart: fromPGTime(row.MeetingStart), MeetingEnd: fromPGTime(row.MeetingEnd), Location: row.Location, IsActive: row.IsActive,
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func (r *Repository) ListExtracurriculars(ctx context.Context, tenantID, yearID uuid.UUID, includeInactive bool) ([]domain.Extracurricular, error) {
	rows, err := r.queries(ctx).ListExtracurriculars(ctx, db.ListExtracurricularsParams{TenantID: tenantID, AcademicYearID: yearID, IncludeInactive: includeInactive})
	if err != nil {
		return nil, fmt.Errorf("list extracurriculars: %w", err)
	}
	out := make([]domain.Extracurricular, len(rows))
	for i, row := range rows {
		out[i] = toClub(row)
	}
	return out, nil
}

func (r *Repository) GetExtracurricular(ctx context.Context, tenantID, id uuid.UUID) (domain.Extracurricular, bool, error) {
	row, err := r.queries(ctx).GetExtracurricular(ctx, db.GetExtracurricularParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Extracurricular{}, false, nil
	}
	if err != nil {
		return domain.Extracurricular{}, false, fmt.Errorf("get extracurricular: %w", err)
	}
	return toClub(row), true, nil
}

func (r *Repository) CreateExtracurricular(ctx context.Context, e domain.Extracurricular) (domain.Extracurricular, error) {
	row, err := r.queries(ctx).CreateExtracurricular(ctx, db.CreateExtracurricularParams{
		TenantID: e.TenantID, AcademicYearID: e.AcademicYearID, Name: e.Name, Description: e.Description,
		CoachUserID: pdatabase.NullUUID(e.CoachUserID), Capacity: toPGInt4(e.Capacity), MeetingDay: toPGInt2(e.MeetingDay),
		MeetingStart: toPGTime(e.MeetingStart), MeetingEnd: toPGTime(e.MeetingEnd), Location: e.Location,
	})
	if isUnique(err) {
		return domain.Extracurricular{}, domain.ErrClubNameExists
	}
	if err != nil {
		return domain.Extracurricular{}, fmt.Errorf("create extracurricular: %w", err)
	}
	return toClub(row), nil
}

func (r *Repository) UpdateExtracurricular(ctx context.Context, e domain.Extracurricular) (domain.Extracurricular, error) {
	row, err := r.queries(ctx).UpdateExtracurricular(ctx, db.UpdateExtracurricularParams{
		TenantID: e.TenantID, ID: e.ID, Name: e.Name, Description: e.Description, CoachUserID: pdatabase.NullUUID(e.CoachUserID),
		Capacity: toPGInt4(e.Capacity), MeetingDay: toPGInt2(e.MeetingDay), MeetingStart: toPGTime(e.MeetingStart),
		MeetingEnd: toPGTime(e.MeetingEnd), Location: e.Location, IsActive: e.IsActive,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Extracurricular{}, domain.ErrClubNotFound
	}
	if isUnique(err) {
		return domain.Extracurricular{}, domain.ErrClubNameExists
	}
	if err != nil {
		return domain.Extracurricular{}, fmt.Errorf("update extracurricular: %w", err)
	}
	return toClub(row), nil
}

func (r *Repository) DeleteExtracurricular(ctx context.Context, tenantID, id uuid.UUID) error {
	if err := r.queries(ctx).DeleteExtracurricular(ctx, db.DeleteExtracurricularParams{TenantID: tenantID, ID: id}); err != nil {
		return fmt.Errorf("delete extracurricular: %w", err)
	}
	return nil
}

// -- membership --

func toMembership(row db.ExtracurricularMembership) domain.Membership {
	var leftOn *time.Time
	if row.LeftOn.Valid {
		t := row.LeftOn.Time
		leftOn = &t
	}
	return domain.Membership{
		ID: row.ID, TenantID: row.TenantID, ExtracurricularID: row.ExtracurricularID, StudentUserID: row.StudentUserID,
		JoinedOn: pdatabase.DateOrZero(row.JoinedOn), LeftOn: leftOn, Status: domain.MembershipStatus(row.Status),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func (r *Repository) CountActiveMembers(ctx context.Context, tenantID, clubID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountActiveMembers(ctx, db.CountActiveMembersParams{TenantID: tenantID, ExtracurricularID: clubID})
	if err != nil {
		return 0, fmt.Errorf("count active members: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CountActiveClubsForStudent(ctx context.Context, tenantID, yearID, studentID uuid.UUID) (int, error) {
	n, err := r.queries(ctx).CountActiveClubsForStudent(ctx, db.CountActiveClubsForStudentParams{TenantID: tenantID, AcademicYearID: yearID, StudentUserID: studentID})
	if err != nil {
		return 0, fmt.Errorf("count active clubs for student: %w", err)
	}
	return int(n), nil
}

func (r *Repository) CreateMembership(ctx context.Context, m domain.Membership) (domain.Membership, error) {
	row, err := r.queries(ctx).CreateMembership(ctx, db.CreateMembershipParams{
		TenantID: m.TenantID, ExtracurricularID: m.ExtracurricularID, StudentUserID: m.StudentUserID, JoinedOn: pdatabase.Date(m.JoinedOn),
	})
	if isUnique(err) {
		return domain.Membership{}, domain.ErrAlreadyMember
	}
	if err != nil {
		return domain.Membership{}, fmt.Errorf("create membership: %w", err)
	}
	return toMembership(row), nil
}

func (r *Repository) GetActiveMembership(ctx context.Context, tenantID, clubID, studentID uuid.UUID) (domain.Membership, bool, error) {
	row, err := r.queries(ctx).GetActiveMembership(ctx, db.GetActiveMembershipParams{TenantID: tenantID, ExtracurricularID: clubID, StudentUserID: studentID})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Membership{}, false, nil
	}
	if err != nil {
		return domain.Membership{}, false, fmt.Errorf("get active membership: %w", err)
	}
	return toMembership(row), true, nil
}

func (r *Repository) GetMembership(ctx context.Context, tenantID, id uuid.UUID) (domain.Membership, bool, error) {
	row, err := r.queries(ctx).GetMembership(ctx, db.GetMembershipParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Membership{}, false, nil
	}
	if err != nil {
		return domain.Membership{}, false, fmt.Errorf("get membership: %w", err)
	}
	return toMembership(row), true, nil
}

func (r *Repository) EndMembership(ctx context.Context, tenantID, id uuid.UUID, leftOn time.Time) (domain.Membership, bool, error) {
	row, err := r.queries(ctx).EndMembership(ctx, db.EndMembershipParams{TenantID: tenantID, ID: id, LeftOn: pdatabase.Date(leftOn)})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Membership{}, false, nil
	}
	if err != nil {
		return domain.Membership{}, false, fmt.Errorf("end membership: %w", err)
	}
	return toMembership(row), true, nil
}

func (r *Repository) ListMembershipsForClub(ctx context.Context, tenantID, clubID uuid.UUID, includeLeft bool) ([]domain.Membership, error) {
	rows, err := r.queries(ctx).ListMembershipsForClub(ctx, db.ListMembershipsForClubParams{TenantID: tenantID, ExtracurricularID: clubID, IncludeLeft: includeLeft})
	if err != nil {
		return nil, fmt.Errorf("list memberships for club: %w", err)
	}
	out := make([]domain.Membership, len(rows))
	for i, row := range rows {
		out[i] = toMembership(row)
	}
	return out, nil
}

func (r *Repository) ListMembershipsForStudent(ctx context.Context, tenantID, studentID uuid.UUID) ([]service.StudentMembership, error) {
	rows, err := r.queries(ctx).ListMembershipsForStudent(ctx, db.ListMembershipsForStudentParams{TenantID: tenantID, StudentUserID: studentID})
	if err != nil {
		return nil, fmt.Errorf("list memberships for student: %w", err)
	}
	out := make([]service.StudentMembership, len(rows))
	for i, row := range rows {
		out[i] = service.StudentMembership{
			Membership: toMembership(db.ExtracurricularMembership{
				ID: row.ID, TenantID: row.TenantID, ExtracurricularID: row.ExtracurricularID, StudentUserID: row.StudentUserID,
				JoinedOn: row.JoinedOn, LeftOn: row.LeftOn, Status: row.Status, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
			}),
			ClubName: row.ClubName,
		}
	}
	return out, nil
}

// -- policy --

func (r *Repository) GetLatestPolicy(ctx context.Context, tenantID uuid.UUID) ([]byte, int, bool, error) {
	row, err := r.queries(ctx).GetLatestActivitiesPolicy(ctx, tenantID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, false, nil
	}
	if err != nil {
		return nil, 0, false, fmt.Errorf("get latest activities policy: %w", err)
	}
	return row.Config, int(row.Version), true, nil
}

func (r *Repository) CreatePolicy(ctx context.Context, tenantID uuid.UUID, version int, config []byte, effectiveFrom time.Time, createdBy uuid.NullUUID) error {
	err := r.queries(ctx).CreateActivitiesPolicy(ctx, db.CreateActivitiesPolicyParams{
		TenantID: tenantID, Version: int32(version), Config: config, //nolint:gosec // small monotonic counter
		EffectiveFrom: pdatabase.Date(effectiveFrom), CreatedBy: pdatabase.NullUUID(createdBy),
	})
	if err != nil {
		return fmt.Errorf("create activities policy: %w", err)
	}
	return nil
}
