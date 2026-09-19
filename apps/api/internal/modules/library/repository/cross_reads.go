// Cross-module reads; the queries live in queries/cross_reads.sql and read
// tables owned by academic (academic_calendar_events, enrollments, classes)
// and identity (users, user_profiles, student_profiles), the same
// convention internal/modules/attendance/repository/cross_reads.go uses.
package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func (r *Repository) GetTenantTimezone(ctx context.Context, tenantID uuid.UUID) (string, error) {
	tz, err := r.queries(ctx).GetTenantTimezoneForLibrary(ctx, tenantID)
	if err != nil {
		return "", fmt.Errorf("get tenant timezone: %w", err)
	}
	return tz, nil
}

func (r *Repository) ListActiveTenants(ctx context.Context) ([]service.TenantRef, error) {
	rows, err := r.queries(ctx).ListActiveTenantsForLibrary(ctx)
	if err != nil {
		return nil, fmt.Errorf("list active tenants: %w", err)
	}
	out := make([]service.TenantRef, len(rows))
	for i, row := range rows {
		out[i] = service.TenantRef{ID: row.ID, Timezone: row.Timezone}
	}
	return out, nil
}

// HolidayDates returns every date in [from, to] the tenant's academic
// calendar marks as a holiday, keyed "2006-01-02" for
// domain.WorkingDayRule.
func (r *Repository) HolidayDates(ctx context.Context, tenantID uuid.UUID, from, to time.Time) (map[string]bool, error) {
	rows, err := r.queries(ctx).ListLibraryHolidaysInRange(ctx, db.ListLibraryHolidaysInRangeParams{
		TenantID: tenantID, EndDate: pdatabase.Date(from), Date: pdatabase.Date(to),
	})
	if err != nil {
		return nil, fmt.Errorf("list holidays in range: %w", err)
	}
	out := make(map[string]bool)
	for _, row := range rows {
		start, end := pdatabase.DateOrZero(row.Date), pdatabase.DateOrZero(row.EndDate)
		for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
			out[d.Format("2006-01-02")] = true
		}
	}
	return out, nil
}

func (r *Repository) LookupMembers(ctx context.Context, tenantID uuid.UUID, query string, limit int) ([]service.MemberLookupResult, error) {
	rows, err := r.queries(ctx).LookupLibraryMembers(ctx, db.LookupLibraryMembersParams{TenantID: tenantID, Query: query, Limit: int32(limit)}) //nolint:gosec // clamped
	if err != nil {
		return nil, fmt.Errorf("lookup members: %w", err)
	}
	out := make([]service.MemberLookupResult, len(rows))
	for i, row := range rows {
		out[i] = service.MemberLookupResult{UserID: row.UserID, UserName: row.UserName, Username: row.Username, NIS: row.Nis, MemberNo: row.MemberNo}
	}
	return out, nil
}

func (r *Repository) LookupCopies(ctx context.Context, tenantID uuid.UUID, query string, limit int) ([]service.CopyLookupResult, error) {
	rows, err := r.queries(ctx).LookupLibraryCopies(ctx, db.LookupLibraryCopiesParams{TenantID: tenantID, Query: query, Limit: int32(limit)}) //nolint:gosec // clamped
	if err != nil {
		return nil, fmt.Errorf("lookup copies: %w", err)
	}
	out := make([]service.CopyLookupResult, len(rows))
	for i, row := range rows {
		out[i] = service.CopyLookupResult{CopyID: row.CopyID, Barcode: row.Barcode, Status: row.Status, TitleID: row.TitleID, Title: row.Title}
	}
	return out, nil
}

func (r *Repository) ListClassRoster(ctx context.Context, tenantID, classID uuid.UUID) ([]service.ClassRosterEntry, error) {
	rows, err := r.queries(ctx).ListActiveEnrollmentsForLibraryClass(ctx, db.ListActiveEnrollmentsForLibraryClassParams{TenantID: tenantID, ClassID: classID})
	if err != nil {
		return nil, fmt.Errorf("list class roster: %w", err)
	}
	out := make([]service.ClassRosterEntry, len(rows))
	for i, row := range rows {
		out[i] = service.ClassRosterEntry{UserID: row.UserID, UserName: row.UserName}
	}
	return out, nil
}

func (r *Repository) HasActiveLoanForMemberAndTitle(ctx context.Context, tenantID, titleID, memberID uuid.UUID) (bool, error) {
	ok, err := r.queries(ctx).HasActiveLoanForMemberAndTitle(ctx, db.HasActiveLoanForMemberAndTitleParams{TenantID: tenantID, TitleID: titleID, MemberUserID: memberID})
	if err != nil {
		return false, fmt.Errorf("has active loan for member and title: %w", err)
	}
	return ok, nil
}

func (r *Repository) GetActiveClassNameForStudent(ctx context.Context, tenantID, userID uuid.UUID) (string, error) {
	name, err := r.queries(ctx).GetActiveClassNameForStudent(ctx, db.GetActiveClassNameForStudentParams{TenantID: tenantID, StudentUserID: userID})
	if err != nil {
		return "", nil //nolint:nilerr // no active enrollment (or not a student) is the common case, not an error
	}
	return name, nil
}

func (r *Repository) ListOverdueLoansDetailed(ctx context.Context, tenantID uuid.UUID, asOf time.Time) ([]service.OverdueLoanDetail, error) {
	rows, err := r.queries(ctx).ListOverdueLoansDetailed(ctx, db.ListOverdueLoansDetailedParams{TenantID: tenantID, DueOn: pdatabase.Date(asOf)})
	if err != nil {
		return nil, fmt.Errorf("list overdue loans detailed: %w", err)
	}
	out := make([]service.OverdueLoanDetail, len(rows))
	for i, row := range rows {
		out[i] = service.OverdueLoanDetail{
			Loan: toLoan(db.LibraryLoan{
				ID: row.ID, TenantID: row.TenantID, CopyID: row.CopyID, TitleID: row.TitleID, MemberUserID: row.MemberUserID,
				CheckedOutBy: row.CheckedOutBy, BorrowedAt: row.BorrowedAt, DueOn: row.DueOn, ReturnedAt: row.ReturnedAt,
				CheckedInBy: row.CheckedInBy, RenewalCount: row.RenewalCount, Status: row.Status, FineAmount: row.FineAmount,
				FinePaidAt: row.FinePaidAt, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, Channel: row.Channel,
			}),
			ClassName: row.ClassName, GuardianPhone: row.GuardianPhone,
			MemberName: row.MemberName, MemberNo: row.MemberNo, Title: row.Title, Barcode: row.Barcode,
		}
	}
	return out, nil
}

func (r *Repository) ListLoansDueForReminder(ctx context.Context, tenantID uuid.UUID, from, to time.Time) ([]domain.Loan, error) {
	rows, err := r.queries(ctx).ListLoansDueForReminder(ctx, db.ListLoansDueForReminderParams{TenantID: tenantID, DueOn: pdatabase.Date(from), DueOn_2: pdatabase.Date(to)})
	if err != nil {
		return nil, fmt.Errorf("list loans due for reminder: %w", err)
	}
	return toLoans(rows), nil
}
