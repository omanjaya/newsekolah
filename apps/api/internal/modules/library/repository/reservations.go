package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) CreateReservation(ctx context.Context, res domain.Reservation) (domain.Reservation, error) {
	row, err := r.queries(ctx).CreateReservation(ctx, db.CreateReservationParams{
		TenantID: res.TenantID, TitleID: res.TitleID, MemberUserID: res.MemberUserID, RequestedAt: pdatabase.Timestamptz(res.RequestedAt),
	})
	if err != nil {
		return domain.Reservation{}, fmt.Errorf("create reservation: %w", err)
	}
	return toReservation(row), nil
}

func (r *Repository) GetReservation(ctx context.Context, tenantID, id uuid.UUID) (domain.Reservation, bool, error) {
	row, err := r.queries(ctx).GetReservation(ctx, db.GetReservationParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Reservation{}, false, nil
	}
	if err != nil {
		return domain.Reservation{}, false, fmt.Errorf("get reservation: %w", err)
	}
	return toReservation(row), true, nil
}

func (r *Repository) ListReservationsForTitle(ctx context.Context, tenantID, titleID uuid.UUID) ([]domain.Reservation, error) {
	rows, err := r.queries(ctx).ListReservationsForTitle(ctx, db.ListReservationsForTitleParams{TenantID: tenantID, TitleID: titleID})
	if err != nil {
		return nil, fmt.Errorf("list reservations for title: %w", err)
	}
	return toReservations(rows), nil
}

func (r *Repository) ListReservationsForMember(ctx context.Context, tenantID, memberID uuid.UUID) ([]domain.Reservation, error) {
	rows, err := r.queries(ctx).ListReservationsForMember(ctx, db.ListReservationsForMemberParams{TenantID: tenantID, MemberUserID: memberID})
	if err != nil {
		return nil, fmt.Errorf("list reservations for member: %w", err)
	}
	return toReservations(rows), nil
}

func (r *Repository) MarkReservationReady(ctx context.Context, tenantID, id, copyID uuid.UUID, readyAt, expiresAt time.Time) (domain.Reservation, bool, error) {
	row, err := r.queries(ctx).MarkReservationReady(ctx, db.MarkReservationReadyParams{
		TenantID: tenantID, ID: id, ReadyAt: pdatabase.Timestamptz(readyAt), ExpiresAt: pdatabase.Timestamptz(expiresAt),
		HeldCopyID: pdatabase.NullUUID(uuid.NullUUID{UUID: copyID, Valid: true}),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Reservation{}, false, nil
	}
	if err != nil {
		return domain.Reservation{}, false, fmt.Errorf("mark reservation ready: %w", err)
	}
	return toReservation(row), true, nil
}

func (r *Repository) FulfillReservation(ctx context.Context, tenantID, id, loanID uuid.UUID) (domain.Reservation, bool, error) {
	row, err := r.queries(ctx).FulfillReservation(ctx, db.FulfillReservationParams{
		TenantID: tenantID, ID: id, FulfilledLoanID: pdatabase.NullUUID(uuid.NullUUID{UUID: loanID, Valid: true}),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Reservation{}, false, nil
	}
	if err != nil {
		return domain.Reservation{}, false, fmt.Errorf("fulfill reservation: %w", err)
	}
	return toReservation(row), true, nil
}

func (r *Repository) CancelReservation(ctx context.Context, tenantID, id uuid.UUID) (domain.Reservation, bool, error) {
	row, err := r.queries(ctx).CancelReservation(ctx, db.CancelReservationParams{TenantID: tenantID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Reservation{}, false, nil
	}
	if err != nil {
		return domain.Reservation{}, false, fmt.Errorf("cancel reservation: %w", err)
	}
	return toReservation(row), true, nil
}

func (r *Repository) GetReservationForHeldCopy(ctx context.Context, tenantID, copyID uuid.UUID) (domain.Reservation, bool, error) {
	row, err := r.queries(ctx).GetReservationForHeldCopy(ctx, db.GetReservationForHeldCopyParams{TenantID: tenantID, HeldCopyID: pdatabase.NullUUID(uuid.NullUUID{UUID: copyID, Valid: true})})
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Reservation{}, false, nil
	}
	if err != nil {
		return domain.Reservation{}, false, fmt.Errorf("get reservation for held copy: %w", err)
	}
	return toReservation(row), true, nil
}

// ExpireReadyReservations flips every ready hold past expiresAt to
// expired, returning them so the caller can release each held copy.
func (r *Repository) ExpireReadyReservations(ctx context.Context, tenantID uuid.UUID, asOf time.Time) ([]domain.Reservation, error) {
	rows, err := r.queries(ctx).ExpireReadyReservations(ctx, db.ExpireReadyReservationsParams{TenantID: tenantID, ExpiresAt: pdatabase.Timestamptz(asOf)})
	if err != nil {
		return nil, fmt.Errorf("expire ready reservations: %w", err)
	}
	return toReservations(rows), nil
}

func toReservations(rows []db.LibraryReservation) []domain.Reservation {
	out := make([]domain.Reservation, len(rows))
	for i, row := range rows {
		out[i] = toReservation(row)
	}
	return out
}
