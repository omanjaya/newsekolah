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
	out := make(map[uuid.UUID]domain.Signals, len(students))
	for _, s := range students {
		id := charIDFor(s.name)
		out[id] = svc.buildSignals(context.Background(), uuid.Nil, id, policy, now)
	}
	return out
}
