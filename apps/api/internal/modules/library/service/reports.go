package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// reportDefaultDays is the old app's default report window when from/to
// are left off: the last 30 days, inclusive of "to" (library_reports.go).
const reportDefaultDays = 30

// resolveReportPeriod fills in a missing from/to the way the old app did:
// "to" defaults to today, "from" to 30 days before "to", and the range
// returned is a half-open [from, toExclusive) where toExclusive is the
// day after "to" -- so a caller filtering with >= from and < toExclusive
// still includes everything that happened on "to" itself.
func (s *Service) resolveReportPeriod(from, to *time.Time) (time.Time, time.Time) {
	now := s.clock.Now()
	var toDay time.Time
	if to != nil {
		toDay = *to
	} else {
		toDay = now
	}
	toDay = time.Date(toDay.Year(), toDay.Month(), toDay.Day(), 0, 0, 0, 0, toDay.Location())
	var fromDay time.Time
	if from != nil {
		fromDay = *from
	} else {
		fromDay = toDay.AddDate(0, 0, -reportDefaultDays)
	}
	fromDay = time.Date(fromDay.Year(), fromDay.Month(), fromDay.Day(), 0, 0, 0, 0, fromDay.Location())
	return fromDay, toDay.AddDate(0, 0, 1)
}

// LoanReportRow is one loans-in-period report row with the member's
// display name and the title already resolved, so the printed/exported
// report never shows a bare UUID.
type LoanReportRow struct {
	Loan       domain.Loan
	Title      string
	MemberName string
}

