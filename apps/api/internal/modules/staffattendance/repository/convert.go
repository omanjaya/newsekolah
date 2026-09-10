package repository

import (
	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/staffattendance/domain"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func toScheduleDay(row db.StaffAttendanceSchedule) domain.ScheduleDay {
	return domain.ScheduleDay{
		EmployeeUserID: row.EmployeeUserID, Weekday: row.Weekday, IsWorkingDay: row.IsWorkingDay,
		StartMinute: int(row.StartMinute), EndMinute: int(row.EndMinute), GraceMinutes: int(row.GraceMinutes),
	}
}

func toRecord(row db.StaffAttendanceRecord) domain.Record {
	return domain.Record{
		ID: row.ID, TenantID: row.TenantID, EmployeeUserID: row.EmployeeUserID, Date: pdatabase.DateOrZero(row.Date),
		ArrivalAt: pdatabase.TimePtr(row.ArrivalAt), DepartureAt: pdatabase.TimePtr(row.DepartureAt),
		StatusCode: domain.StatusCode(row.StatusCode), LateMinutes: int(row.LateMinutes), EarlyLeaveMinutes: int(row.EarlyLeaveMinutes),
		Source: domain.Source(row.Source), Notes: row.Notes,
		CreatedBy: pdatabase.UUIDOrNil(row.CreatedBy), UpdatedBy: pdatabase.UUIDOrNil(row.UpdatedBy),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toRecords(rows []db.StaffAttendanceRecord) []domain.Record {
	out := make([]domain.Record, len(rows))
	for i, row := range rows {
		out[i] = toRecord(row)
	}
	return out
}
