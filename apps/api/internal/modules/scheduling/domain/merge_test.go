package domain_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/scheduling/domain"
)

func TestMergeContiguous(t *testing.T) {
	class := uuid.New()
	subject := uuid.New()
	teacher := uuid.New()
	otherSubject := uuid.New()

	id1, id2, id3 := uuid.New(), uuid.New(), uuid.New()

	schedules := []domain.Schedule{
		{ID: id1, ClassID: class, SubjectID: subject, TeacherUserID: teacher, DayOfWeek: 1, StartSeq: 1, EndSeq: 1, Source: domain.SourceAdmin},
		{ID: id2, ClassID: class, SubjectID: subject, TeacherUserID: teacher, DayOfWeek: 1, StartSeq: 2, EndSeq: 2, Source: domain.SourceAdmin},
		{ID: id3, ClassID: class, SubjectID: otherSubject, TeacherUserID: teacher, DayOfWeek: 1, StartSeq: 3, EndSeq: 3, Source: domain.SourceAdmin},
	}

	blocks := domain.MergeContiguous(schedules)

	require.Len(t, blocks, 2)
	require.ElementsMatch(t, []uuid.UUID{id1, id2}, blocks[0].ScheduleIDs)
	require.Equal(t, int16(1), blocks[0].StartSeq)
	require.Equal(t, int16(2), blocks[0].EndSeq)

	require.ElementsMatch(t, []uuid.UUID{id3}, blocks[1].ScheduleIDs)
	require.Equal(t, int16(3), blocks[1].StartSeq)
}

func TestMergeContiguousDoesNotMergeAcrossGap(t *testing.T) {
	class, subject, teacher := uuid.New(), uuid.New(), uuid.New()
	id1, id2 := uuid.New(), uuid.New()

	schedules := []domain.Schedule{
		{ID: id1, ClassID: class, SubjectID: subject, TeacherUserID: teacher, DayOfWeek: 1, StartSeq: 1, EndSeq: 1},
		{ID: id2, ClassID: class, SubjectID: subject, TeacherUserID: teacher, DayOfWeek: 1, StartSeq: 3, EndSeq: 3},
	}

	blocks := domain.MergeContiguous(schedules)
	require.Len(t, blocks, 2, "a gap at period 2 must keep the two schedules as separate blocks")
}

func TestMergeContiguousDoesNotMergeDifferentTeacher(t *testing.T) {
	class, subject := uuid.New(), uuid.New()
	teacherA, teacherB := uuid.New(), uuid.New()
	id1, id2 := uuid.New(), uuid.New()

	schedules := []domain.Schedule{
		{ID: id1, ClassID: class, SubjectID: subject, TeacherUserID: teacherA, DayOfWeek: 1, StartSeq: 1, EndSeq: 1},
		{ID: id2, ClassID: class, SubjectID: subject, TeacherUserID: teacherB, DayOfWeek: 1, StartSeq: 2, EndSeq: 2},
	}

	blocks := domain.MergeContiguous(schedules)
	require.Len(t, blocks, 2)
}

func TestMergeContiguousAcrossDays(t *testing.T) {
	class, subject, teacher := uuid.New(), uuid.New(), uuid.New()
	id1, id2 := uuid.New(), uuid.New()

	// Same start/end sequence but different days must never merge.
	schedules := []domain.Schedule{
		{ID: id1, ClassID: class, SubjectID: subject, TeacherUserID: teacher, DayOfWeek: 1, StartSeq: 1, EndSeq: 1},
		{ID: id2, ClassID: class, SubjectID: subject, TeacherUserID: teacher, DayOfWeek: 2, StartSeq: 2, EndSeq: 2},
	}

	blocks := domain.MergeContiguous(schedules)
	require.Len(t, blocks, 2)
}
