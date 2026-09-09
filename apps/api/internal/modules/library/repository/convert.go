package repository

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func datePtr(d pgtype.Date) *time.Time {
	if !d.Valid {
		return nil
	}
	t := pdatabase.DateOrZero(d)
	return &t
}

func nullableDate(t *time.Time) pgtype.Date {
	if t == nil {
		return pgtype.Date{}
	}
	return pdatabase.Date(*t)
}

func timePtr(t pgtype.Timestamptz) *time.Time { return pdatabase.TimePtr(t) }

func toTitle(row db.LibraryTitle) domain.Title {
	return domain.Title{
		ID: row.ID, TenantID: row.TenantID, Title: row.Title, Subtitle: row.Subtitle, Author: row.Author,
		Publisher: row.Publisher, PublishYear: int(row.PublishYear.Int32), ISBN: row.Isbn,
		Classification: row.Classification, Language: row.Language, CoverAssetID: pdatabase.UUIDOrNil(row.CoverAssetID),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toCopy(row db.LibraryCopy) domain.Copy {
	return domain.Copy{
		ID: row.ID, TenantID: row.TenantID, TitleID: row.TitleID, Barcode: row.Barcode,
		Condition: domain.CopyCondition(row.Condition), Status: domain.CopyStatus(row.Status),
		AcquiredOn: datePtr(row.AcquiredOn), Notes: row.Notes,
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toLoan(row db.LibraryLoan) domain.Loan {
	status := domain.LoanStatus(row.Status)
	var fp *time.Time
	if row.FinePaidAt.Valid {
		fp = timePtr(row.FinePaidAt)
	}
	return domain.Loan{
		ID: row.ID, TenantID: row.TenantID, CopyID: row.CopyID, TitleID: row.TitleID, MemberUserID: row.MemberUserID,
		CheckedOutBy: row.CheckedOutBy, BorrowedAt: pdatabase.TimeOrZero(row.BorrowedAt), DueOn: pdatabase.DateOrZero(row.DueOn),
		ReturnedAt: timePtr(row.ReturnedAt), CheckedInBy: pdatabase.UUIDOrNil(row.CheckedInBy), RenewalCount: int(row.RenewalCount),
		Status: status, FineAmount: int(row.FineAmount), FinePaidAt: fp,
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toReservation(row db.LibraryReservation) domain.Reservation {
	return domain.Reservation{
		ID: row.ID, TenantID: row.TenantID, TitleID: row.TitleID, MemberUserID: row.MemberUserID,
		Status: domain.ReservationStatus(row.Status), RequestedAt: pdatabase.TimeOrZero(row.RequestedAt),
		ReadyAt: timePtr(row.ReadyAt), ExpiresAt: timePtr(row.ExpiresAt), FulfilledLoanID: pdatabase.UUIDOrNil(row.FulfilledLoanID),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toStocktake(row db.LibraryStocktake) domain.Stocktake {
	return domain.Stocktake{
		ID: row.ID, TenantID: row.TenantID, Name: row.Name, StartedOn: pdatabase.DateOrZero(row.StartedOn),
		EndedOn: datePtr(row.EndedOn), CoordinatorUserID: row.CoordinatorUserID, Status: domain.StocktakeStatus(row.Status),
		Notes: row.Notes, CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toScan(row db.LibraryStocktakeScan) domain.StocktakeScan {
	return domain.StocktakeScan{
		ID: row.ID, TenantID: row.TenantID, StocktakeID: row.StocktakeID, CopyID: row.CopyID, Barcode: row.Barcode,
		ScannedAt: pdatabase.TimeOrZero(row.ScannedAt), ScannedByUser: row.ScannedByUserID,
	}
}
