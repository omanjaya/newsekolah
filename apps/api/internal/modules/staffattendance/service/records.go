package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
)

// Scan is the QR self-service check-in/check-out: the first scan of the
// day records arrival, the second records departure, a third is refused
// rather than silently overwriting either timestamp. It reads the instant
// from s.clock rather than a caller-supplied time.Time, since
// forbidigo/docs/04-clean-code.md ban time.Now() outside platform/clock.
func (s *Service) Scan(ctx context.Context, tenantID, employeeUserID uuid.UUID) (RecordView, error) {
	at := s.clock.Now()
	date := time.Date(at.Year(), at.Month(), at.Day(), 0, 0, 0, 0, at.Location())
	var out RecordView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		existing, found, err := s.repo.GetRecordByEmployeeDate(ctx, tenantID, employeeUserID, date)
		if err != nil {
			return err
		}
		var arrival, departure *time.Time
		if found {
			arrival, departure = existing.ArrivalAt, existing.DepartureAt
		}
		switch {
		case arrival == nil:
			arrival = &at
		case departure == nil:
			departure = &at
		default:
			return domain.ErrAlreadyScannedBothWays
		}
		saved, err := s.upsertFromSource(ctx, tenantID, employeeUserID, employeeUserID, date, arrival, departure, domain.SourceQR, "")
		if err != nil {
			return err
		}
		out = saved
		return nil
	})
	if err != nil {
		return RecordView{}, err
	}
	if s.realtime != nil {
		// Roster board (docs/analysis/realtime-plan-2026-09-25.md section 2,
		// opportunity #8): there is no "hr" role (authz.RoleDefaults has
		// admin, teacher, staff, student, librarian, principal, super_admin)
		// and no duty type holds view_staff_attendance/manage_staff_
		// attendance (authz.DutyTypeDefaults), so a duty push would never
		// reach anyone -- push only to the two roles that default-hold a
		// staff-attendance permission: admin (manage, implicit "all minus
		// two") and principal (view, "HR/piket operations" per its own
		// PermViewStaffAttendance comment).
		payload := staffAttendanceScannedPayload{EmployeeID: employeeUserID}
		for _, role := range []string{"admin", "principal"} {
			_ = s.realtime.PublishRole(tenantID, role, "staff_attendance.scanned", payload)
		}
	}
	return out, nil
}

// staffAttendanceScannedPayload is the minimal payload pushed after a
// self-service QR scan -- ids only; the board re-fetches the roster
// through its already-authorized REST endpoint.
type staffAttendanceScannedPayload struct {
	EmployeeID uuid.UUID `json:"employee_id"`
}

// RecordManual is an administrator entering or updating one employee's day
// directly (the workflow for someone who forgot to scan, or has no QR
// device at all).
func (s *Service) RecordManual(ctx context.Context, tenantID, actorID uuid.UUID, in EntryInput) (RecordView, error) {
	var out RecordView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		saved, err := s.upsertFromSource(ctx, tenantID, in.EmployeeUserID, actorID, in.Date, in.ArrivalAt, in.DepartureAt, domain.SourceManual, in.Notes)
		if err != nil {
			return err
		}
		out = saved
		return nil
	})
	return out, err
}

// ImportRecords is a device import batch: the same shape as a manual
// entry, saved with Source=import so the board and history can tell the
// two apart.
func (s *Service) ImportRecords(ctx context.Context, tenantID, actorID uuid.UUID, entries []EntryInput) ([]RecordView, error) {
	out := make([]RecordView, 0, len(entries))
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		for _, in := range entries {
			saved, err := s.upsertFromSource(ctx, tenantID, in.EmployeeUserID, actorID, in.Date, in.ArrivalAt, in.DepartureAt, domain.SourceImport, in.Notes)
			if err != nil {
				return err
			}
			out = append(out, saved)
		}
		return nil
	})
	return out, err
}

