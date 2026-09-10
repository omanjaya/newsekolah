package wiring

import (
	"context"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling"
	supervisionservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/supervision/service"
)

// SupervisionSchedule resolves a scheduled observation against a real
// weekly teaching slot through the scheduling module's own exported
// reader, rather than supervision trusting a caller-supplied teacher id.
type SupervisionSchedule struct{ Reader scheduling.ScheduleReader }

func (s SupervisionSchedule) GetSchedule(ctx context.Context, tenantID, scheduleID uuid.UUID) (supervisionservice.ScheduleRef, error) {
	ref, err := s.Reader.GetSchedule(ctx, tenantID, scheduleID)
	if err != nil {
		return supervisionservice.ScheduleRef{}, err
	}
	return supervisionservice.ScheduleRef{
		ID: ref.ID, ClassID: ref.ClassID, SubjectID: ref.SubjectID, TeacherUserID: ref.TeacherUserID,
	}, nil
}
