package repository

import (
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

// pgUUID is for filter arguments that are always present (never NULL),
// unlike pdatabase.NullUUID which round-trips a uuid.NullUUID.
func pgUUID(id uuid.UUID) pgtype.UUID { return pgtype.UUID{Bytes: id, Valid: true} }

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
		ID: row.ID, TenantID: row.TenantID, ControlNumber: row.ControlNumber, Title: row.Title, Subtitle: row.Subtitle,
		Author: row.Author, Responsibility: row.Responsibility, AdditionalAuthors: row.AdditionalAuthors,
		Publisher: row.Publisher, PublishPlace: row.PublishPlace, PublishYear: int(row.PublishYear.Int32),
		Edition: row.Edition, Pages: row.Pages, Illustration: row.Illustration, Dimensions: row.Dimensions,
		ISBN: row.Isbn, ISSN: row.Issn, DDCNumber: row.DdcNumber, CallNumber: row.CallNumber,
		Classification: row.Classification, Subjects: row.Subjects, Language: row.Language, LiteraryForm: row.LiteraryForm,
		TargetAudience: row.TargetAudience, Notes: row.Notes, Abstract: row.Abstract,
		MaterialTypeID: pdatabase.UUIDOrNil(row.MaterialTypeID), IsOPAC: row.IsOpac,
		CoverAssetID: pdatabase.UUIDOrNil(row.CoverAssetID),
		CreatedAt:    pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toCopy(row db.LibraryCopy) domain.Copy {
	return domain.Copy{
		ID: row.ID, TenantID: row.TenantID, TitleID: row.TitleID, AccessionNumber: row.AccessionNumber,
		Barcode: row.Barcode, CopyNumber: int(row.CopyNumber), CallNumber: row.CallNumber,
		CategoryID: pdatabase.UUIDOrNil(row.CategoryID), LocationID: pdatabase.UUIDOrNil(row.LocationID),
		SourceID: pdatabase.UUIDOrNil(row.SourceID), PartnerID: pdatabase.UUIDOrNil(row.PartnerID),
		Price: int(row.Price), IsOPAC: row.IsOpac, RFID: row.Rfid, Access: domain.CopyAccess(row.Access),
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
		Notes: row.Notes, MissingCount: int(row.MissingCount), UnexpectedCount: int(row.UnexpectedCount),
		MisplacedCount: int(row.MisplacedCount), MarkMissingAs: domain.MarkMissingAs(row.MarkMissingAs),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toScan(row db.LibraryStocktakeScan) domain.StocktakeScan {
	return domain.StocktakeScan{
		ID: row.ID, TenantID: row.TenantID, StocktakeID: row.StocktakeID, CopyID: pdatabase.UUIDOrNil(row.CopyID),
		RawCode: row.RawCode, Outcome: domain.StocktakeScanOutcome(row.Outcome), LocationID: pdatabase.UUIDOrNil(row.LocationID),
		ScannedAt: pdatabase.TimeOrZero(row.ScannedAt), ScannedByUser: row.ScannedByUserID,
	}
}

func toMaterialType(row db.LibraryMaterialType) domain.MasterEntry {
	return domain.MasterEntry{
		ID: row.ID, TenantID: row.TenantID, Code: row.Code, Name: row.Name, IsActive: row.IsActive, SortOrder: int(row.SortOrder),
		MaxLoanItems: int(row.MaxLoanItems), MaxLoanDays: int(row.MaxLoanDays), MaxRenewals: int(row.MaxRenewals),
	}
}

func toCollectionCategory(row db.LibraryCollectionCategory) domain.MasterEntry {
	return domain.MasterEntry{ID: row.ID, TenantID: row.TenantID, Code: row.Code, Name: row.Name, IsActive: row.IsActive, SortOrder: int(row.SortOrder)}
}

func toAcquisitionSource(row db.LibraryAcquisitionSource) domain.MasterEntry {
	return domain.MasterEntry{ID: row.ID, TenantID: row.TenantID, Code: row.Code, Name: row.Name, IsActive: row.IsActive, SortOrder: int(row.SortOrder)}
}

func toPartner(row db.LibraryPartner) domain.MasterEntry {
	return domain.MasterEntry{
		ID: row.ID, TenantID: row.TenantID, Code: row.Code, Name: row.Name, IsActive: row.IsActive, SortOrder: int(row.SortOrder),
		ContactName: row.ContactName, Phone: row.Phone, Address: row.Address,
	}
}

func toLocation(row db.LibraryLocation) domain.MasterEntry {
	return domain.MasterEntry{ID: row.ID, TenantID: row.TenantID, Code: row.Code, Name: row.Name, IsActive: row.IsActive, SortOrder: int(row.SortOrder)}
}

func toDDCClass(row db.LibraryDdcClass) domain.DDCClass {
	return domain.DDCClass{Code: row.Code, Name: row.Name}
}
