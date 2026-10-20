package wiring

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	analyticsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/service"
	attendancedomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/domain"
	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	gradingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	permitsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/realtime"
)

// AnalyticsPermits adapts permits' PendingCount (which takes its own
// domain.Kind) to analytics' PermitsReader (which takes a plain string,
// so analytics never imports permits/domain).
type AnalyticsPermits struct{ Svc *permitsservice.Service }

func (p AnalyticsPermits) PendingCount(ctx context.Context, tenantID uuid.UUID, kind string) (int, error) {
	return p.Svc.PendingCount(ctx, tenantID, permitsdomain.Kind(kind))
}

// Analytics readers compose the early-warning signals from each owning
// module's own service, following the same pattern as the family readers
// below: analytics never imports attendance/discipline/grading's
// repository or tables directly.

type AnalyticsAttendance struct{ Svc *attendanceservice.Service }

func (a AnalyticsAttendance) DayStatuses(ctx context.Context, tenantID uuid.UUID, studentIDs []uuid.UUID, dates []time.Time) ([]analyticsservice.StudentDayStatus, error) {
	rows, err := a.Svc.DayStatusesForStudents(ctx, tenantID, studentIDs, dates)
	if err != nil {
		return nil, err
	}
	out := make([]analyticsservice.StudentDayStatus, len(rows))
	for i, r := range rows {
		out[i] = analyticsservice.StudentDayStatus{StudentUserID: r.StudentUserID, Date: r.Date, Outcome: analyticsDayOutcome(r.StatusCode)}
	}
	return out, nil
}

// analyticsDayOutcome reduces attendance's daily status code to what the
// early-warning attendance signal needs. Only alfa (unexcused absence) is an
// absence; present, sick, permission and dispensation days are recorded days
// that are not absences. The pseudo-codes that describe missing data are
// not outcomes at all: no scheduled session means no school day, and an
// unsubmitted, empty or unknown day has no outcome yet.
func analyticsDayOutcome(statusCode string) analyticsservice.DayOutcome {
	switch statusCode {
	case attendancedomain.StatusNone:
		return analyticsservice.DayNoSchool
	case "", attendancedomain.StatusIncomplete, attendancedomain.StatusMixed:
		return analyticsservice.DayUnrecorded
	case attendancedomain.StatusCodeAlpha:
		return analyticsservice.DayAbsent
	default:
		return analyticsservice.DayNotAbsent
	}
}

func (a AnalyticsAttendance) TodaySubmittedCount(ctx context.Context, tenantID uuid.UUID) (submitted, total int, err error) {
	return a.Svc.TodaySubmittedCount(ctx, tenantID)
}

type AnalyticsDiscipline struct{ Svc *disciplineservice.Service }

func (d AnalyticsDiscipline) StudentSummaries(ctx context.Context, tenantID uuid.UUID, studentIDs []uuid.UUID) (map[uuid.UUID]analyticsservice.DisciplineSummary, error) {
	rows, err := d.Svc.RiskTotalsForStudents(ctx, tenantID, studentIDs)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]analyticsservice.DisciplineSummary, len(rows))
	for _, r := range rows {
		out[r.StudentUserID] = analyticsservice.DisciplineSummary{
			ActiveViolationCount: r.ActiveViolations, TotalPoints: r.Points, WarningLetterCount: r.WarningLetters,
		}
	}
	return out, nil
}

type AnalyticsGrading struct{ Svc *gradingservice.Service }

// ReportTrends compares each student's current-term published report-score
// average against the term immediately before it. Available is false when
// either term has no published report score to average (e.g. the student's
// first term, or a term whose grades are not yet published): analytics must
// not invent a trend when the data does not support one.
func (g AnalyticsGrading) ReportTrends(ctx context.Context, tenantID uuid.UUID, studentIDs []uuid.UUID) (map[uuid.UUID]analyticsservice.GradeTrend, error) {
	trends, err := g.Svc.ReportTrendsForStudents(ctx, tenantID, studentIDs)
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]analyticsservice.GradeTrend, len(trends))
	for id, t := range trends {
		out[id] = analyticsservice.GradeTrend{Available: t.Available, PreviousAverage: t.PreviousAverage, CurrentAverage: t.CurrentAverage}
	}
	return out, nil
}

// AnalyticsPresence adapts platform/realtime's Presence tracker to
// analytics' PresenceReader for the admin dashboard's online-per-role
// panel. Every GET /ws/me connection heartbeats a key shaped
// "<tenantID>:<role>:<userID>" (see cmd/api/ws.go's wsMeHandler), which is
// the same convention attendance's monitor presence parses.
type AnalyticsPresence struct {
	Presence *realtime.Presence
	Clock    clock.Clock
}

func (p AnalyticsPresence) OnlineByRole(ctx context.Context, tenantID uuid.UUID) (map[string]int, error) {
	prefix := tenantID.String() + ":"
	counts := map[string]int{}
	for _, key := range p.Presence.Snapshot(ctx, p.Clock.Now()) {
		rest, ok := strings.CutPrefix(key, prefix)
		if !ok {
			continue
		}
		role, _, ok := strings.Cut(rest, ":")
		if !ok || role == "" {
			continue
		}
		counts[role]++
	}
	return counts, nil
}
