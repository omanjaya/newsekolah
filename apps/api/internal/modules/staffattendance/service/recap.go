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
// "view_staff_attendance" holder can pull for payroll or review. The
// employee's name is read on its own rather than from the first day, since
// a month that has not started yet has no days to carry it.
func (s *Service) GetMonthlyRecap(ctx context.Context, tenantID, employeeUserID uuid.UUID, month string) (MonthlyRecap, error) {
	from, to, err := parseMonthRange(month)
	if err != nil {
		return MonthlyRecap{}, err
	}

	var recap MonthlyRecap
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		name, err := s.repo.GetEmployeeName(ctx, tenantID, employeeUserID)
		if err != nil {
			return err
		}
		days, err := s.employeeHistory(ctx, tenantID, employeeUserID, name, from, to)
		if err != nil {
			return err
		}
		recap = newMonthlyRecap(employeeUserID, name, month, days)
		return nil
	})
	return recap, err
}

// newMonthlyRecap totals days per status and minutes.
func newMonthlyRecap(employeeUserID uuid.UUID, name, month string, days []RecordView) MonthlyRecap {
	recap := MonthlyRecap{
		EmployeeUserID: employeeUserID, EmployeeName: name, Month: month, Days: days,
		StatusTotals: make(map[domain.StatusCode]int, len(days)),
	}
	for _, d := range days {
		recap.StatusTotals[d.StatusCode]++
		recap.TotalLateMinutes += d.LateMinutes
		recap.TotalEarlyLeaveMinutes += d.EarlyLeaveMinutes
	}
	return recap
}

// GetAllEmployeesMonthlyRecap is every tracked employee's monthly recap for
// month, ordered by name -- the roster plus anyone with a record that month
// who has no work schedule yet (a check-in, manual entry or import made
// before the first schedule), the same people the day board shows. It is
// the tenant-wide counterpart to GetMonthlyRecap,
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
		roster, err := s.repo.ListRecapEmployees(ctx, tenantID, from, to)
		if err != nil {
			return err
		}
		out = make([]MonthlyRecap, 0, len(roster))
		for _, emp := range roster {
			days, err := s.employeeHistory(ctx, tenantID, emp.ID, emp.Name, from, to)
			if err != nil {
				return err
			}
			out = append(out, newMonthlyRecap(emp.ID, emp.Name, month, days))
		}
		return nil
	})
	return out, err
}