// LoansInPeriod is the loans-per-period report: every loan that started
// in [from, to], with from/to defaulting to the last 30 days (inclusive
// of "to") when left off.
func (s *Service) LoansInPeriod(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) ([]LoanReportRow, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	fromDay, toExclusive := s.resolveReportPeriod(from, to)
	var out []LoanReportRow
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		rows, err := s.repo.ListLoansInPeriodWithTitle(ctx, tenantID, fromDay, toExclusive)
		if err != nil {
			return err
		}
		out = make([]LoanReportRow, len(rows))
		for i, r := range rows {
			name := r.Loan.MemberUserID.String()
			if s.members != nil {
				if resolved, err := s.members.UserDisplayName(ctx, tenantID, r.Loan.MemberUserID); err == nil && resolved != "" {
					name = resolved
				}
			}
			out[i] = LoanReportRow{Loan: r.Loan, Title: r.Title, MemberName: name}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// OverdueMemberSummary groups a tenant's overdue loans by member.
type OverdueMemberSummary struct {
	MemberUserID uuid.UUID
	LoanCount    int
	TotalFine    int
}

// OverdueMembers is the overdue-members report: every member with at least
// one active loan past its due date, with the fine each loan would carry
// if returned today.
func (s *Service) OverdueMembers(ctx context.Context, tenantID uuid.UUID) ([]OverdueMemberSummary, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	now := s.clock.Now()
	var out []OverdueMemberSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		overdue, err := s.repo.ListOverdueLoans(ctx, tenantID, now)
		if err != nil {
			return err
		}
		byMember := make(map[uuid.UUID]*OverdueMemberSummary)
		order := make([]uuid.UUID, 0)
		for _, loan := range overdue {
			summary, ok := byMember[loan.MemberUserID]
			if !ok {
				summary = &OverdueMemberSummary{MemberUserID: loan.MemberUserID}
				byMember[loan.MemberUserID] = summary
				order = append(order, loan.MemberUserID)
			}
			summary.LoanCount++
			summary.TotalFine += domain.CalculateFine(policy, loan.DueOn, now)
		}
		out = make([]OverdueMemberSummary, len(order))
		for i, id := range order {
			out[i] = *byMember[id]
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// MostBorrowedTitle is one row of the most-borrowed-titles report.
type MostBorrowedTitle struct {
	Title     TitleWithAvailability
	LoanCount int
}

func (s *Service) MostBorrowedTitles(ctx context.Context, tenantID uuid.UUID, from, to *time.Time, limit int) ([]MostBorrowedTitle, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	fromDay, toExclusive := s.resolveReportPeriod(from, to)
	var out []MostBorrowedTitle
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		counts, err := s.repo.MostBorrowedTitles(ctx, tenantID, fromDay, toExclusive, clampLimit(limit))
		if err != nil {
			return err
		}
		out = make([]MostBorrowedTitle, 0, len(counts))
		for _, c := range counts {
			title, found, err := s.repo.GetTitle(ctx, tenantID, c.TitleID)
			if err != nil {
				return err
			}
			if !found {
				continue
			}
			withAvailability, err := s.withAvailability(ctx, tenantID, title)
			if err != nil {
				return err
			}
			out = append(out, MostBorrowedTitle{Title: withAvailability, LoanCount: c.LoanCount})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// TopBorrower is one row of the popular report's top-borrowers side: a
// member's loan count in the period, with their display name and current
// class resolved so the report never shows a bare UUID (old app:
// library_reports.go's top peminjam, dropped from the rebuild's first
// popular-titles-only report).
type TopBorrower struct {
	MemberUserID uuid.UUID
	MemberName   string
	ClassName    string
	LoanCount    int
}

// PopularReport is the "paling populer" report: the period's most
// borrowed titles alongside its most active borrowers.
type PopularReport struct {
	Titles    []MostBorrowedTitle
	Borrowers []TopBorrower
}

func (s *Service) PopularReport(ctx context.Context, tenantID uuid.UUID, from, to *time.Time, limit int) (PopularReport, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return PopularReport{}, err
	}
	var report PopularReport
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		titles, err := s.MostBorrowedTitles(ctx, tenantID, from, to, limit)
		if err != nil {
			return err
		}
		fromDay, toExclusive := s.resolveReportPeriod(from, to)
		rows, err := s.repo.TopBorrowersInPeriod(ctx, tenantID, fromDay, toExclusive, clampLimit(limit))
		if err != nil {
			return err
		}
		borrowers := make([]TopBorrower, len(rows))
		for i, r := range rows {
			name := r.MemberUserID.String()
			if s.members != nil {
				if resolved, err := s.members.UserDisplayName(ctx, tenantID, r.MemberUserID); err == nil && resolved != "" {
					name = resolved
				}
			}
			borrowers[i] = TopBorrower{MemberUserID: r.MemberUserID, MemberName: name, ClassName: r.ClassName, LoanCount: r.LoanCount}
		}
		report = PopularReport{Titles: titles, Borrowers: borrowers}
		return nil
	})
	if err != nil {
		return PopularReport{}, err
	}
	return report, nil
}

// noClassLabel is the display label for a visit or member with no active
// class enrollment (a teacher, staff, or a walk-in guest), matching the
// old app's monthly report (library_monthly_report.go).
const noClassLabel = "Lainnya"

func labelClass(name string) string {
	if name == "" {
		return noClassLabel
	}
	return name
}

// VisitsReport is the visits-in-period report: the raw total plus a
// per-day and per-class breakdown.
type VisitsReport struct {
	Total    int
	PerDay   []DaySeriesPoint
	PerClass []ClassCount
}

func (s *Service) VisitsReport(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) (VisitsReport, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return VisitsReport{}, err
	}
	fromDay, toExclusive := s.resolveReportPeriod(from, to)
	var report VisitsReport
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		total, err := s.repo.CountVisitsBetween(ctx, tenantID, fromDay, toExclusive)
		if err != nil {
			return err
		}
		perDay, err := s.repo.VisitsPerDay(ctx, tenantID, fromDay, toExclusive)
		if err != nil {
			return err
		}
		perClass, err := s.repo.VisitsPerClass(ctx, tenantID, fromDay, toExclusive)
		if err != nil {
			return err
		}
		for i := range perClass {
			perClass[i].ClassName = labelClass(perClass[i].ClassName)
		}
		report = VisitsReport{Total: total, PerDay: perDay, PerClass: perClass}
		return nil
	})
	if err != nil {
		return VisitsReport{}, err
	}
	return report, nil
}

// MembersReport is the members report: totals plus a per-type and
// per-class breakdown.
type MembersReport struct {
	Total    int
	Active   int
	PerType  []MemberTypeCount
	PerClass []ClassCount
}

func (s *Service) MembersReport(ctx context.Context, tenantID uuid.UUID) (MembersReport, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return MembersReport{}, err
	}
	var report MembersReport
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		total, err := s.repo.CountMembersTotal(ctx, tenantID)
		if err != nil {
			return err
		}
		active, err := s.repo.CountActiveMembersTotal(ctx, tenantID)
		if err != nil {
			return err
		}
		perType, err := s.repo.MembersByType(ctx, tenantID)
		if err != nil {
			return err
		}
		perClass, err := s.repo.MembersByClass(ctx, tenantID)
		if err != nil {
			return err
		}
		for i := range perClass {
			perClass[i].ClassName = labelClass(perClass[i].ClassName)
		}
		report = MembersReport{Total: total, Active: active, PerType: perType, PerClass: perClass}
		return nil
	})
	if err != nil {
		return MembersReport{}, err
	}
	return report, nil
}