// upsertFromSource merges the incoming arrival/departure with whatever is
// already stored (so a lone departure scan still sees this morning's
// arrival when computing status), derives the status, saves, and resolves
// the employee's display name for the view the caller renders. The caller
// runs inside an already-open transaction.
func (s *Service) upsertFromSource(
	ctx context.Context, tenantID, employeeUserID, actorID uuid.UUID, date time.Time,
	arrival, departure *time.Time, source domain.Source, notes string,
) (RecordView, error) {
	existing, found, err := s.repo.GetRecordByEmployeeDate(ctx, tenantID, employeeUserID, date)
	if err != nil {
		return RecordView{}, err
	}
	mergedArrival, mergedDeparture := arrival, departure
	if found {
		if mergedArrival == nil {
			mergedArrival = existing.ArrivalAt
		}
		if mergedDeparture == nil {
			mergedDeparture = existing.DepartureAt
		}
	}

	result, _, err := s.computeStatus(ctx, tenantID, employeeUserID, date, mergedArrival, mergedDeparture)
	if err != nil {
		return RecordView{}, err
	}

	actor := uuid.NullUUID{UUID: actorID, Valid: actorID != uuid.Nil}
	rec := domain.Record{
		TenantID: tenantID, EmployeeUserID: employeeUserID, Date: date,
		ArrivalAt: arrival, DepartureAt: departure,
		StatusCode: result.StatusCode, LateMinutes: result.LateMinutes, EarlyLeaveMinutes: result.EarlyLeaveMinutes,
		Source: source, Notes: notes, CreatedBy: actor, UpdatedBy: actor,
	}
	saved, err := s.repo.UpsertRecord(ctx, rec)
	if err != nil {
		return RecordView{}, err
	}
	name, err := s.repo.GetEmployeeName(ctx, tenantID, employeeUserID)
	if err != nil {
		return RecordView{}, err
	}
	return toRecordView(saved, name), nil
}

// GetTodayBoard is every tracked employee's status for date: a stored
// record where one exists, or a live-computed one otherwise (mirrors
// attendance/service's buildRoster/buildCalendarDays pattern of never
// letting "no row yet" look different from "computed now"). date nil
// means "today" in UTC -- this module does not yet resolve the tenant's
// own timezone, unlike student-facing attendance.
func (s *Service) GetTodayBoard(ctx context.Context, tenantID uuid.UUID, date *time.Time) ([]RecordView, error) {
	resolved := s.today(time.UTC)
	if date != nil {
		resolved = *date
	}
	var out []RecordView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		roster, err := s.repo.ListRosterEmployees(ctx, tenantID)
		if err != nil {
			return err
		}
		records, err := s.repo.ListRecordsByDate(ctx, tenantID, resolved)
		if err != nil {
			return err
		}
		byEmployee := make(map[uuid.UUID]domain.Record, len(records))
		for _, r := range records {
			byEmployee[r.EmployeeUserID] = r
		}

		out = make([]RecordView, 0, len(roster))
		for _, emp := range roster {
			if rec, ok := byEmployee[emp.ID]; ok {
				out = append(out, toRecordView(rec, emp.Name))
				continue
			}
			result, holidayName, err := s.computeStatus(ctx, tenantID, emp.ID, resolved, nil, nil)
			if err != nil {
				return err
			}
			out = append(out, RecordView{
				EmployeeUserID: emp.ID, EmployeeName: emp.Name, Date: resolved,
				StatusCode: result.StatusCode, Source: domain.SourceManual, HolidayName: holidayName,
			})
		}
		return nil
	})
	return out, err
}

// GetEmployeeHistory is one employee's day-by-day status across [from, to),
// the source for both the per-employee history screen and the monthly
// recap below.
func (s *Service) GetEmployeeHistory(ctx context.Context, tenantID, employeeUserID uuid.UUID, from, to time.Time) ([]RecordView, error) {
	var out []RecordView
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		if err := s.assertEnabled(ctx, tenantID); err != nil {
			return err
		}
		name, err := s.repo.GetEmployeeName(ctx, tenantID, employeeUserID)
		if err != nil {
			return err
		}
		out, err = s.employeeHistory(ctx, tenantID, employeeUserID, name, from, to)
		return err
	})
	return out, err
}

// employeeHistory is GetEmployeeHistory's day-by-day computation without
// opening its own transaction, so a caller that already holds one --
// GetAllEmployeesMonthlyRecap, which would otherwise pay for one
// transaction per roster row -- can reuse it.
func (s *Service) employeeHistory(ctx context.Context, tenantID, employeeUserID uuid.UUID, name string, from, to time.Time) ([]RecordView, error) {
	records, err := s.repo.ListRecordsByEmployeeRange(ctx, tenantID, employeeUserID, from, to)
	if err != nil {
		return nil, err
	}
	byDate := make(map[string]domain.Record, len(records))
	for _, r := range records {
		byDate[r.Date.Format("2006-01-02")] = r
	}

	out := make([]RecordView, 0, 31)
	for d := from; d.Before(to); d = d.AddDate(0, 0, 1) {
		if rec, ok := byDate[d.Format("2006-01-02")]; ok {
			out = append(out, toRecordView(rec, name))
			continue
		}
		result, holidayName, err := s.computeStatus(ctx, tenantID, employeeUserID, d, nil, nil)
		if err != nil {
			return nil, err
		}
		out = append(out, RecordView{
			EmployeeUserID: employeeUserID, EmployeeName: name, Date: d,
			StatusCode: result.StatusCode, HolidayName: holidayName,
		})
	}
	return out, nil
}
