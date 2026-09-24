package http

import (
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/service"
)

func toAPIRecord(rec service.RecordView) api.StaffAttendanceRecord {
	out := api.StaffAttendanceRecord{
		EmployeeUserId: rec.EmployeeUserID, EmployeeName: rec.EmployeeName, Date: openapi_types.Date{Time: rec.Date},
		ArrivalAt: rec.ArrivalAt, DepartureAt: rec.DepartureAt,
		StatusCode: api.StaffAttendanceStatusCode(rec.StatusCode), LateMinutes: rec.LateMinutes, EarlyLeaveMinutes: rec.EarlyLeaveMinutes,
		Source: api.StaffAttendanceSource(rec.Source),
	}
	if rec.RecordID.Valid {
		id := rec.RecordID.UUID
		out.RecordId = &id
	}
	if rec.Notes != "" {
		notes := rec.Notes
		out.Notes = &notes
	}
	if rec.HolidayName != "" {
		name := rec.HolidayName
		out.HolidayName = &name
	}
	return out
}

func toAPIRecords(views []service.RecordView) []api.StaffAttendanceRecord {
	out := make([]api.StaffAttendanceRecord, len(views))
	for i, v := range views {
		out[i] = toAPIRecord(v)
	}
	return out
}

func toAPIScheduleDay(d domain.ScheduleDay) api.StaffAttendanceScheduleDay {
	return api.StaffAttendanceScheduleDay{
		Weekday: int(d.Weekday), IsWorkingDay: d.IsWorkingDay,
		StartMinute: d.StartMinute, EndMinute: d.EndMinute, GraceMinutes: d.GraceMinutes,
	}
}

func toAPIScheduleDays(days []domain.ScheduleDay) []api.StaffAttendanceScheduleDay {
	out := make([]api.StaffAttendanceScheduleDay, len(days))
	for i, d := range days {
		out[i] = toAPIScheduleDay(d)
	}
	return out
}

func toServiceScheduleDayInputs(days []api.StaffAttendanceScheduleDay) []service.ScheduleDayInput {
	out := make([]service.ScheduleDayInput, len(days))
	for i, d := range days {
		out[i] = service.ScheduleDayInput{
			Weekday:      int16(d.Weekday), //nolint:gosec // validated by domain.ScheduleDay.Valid before use
			IsWorkingDay: d.IsWorkingDay, StartMinute: d.StartMinute, EndMinute: d.EndMinute, GraceMinutes: d.GraceMinutes,
		}
	}
	return out
}

func toAPIEmployees(refs []service.EmployeeRef) []api.StaffAttendanceEmployee {
	out := make([]api.StaffAttendanceEmployee, len(refs))
	for i, r := range refs {
		out[i] = api.StaffAttendanceEmployee{Id: r.ID, Name: r.Name}
	}
	return out
}

func toAPIMonthlyRecap(recap service.MonthlyRecap) api.StaffAttendanceMonthlyRecap {
	totals := make(map[string]int, len(recap.StatusTotals))
	for code, n := range recap.StatusTotals {
		totals[string(code)] = n
	}
	return api.StaffAttendanceMonthlyRecap{
		EmployeeUserId: recap.EmployeeUserID, EmployeeName: recap.EmployeeName, Month: recap.Month,
		Days: toAPIRecords(recap.Days), StatusTotals: totals,
		TotalLateMinutes: recap.TotalLateMinutes, TotalEarlyLeaveMinutes: recap.TotalEarlyLeaveMinutes,
	}
}

func toServiceEntryInput(body api.StaffAttendanceManualEntry) service.EntryInput {
	in := service.EntryInput{EmployeeUserID: body.EmployeeUserId, Date: body.Date.Time, ArrivalAt: body.ArrivalAt, DepartureAt: body.DepartureAt}
	if body.Notes != nil {
		in.Notes = *body.Notes
	}
	return in
}