// safeDiv is the old app's libReportsSafeDiv: a per-student ratio is 0
// rather than +Inf/NaN when there are no students yet to divide by.
func safeDiv(a, b int) float64 {
	if b == 0 {
		return 0
	}
	return float64(a) / float64(b)
}

// CatalogueSummary is the accreditation-style summary report: catalogue
// composition plus this period's circulation, membership, and visit
// activity (old app: library_reports.go's summary, section "SNP").
type CatalogueSummary struct {
	TitlesByDDC         []DDCClassCount
	ItemsByCategory     []MasterEntryCount
	ItemsByMaterialType []MasterEntryCount
	FictionCount        int
	FictionTotal        int
	AdditionsInPeriod   int
	LoansInPeriod       int
	ActiveBorrowers     int
	OverdueNow          int
	LastStocktake       *domain.Stocktake
	StudentsTotal       int
	MembersTotal        int
	ItemsPerStudent     float64
	LoansPerStudent     float64
	VisitsInPeriod      int
	VisitsPerStudent    float64
}

func (s *Service) CatalogueSummary(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) (CatalogueSummary, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return CatalogueSummary{}, err
	}
	fromDay, toExclusive := s.resolveReportPeriod(from, to)
	var summary CatalogueSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		byDDC, err := s.repo.TitlesByDDCClass(ctx, tenantID)
		if err != nil {
			return err
		}
		byCategory, err := s.repo.ItemsByCategory(ctx, tenantID)
		if err != nil {
			return err
		}
		byMaterialType, err := s.repo.ItemsByMaterialType(ctx, tenantID)
		if err != nil {
			return err
		}
		fiction, total, err := s.repo.FictionRatioCounts(ctx, tenantID)
		if err != nil {
			return err
		}
		additions, err := s.repo.CountTitlesAddedInPeriod(ctx, tenantID, fromDay, toExclusive)
		if err != nil {
			return err
		}
		loans, err := s.repo.ListLoansInPeriod(ctx, tenantID, fromDay, toExclusive)
		if err != nil {
			return err
		}
		activeBorrowers, err := s.repo.CountActiveBorrowers(ctx, tenantID)
		if err != nil {
			return err
		}
		overdue, err := s.repo.CountOverdueNow(ctx, tenantID, s.clock.Now())
		if err != nil {
			return err
		}
		lastStocktake, found, err := s.repo.GetLastClosedStocktake(ctx, tenantID)
		if err != nil {
			return err
		}
		studentsTotal, err := s.repo.CountActiveStudentsTotal(ctx, tenantID)
		if err != nil {
			return err
		}
		membersTotal, err := s.repo.CountMembersTotal(ctx, tenantID)
		if err != nil {
			return err
		}
		copiesTotal, err := s.repo.CountCopiesTotal(ctx, tenantID)
		if err != nil {
			return err
		}
		visitsInPeriod, err := s.repo.CountVisitsBetween(ctx, tenantID, fromDay, toExclusive)
		if err != nil {
			return err
		}
		summary = CatalogueSummary{
			TitlesByDDC: byDDC, ItemsByCategory: byCategory, ItemsByMaterialType: byMaterialType,
			FictionCount: fiction, FictionTotal: total, AdditionsInPeriod: additions, LoansInPeriod: len(loans),
			ActiveBorrowers: activeBorrowers, OverdueNow: overdue,
			StudentsTotal: studentsTotal, MembersTotal: membersTotal, VisitsInPeriod: visitsInPeriod,
			ItemsPerStudent:  safeDiv(copiesTotal, studentsTotal),
			LoansPerStudent:  safeDiv(len(loans), studentsTotal),
			VisitsPerStudent: safeDiv(visitsInPeriod, studentsTotal),
		}
		if found {
			summary.LastStocktake = &lastStocktake
		}
		return nil
	})
	if err != nil {
		return CatalogueSummary{}, err
	}
	return summary, nil
}

// AccessionRegister is the accession register (Buku Induk): every copy
// acquired in the period, in acquisition order. acquired_on is a date
// column, so unlike the timestamp-based reports this compares with an
// inclusive upper bound rather than the day-after used for [from, to).
func (s *Service) AccessionRegister(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) ([]domain.Copy, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	fromDay, toExclusive := s.resolveReportPeriod(from, to)
	toInclusive := toExclusive.AddDate(0, 0, -1)
	var copies []domain.Copy
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		copies, err = s.repo.ListCopiesAcquiredInPeriod(ctx, tenantID, fromDay, toInclusive)
		return err
	})
	return copies, err
}
