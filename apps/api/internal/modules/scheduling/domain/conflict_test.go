package domain_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
)

func sched(id string, day, start, end int16, classID, teacherID uuid.UUID) domain.Schedule {
	return domain.Schedule{
		ID: uuid.MustParse(id), DayOfWeek: day, StartSeq: start, EndSeq: end,
		ClassID: classID, TeacherUserID: teacherID,
	}
}

func TestDetectConflict(t *testing.T) {
	classA := uuid.New()
	classB := uuid.New()
	teacherA := uuid.New()
	teacherB := uuid.New()

	existing := []domain.Schedule{
		sched("00000000-0000-0000-0000-000000000001", 1, 1, 2, classA, teacherA),
		sched("00000000-0000-0000-0000-000000000002", 2, 3, 4, classB, teacherB),
	}

	tests := []struct {
		name      string
		candidate domain.Schedule
		selfID    uuid.UUID
		wantErr   error
	}{
		{
			name:      "no overlap different day",
			candidate: domain.Schedule{DayOfWeek: 3, StartSeq: 1, EndSeq: 2, ClassID: classA, TeacherUserID: teacherA},
		},
		{
			name:      "no overlap same day different periods",
			candidate: domain.Schedule{DayOfWeek: 1, StartSeq: 3, EndSeq: 4, ClassID: classA, TeacherUserID: teacherA},
		},
		{
			name:      "class conflict",
			candidate: domain.Schedule{DayOfWeek: 1, StartSeq: 2, EndSeq: 3, ClassID: classA, TeacherUserID: teacherB},
			wantErr:   domain.ErrConflictClass,
		},
		{
			name:      "teacher conflict across different classes",
			candidate: domain.Schedule{DayOfWeek: 1, StartSeq: 2, EndSeq: 3, ClassID: classB, TeacherUserID: teacherA},
			wantErr:   domain.ErrConflictTeacher,
		},
		{
			name:      "exact same range different class and teacher is fine",
			candidate: domain.Schedule{DayOfWeek: 1, StartSeq: 1, EndSeq: 2, ClassID: classB, TeacherUserID: teacherB},
		},
		{
			name:      "updating itself never conflicts with itself",
			candidate: sched("00000000-0000-0000-0000-000000000001", 1, 1, 2, classA, teacherA),
			selfID:    uuid.MustParse("00000000-0000-0000-0000-000000000001"),
		},
		{
			name:      "touching but not overlapping ranges are fine",
			candidate: domain.Schedule{DayOfWeek: 2, StartSeq: 5, EndSeq: 6, ClassID: classB, TeacherUserID: teacherB},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := domain.DetectConflict(existing, tc.candidate, tc.selfID)
			if tc.wantErr == nil {
				require.NoError(t, err)
				return
			}
			require.ErrorIs(t, err, tc.wantErr)
		})
	}
}
