package repository

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/db"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/service"
	pdatabase "github.com/omanjaya/newsekolah/apps/api/internal/platform/database"
)

func toSchedule(row db.Schedule) domain.Schedule {
	return domain.Schedule{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID,
		TermID: pdatabase.UUIDOrNil(row.TermID), ClassID: row.ClassID, SubjectID: row.SubjectID,
		TeacherUserID: row.TeacherUserID, RoomID: pdatabase.UUIDOrNil(row.RoomID),
		DayOfWeek: row.DayOfWeek, StartPeriodID: row.StartPeriodID, EndPeriodID: row.EndPeriodID,
		StartSeq: row.StartSeq, EndSeq: row.EndSeq, Source: domain.Source(row.Source),
		Notes: pdatabase.TextOrEmpty(row.Notes), CreatedBy: pdatabase.UUIDOrNil(row.CreatedBy),
		UpdatedBy: pdatabase.UUIDOrNil(row.UpdatedBy), CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
		UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

func toSubstitution(row db.SubstitutionRequest) domain.Substitution {
	return domain.Substitution{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, ScheduleID: row.ScheduleID,
		Date: pdatabase.DateOrZero(row.Date), RequesterUserID: row.RequesterUserID,
		SubstituteUserID: row.SubstituteUserID, Status: domain.SubstitutionStatus(row.Status),
		RequesterNote: pdatabase.TextOrEmpty(row.RequesterNote), ResponseNote: pdatabase.TextOrEmpty(row.ResponseNote),
		RespondedAt: pdatabase.TimePtr(row.RespondedAt), CreatedAt: pdatabase.TimeOrZero(row.CreatedAt),
	}
}

func toJournal(row db.ClassJournal) domain.Journal {
	return domain.Journal{
		ID: row.ID, TenantID: row.TenantID, AcademicYearID: row.AcademicYearID, TeacherUserID: row.TeacherUserID,
		WrittenByUserID: row.WrittenByUserID, ClassID: row.ClassID, SubjectID: row.SubjectID,
		LessonDate: pdatabase.DateOrZero(row.LessonDate), Topic: row.Topic, Activities: row.Activities,
		Reflection: pdatabase.TextOrEmpty(row.Reflection), AttendanceSessionID: pdatabase.UUIDOrNil(row.AttendanceSessionID),
		CreatedAt: pdatabase.TimeOrZero(row.CreatedAt), UpdatedAt: pdatabase.TimeOrZero(row.UpdatedAt),
	}
}

// periodTimeOfDay converts a pgtype.Time (microseconds since midnight,
// what Postgres `time` columns decode to) into a time.Time whose
// hour/minute/second reflect that time of day; the date component is
// meaningless and must never be read by callers.
func periodTimeOfDay(t pgtype.Time) time.Time {
	if !t.Valid {
		return time.Time{}
	}
	return time.Time{}.Add(time.Duration(t.Microseconds) * time.Microsecond)
}

func toPeriodRef(row db.Period) service.PeriodRef {
	return service.PeriodRef{
		ID: row.ID, Name: row.Name, Sequence: row.Sequence, StartsAt: periodTimeOfDay(row.StartsAt),
		EndsAt: periodTimeOfDay(row.EndsAt), TemplateID: row.TemplateID, IsBreak: row.IsBreak,
	}
}
