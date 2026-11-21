package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// reportDefaultDays is the old app's default report window when from/to
// are left off: the last 30 days, inclusive of "to" (library_reports.go).
const reportDefaultDays = 30

// resolveReportPeriod fills in a missing from/to the way the old app did:
// "to" defaults to today, "from" to 30 days before "to", and the range
// returned is a half-open [from, toExclusive) where toExclusive is the
// day after "to" -- so a caller filtering with >= from and < toExclusive
// still includes everything that happened on "to" itself.
//
// The days are the tenant's calendar days: from and to arrive as bare
// dates (midnight UTC), so their year, month and day are read and midnight
// is placed in the tenant's zone. Using the dates' own UTC midnight cut a
// UTC+8 school's report at 08:00, dropping the first morning's activity
// and counting the morning after the period.
func (s *Service) resolveReportPeriod(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) (time.Time, time.Time) {
	loc := s.tenantLocation(ctx, tenantID)
	var toDay time.Time
	if to != nil {
		toDay = *to
	} else {
		toDay = clock.Now(ctx, s.clock).In(loc)
	}
	toDay = time.Date(toDay.Year(), toDay.Month(), toDay.Day(), 0, 0, 0, 0, loc)
	var fromDay time.Time
	if from != nil {
		fromDay = time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, loc)
	} else {
		fromDay = toDay.AddDate(0, 0, -reportDefaultDays)
	}
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
	fromDay, toExclusive := s.resolveReportPeriod(ctx, tenantID, from, to)
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
// one active loan past its due date, with the fine those loans would be
// charged if returned today. The fine is projected with the very rule a
// return applies (lateOutcomeWith, as Service.lateOutcome): working days late, priced by the
// member's type, and zero while the policy keeps currency fines off (a
// late return then suspends or warns instead).
func (s *Service) OverdueMembers(ctx context.Context, tenantID uuid.UUID) ([]OverdueMemberSummary, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return nil, err
	}
	var out []OverdueMemberSummary
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		today := s.schoolToday(ctx, tenantID, clock.Now(ctx, s.clock))
		policy, err := s.loadPolicy(ctx, tenantID)
		if err != nil {
			return err
		}
		overdue, err := s.repo.ListOverdueLoans(ctx, tenantID, today)
		if err != nil {
			return err
		}
		if len(overdue) == 0 {
			out = []OverdueMemberSummary{}
			return nil
		}
		// One holiday calendar spans every overdue loan (earliest due date
		// through today), the members are loaded in one batch and each
		// member type is looked up once, so the report costs a fixed
		// handful of queries plus one per member type rather than several
		// per loan or member.
		earliestDue := overdue[0].DueOn
		for _, loan := range overdue[1:] {
			if loan.DueOn.Before(earliestDue) {
				earliestDue = loan.DueOn
			}
		}
		wdr, err := s.workingDayRule(ctx, tenantID, policy, earliestDue, daysUntil(earliestDue, today)+1)
		if err != nil {
			return err
		}
		byMember := make(map[uuid.UUID]*OverdueMemberSummary)
		order := make([]uuid.UUID, 0)
		for _, loan := range overdue {
			if _, ok := byMember[loan.MemberUserID]; !ok {
				byMember[loan.MemberUserID] = &OverdueMemberSummary{MemberUserID: loan.MemberUserID}
				order = append(order, loan.MemberUserID)
			}
		}
		rules, err := s.membersLateRules(ctx, tenantID, order, policy)
		if err != nil {
			return err
		}
		for _, loan := range overdue {
			summary := byMember[loan.MemberUserID]
			summary.LoanCount++
			if _, outcome := lateOutcomeWith(wdr, loan, policy, today, rules[loan.MemberUserID]); outcome.Penalty == domain.PenaltyFine {
				summary.TotalFine += outcome.FineAmount
			}
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

// membersLateRules is memberLateRule for many members at once: one batch
// query for the members and one lookup per distinct member type. A member
// that no longer exists gets the policy's per-day fine, as memberLateRule
// gives it.
func (s *Service) membersLateRules(ctx context.Context, tenantID uuid.UUID, memberUserIDs []uuid.UUID, policy domain.Policy) (map[uuid.UUID]domain.MemberType, error) {
	members, err := s.repo.GetMembersByIDs(ctx, tenantID, memberUserIDs)
	if err != nil {
		return nil, err
	}
	types := make(map[uuid.UUID]domain.MemberType)
	rules := make(map[uuid.UUID]domain.MemberType, len(memberUserIDs))
	for _, member := range members {
		rules[member.UserID] = s.memberTypeLateRule(ctx, tenantID, member, policy, types)
	}
	for _, id := range memberUserIDs {
		if _, ok := rules[id]; !ok {
			rules[id] = domain.PolicyLateRule(policy)
		}
	}
	return rules, nil
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
	fromDay, toExclusive := s.resolveReportPeriod(ctx, tenantID, from, to)
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
		fromDay, toExclusive := s.resolveReportPeriod(ctx, tenantID, from, to)
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
	fromDay, toExclusive := s.resolveReportPeriod(ctx, tenantID, from, to)
	var report VisitsReport
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		total, err := s.repo.CountVisitsBetween(ctx, tenantID, fromDay, toExclusive)
		if err != nil {
			return err
		}
		perDay, err := s.repo.VisitsPerDay(ctx, tenantID, fromDay, toExclusive, fromDay.Location().String())
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
		if err := s.endLapsedSuspensions(ctx, tenantID, uuid.NullUUID{}); err != nil {
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

// business-rule guard clauses gate one write or one aggregated read;
// the branches are sequential guards, not nested decision logic, and
// the module's existing test suite already covers them. Left as-is
// here to avoid behaviour risk in a lint-only change.
//
//nolint:gocyclo // service method: several independent precondition/authorization/
func (s *Service) CatalogueSummary(ctx context.Context, tenantID uuid.UUID, from, to *time.Time) (CatalogueSummary, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return CatalogueSummary{}, err
	}
	fromDay, toExclusive := s.resolveReportPeriod(ctx, tenantID, from, to)
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
		overdue, err := s.repo.CountOverdueNow(ctx, tenantID, s.schoolToday(ctx, tenantID, clock.Now(ctx, s.clock)))
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
	fromDay, toExclusive := s.resolveReportPeriod(ctx, tenantID, from, to)
	toInclusive := toExclusive.AddDate(0, 0, -1)
	var copies []domain.Copy
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		copies, err = s.repo.ListCopiesAcquiredInPeriod(ctx, tenantID, fromDay, toInclusive)
		return err
	})
	return copies, err
}
