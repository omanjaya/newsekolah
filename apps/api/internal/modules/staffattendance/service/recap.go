package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
)

// parseMonthRange turns a "YYYY-MM" string into the half-open [from, to)
// date range that month covers, mirroring
// attendance/service.parseMonthRange.
func parseMonthRange(month string) (time.Time, time.Time, error) {
	from, err := time.Parse("2006-01", month)
	if err != nil {
		return time.Time{}, time.Time{}, domain.ErrInvalidMonth
	}
	return from, from.AddDate(0, 1, 0), nil
}

// GetMonthlyRecap is one employee's derived days for month plus totals per
// status and minutes, the report every "manage_staff_attendance" or
// "view_staff_attendance" holder can pull for payroll or review.
func (s *Service) GetMonthlyRecap(ctx context.Context, tenantID, employeeUserID uuid.UUID, month string) (MonthlyRecap, error) {
	from, to, err := parseMonthRange(month)
	if err != nil {
		return MonthlyRecap{}, err
	}

	days, err := s.GetEmployeeHistory(ctx, tenantID, employeeUserID, from, to)
	if err != nil {
		return MonthlyRecap{}, err
	}

	recap := MonthlyRecap{
		EmployeeUserID: employeeUserID, Month: month, Days: days,
		StatusTotals: make(map[domain.StatusCode]int, len(days)),
	}
	if len(days) > 0 {
		recap.EmployeeName = days[0].EmployeeName
	}
	for _, d := range days {
		recap.StatusTotals[d.StatusCode]++
		recap.TotalLateMinutes += d.LateMinutes
		recap.TotalEarlyLeaveMinutes += d.EarlyLeaveMinutes
	}
	return recap, nil
}

// GetAllEmployeesMonthlyRecap is every tracked employee's monthly recap for
// month, in roster order -- the tenant-wide counterpart to GetMonthlyRecap,
// used by the administrative export that covers the whole staff at once
// rather than one employee at a time.
func (s *Service) GetAllEmployeesMonthlyRecap(ctx context.Context, tenantID uuid.UUID, month string) ([]MonthlyRecap, error) {
	from, to, err := parseMonthRange(month)
	if err != nil {
		return nil, err
	}

	var out []MonthlyRecap
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		roster, err := s.repo.ListRosterEmployees(ctx, tenantID)
		if err != nil {
			return err
		}
		out = make([]MonthlyRecap, 0, len(roster))
		for _, emp := range roster {
			days, err := s.employeeHistory(ctx, tenantID, emp.ID, emp.Name, from, to)
			if err != nil {
				return err
			}
			recap := MonthlyRecap{
				EmployeeUserID: emp.ID, EmployeeName: emp.Name, Month: month, Days: days,
				StatusTotals: make(map[domain.StatusCode]int, len(days)),
			}
			for _, d := range days {
				recap.StatusTotals[d.StatusCode]++
				recap.TotalLateMinutes += d.LateMinutes
				recap.TotalEarlyLeaveMinutes += d.EarlyLeaveMinutes
			}
			out = append(out, recap)
		}
		return nil
	})
	return out, err
}
