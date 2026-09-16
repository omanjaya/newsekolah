package wiring

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	analyticsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/service"
	attendanceservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/attendance/service"
	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	gradingservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/grading/service"
	permitsdomain "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	permitsservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
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

func (a AnalyticsAttendance) MonthlySummary(ctx context.Context, tenantID, studentID uuid.UUID, month string) ([]analyticsservice.DayStatus, error) {
	days, _, err := a.Svc.GetMonthlySummary(ctx, tenantID, studentID, month)
	if err != nil {
		return nil, err
	}
	out := make([]analyticsservice.DayStatus, len(days))
	for i, d := range days {
		out[i] = analyticsservice.DayStatus{Date: d.Date, StatusCode: d.StatusCode}
	}
	return out, nil
}

type AnalyticsDiscipline struct{ Svc *disciplineservice.Service }

func (d AnalyticsDiscipline) StudentSummary(ctx context.Context, tenantID, studentID uuid.UUID) (analyticsservice.DisciplineSummary, error) {
	summary, err := d.Svc.StudentSummary(ctx, tenantID, studentID)
	if err != nil {
		return analyticsservice.DisciplineSummary{}, err
	}
	active := 0
	for _, r := range summary.Records {
		if !r.IsVoided() {
			active++
		}
	}
	return analyticsservice.DisciplineSummary{
		ActiveViolationCount: active, TotalPoints: summary.TotalPoints, WarningLetterCount: len(summary.Letters),
	}, nil
}

type AnalyticsGrading struct{ Svc *gradingservice.Service }

// ReportTrend compares the student's current-term published report-score
// average against the term immediately before it. Available is false
// when either term has no published report score to average (e.g. the
// student's first term, or a term whose grades are not yet published):
// analytics must not invent a trend when the data does not support one.
func (g AnalyticsGrading) ReportTrend(ctx context.Context, tenantID, studentID uuid.UUID) (analyticsservice.GradeTrend, error) {
	current, err := g.Svc.MyGrades(ctx, tenantID, studentID, uuid.NullUUID{})
	if err != nil {
		return analyticsservice.GradeTrend{}, err
	}
	currentAvg, ok := averageReportScore(current.Subjects)
	if !ok {
		return analyticsservice.GradeTrend{}, nil
	}

	previousTerm, found, err := g.Svc.PreviousTerm(ctx, tenantID, current.Term.ID)
	if err != nil || !found {
		return analyticsservice.GradeTrend{}, err
	}
	previous, err := g.Svc.MyGrades(ctx, tenantID, studentID, uuid.NullUUID{UUID: previousTerm.ID, Valid: true})
	if err != nil {
		return analyticsservice.GradeTrend{}, err
	}
	previousAvg, ok := averageReportScore(previous.Subjects)
	if !ok {
		return analyticsservice.GradeTrend{}, nil
	}

	return analyticsservice.GradeTrend{Available: true, PreviousAverage: previousAvg, CurrentAverage: currentAvg}, nil
}

func averageReportScore(subjects []gradingservice.MySubjectGrade) (float64, bool) {
	sum, count := 0.0, 0
	for _, s := range subjects {
		if s.ReportScore == nil {
			continue
		}
		sum += *s.ReportScore
		count++
	}
	if count == 0 {
		return 0, false
	}
	return sum / float64(count), true
}

// AnalyticsPresence adapts platform/realtime's Presence tracker to
// analytics' PresenceReader for the admin dashboard's online-per-role
// panel. Every GET /ws/me connection heartbeats a key shaped
// "<tenantID>:<role>:<userID>" (see cmd/api/ws.go's wsMeHandler), which is
// the same convention attendance's monitor presence parses.
type AnalyticsPresence struct{ Presence *realtime.Presence }

func (p AnalyticsPresence) OnlineByRole(ctx context.Context, tenantID uuid.UUID) (map[string]int, error) {
	prefix := tenantID.String() + ":"
	counts := map[string]int{}
	for _, key := range p.Presence.Snapshot(ctx, time.Now()) {
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
