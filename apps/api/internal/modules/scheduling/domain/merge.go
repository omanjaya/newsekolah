package domain

import (
	"sort"

	"github.com/google/uuid"
)

// Block is a run of one or more Schedule rows that a list view should
// render as a single visual entry, per the old system's "jam kontinu
// digabung" behaviour (docs/analysis/backend-inventory.md section 1.8):
// a class studying the same subject with the same teacher and room across
// back-to-back periods shows as one block with every underlying schedule
// ID, not one row per period.
type Block struct {
	ScheduleIDs   []uuid.UUID
	ClassID       uuid.UUID
	SubjectID     uuid.UUID
	TeacherUserID uuid.UUID
	RoomID        uuid.NullUUID
	DayOfWeek     int16
	StartSeq      int16
	EndSeq        int16
	Source        Source
}

// MergeContiguous groups schedules (already scoped to one class or one
// teacher's grid, spanning possibly several days) into Blocks: it sorts by
// day then start period, then folds a schedule into the previous block
// when class, subject, teacher, room, and source all match AND its start
// period immediately follows the previous block's end period. Two
// same-subject schedules separated by a different lesson in between, or by
// a gap, stay separate blocks.
func MergeContiguous(schedules []Schedule) []Block {
	sorted := append([]Schedule(nil), schedules...)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].DayOfWeek != sorted[j].DayOfWeek {
			return sorted[i].DayOfWeek < sorted[j].DayOfWeek
		}
		return sorted[i].StartSeq < sorted[j].StartSeq
	})

	var blocks []Block
	for _, s := range sorted {
		if last := lastBlock(blocks); last != nil && sameGroup(*last, s) && s.StartSeq == last.EndSeq+1 {
			last.ScheduleIDs = append(last.ScheduleIDs, s.ID)
			last.EndSeq = s.EndSeq
			continue
		}
		blocks = append(blocks, Block{
			ScheduleIDs:   []uuid.UUID{s.ID},
			ClassID:       s.ClassID,
			SubjectID:     s.SubjectID,
			TeacherUserID: s.TeacherUserID,
			RoomID:        s.RoomID,
			DayOfWeek:     s.DayOfWeek,
			StartSeq:      s.StartSeq,
			EndSeq:        s.EndSeq,
			Source:        s.Source,
		})
	}
	return blocks
}

func lastBlock(blocks []Block) *Block {
	if len(blocks) == 0 {
		return nil
	}
	return &blocks[len(blocks)-1]
}

func sameGroup(b Block, s Schedule) bool {
	return b.DayOfWeek == s.DayOfWeek &&
		b.ClassID == s.ClassID &&
		b.SubjectID == s.SubjectID &&
		b.TeacherUserID == s.TeacherUserID &&
		b.RoomID == s.RoomID &&
		b.Source == s.Source
}
