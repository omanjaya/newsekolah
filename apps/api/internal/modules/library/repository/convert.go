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
		Status: status, Channel: domain.Channel(row.Channel), FineAmount: int(row.FineAmount), FinePaidAt: fp,
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toReservation(row db.LibraryReservation) domain.Reservation {
	return domain.Reservation{
		ID: row.ID, TenantID: row.TenantID, TitleID: row.TitleID, MemberUserID: row.MemberUserID,
		Status: domain.ReservationStatus(row.Status), RequestedAt: pdatabase.TimeOrZero(row.RequestedAt),
		ReadyAt: timePtr(row.ReadyAt), ExpiresAt: timePtr(row.ExpiresAt), HeldCopyID: pdatabase.UUIDOrNil(row.HeldCopyID),
		FulfilledLoanID: pdatabase.UUIDOrNil(row.FulfilledLoanID),
		CreatedAt:       pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
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

func toMemberType(row db.LibraryMemberType) domain.MemberType {
	return domain.MemberType{
		ID: row.ID, TenantID: row.TenantID, Name: row.Name, MaxLoanItems: int(row.MaxLoanItems), MaxLoanDays: int(row.MaxLoanDays),
		RenewalDays: int(row.RenewalDays), MaxRenewals: int(row.MaxRenewals), FineType: domain.FineType(row.FineType),
		FinePerTenor: int(row.FinePerTenor), TenorDays: int(row.TenorDays), SuspendDays: int(row.SuspendDays),
		ValidityMonths: int(row.ValidityMonths), DefaultForRole: pdatabase.TextOrEmpty(row.DefaultForRole),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toMember(row db.LibraryMember) domain.Member {
	return domain.Member{
		UserID: row.UserID, TenantID: row.TenantID, MemberNo: row.MemberNo, MemberTypeID: row.MemberTypeID,
		RegisteredOn: pdatabase.DateOrZero(row.RegisteredOn), ValidUntil: datePtr(row.ValidUntil),
		Status: domain.MemberStatus(row.Status), SuspendedUntil: datePtr(row.SuspendedUntil),
		LateReturnCount: int(row.LateReturnCount), Notes: row.Notes,
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toMembers(rows []db.LibraryMember) []domain.Member {
	out := make([]domain.Member, len(rows))
	for i, row := range rows {
		out[i] = toMember(row)
	}
	return out
}

func toLoanRule(row db.LibraryLoanRule) domain.LoanRule {
	out := domain.LoanRule{
		ID: row.ID, TenantID: row.TenantID, MemberTypeID: pdatabase.UUIDOrNil(row.MemberTypeID),
		StartsOn: pdatabase.DateOrZero(row.StartsOn), EndsOn: pdatabase.DateOrZero(row.EndsOn), AllowLoans: row.AllowLoans,
		Notes: row.Notes, CreatedBy: pdatabase.UUIDOrNil(row.CreatedBy), CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
	}
	if row.MaxLoanItems.Valid {
		v := int(row.MaxLoanItems.Int32)
		out.MaxLoanItems = &v
	}
	if row.MaxLoanDays.Valid {
		v := int(row.MaxLoanDays.Int32)
		out.MaxLoanDays = &v
	}
	return out
}

func toViolation(row db.LibraryViolation) domain.Violation {
	return domain.Violation{
		ID: row.ID, TenantID: row.TenantID, LoanID: pdatabase.UUIDOrNil(row.LoanID), MemberUserID: row.MemberUserID,
		Kind: domain.ViolationKind(row.Kind), Penalty: domain.Penalty(row.Penalty), Amount: int(row.Amount),
		SuspendDays: int(row.SuspendDays), Status: domain.ViolationStatus(row.Status), Notes: row.Notes,
		CreatedBy: row.CreatedBy, CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
		SettledAt: timePtr(row.SettledAt), SettledBy: pdatabase.UUIDOrNil(row.SettledBy),
	}
}

func toViolations(rows []db.LibraryViolation) []domain.Violation {
	out := make([]domain.Violation, len(rows))
	for i, row := range rows {
		out[i] = toViolation(row)
	}
	return out
}

func toVisit(row db.LibraryVisit) domain.Visit {
	return domain.Visit{
		ID: row.ID, TenantID: row.TenantID, MemberUserID: pdatabase.UUIDOrNil(row.MemberUserID), VisitorName: row.VisitorName,
		Kind: domain.VisitKind(row.Kind), Purpose: row.Purpose, GroupSize: int(row.GroupSize), Source: domain.VisitSource(row.Source),
		VisitedAt: pdatabase.TimeOrZero(row.VisitedAt), CreatedBy: pdatabase.UUIDOrNil(row.CreatedBy),
	}
}

func toVisits(rows []db.LibraryVisit) []domain.Visit {
	out := make([]domain.Visit, len(rows))
	for i, row := range rows {
		out[i] = toVisit(row)
	}
	return out
}

func toReadInPlace(row db.LibraryReadInPlace) domain.ReadInPlace {
	return domain.ReadInPlace{
		ID: row.ID, TenantID: row.TenantID, CopyID: row.CopyID, MemberUserID: pdatabase.UUIDOrNil(row.MemberUserID),
		VisitorName: row.VisitorName, StartedAt: pdatabase.TimeOrZero(row.StartedAt), EndedAt: timePtr(row.EndedAt),
		CreatedBy: pdatabase.UUIDOrNil(row.CreatedBy),
	}
}

func toItemEvent(row db.LibraryItemEvent) domain.ItemEventRecord {
	return domain.ItemEventRecord{
		ID: row.ID, TenantID: row.TenantID, CopyID: row.CopyID, LoanID: pdatabase.UUIDOrNil(row.LoanID),
		MemberUserID: pdatabase.UUIDOrNil(row.MemberUserID), EventType: domain.CirculationEventType(row.EventType), Notes: row.Note,
		CreatedBy: pdatabase.UUIDOrNil(row.ActorUserID), CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
	}
}

func toLoanRenewal(row db.LibraryLoanRenewal) domain.LoanRenewal {
	return domain.LoanRenewal{
		ID: row.ID, TenantID: row.TenantID, LoanID: row.LoanID, RenewedAt: pdatabase.TimeOrZero(row.RenewedAt),
		PreviousDueOn: pdatabase.DateOrZero(row.PreviousDueOn), NewDueOn: pdatabase.DateOrZero(row.NewDueOn), RenewedBy: row.RenewedBy,
	}
}
