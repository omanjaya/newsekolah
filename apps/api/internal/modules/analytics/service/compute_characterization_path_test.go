package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/analytics/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
)

// charSignals builds every fixture student's signals through the code path
// under characterization.
func charSignals(t *testing.T, students []charStudent, policy domain.Policy, now time.Time) map[uuid.UUID]domain.Signals {
	t.Helper()
	byID := charByID(students)
	svc := &Service{
		attendance: charAttendance{byID}, discipline: charDiscipline{byID}, grading: charGrading{byID},
		clock: clock.Frozen{At: now},
	}
	ids := make([]uuid.UUID, len(students))
	for i, s := range students {
		ids[i] = charIDFor(s.name)
	}
	return svc.buildSignals(context.Background(), uuid.Nil, ids, policy, localToday(now, time.UTC))
}
