package domain

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestReaderMayRead(t *testing.T) {
	self, other := uuid.New(), uuid.New()
	own := Reader{UserID: self}
	if !own.MayRead(self) {
		t.Fatal("an own-only reader must read their own records")
	}
	if own.MayRead(other) {
		t.Fatal("an own-only reader must not read another teacher's records")
	}
	if (Reader{}).MayRead(uuid.Nil) {
		t.Fatal("a reader without a user must not match a nil teacher id")
	}
	if !(Reader{UserID: self, AllTeachers: true}).MayRead(other) {
		t.Fatal("a school-wide reader reads every teacher's records")
	}
}

func sampleInstrument() Instrument {
	return Instrument{
		Name: "Instrumen supervisi kelas", ScaleMin: 1, ScaleMax: 4,
		Criteria: []Criterion{
			{Key: "materi", Name: "Penguasaan materi"},
			{Key: "kelas", Name: "Pengelolaan kelas"},
			{Key: "metode", Name: "Metode pembelajaran"},
		},
	}
}

func TestInstrumentValidate(t *testing.T) {
	if err := sampleInstrument().Validate(); err != nil {
		t.Fatalf("valid instrument rejected: %v", err)
	}

	noName := sampleInstrument()
	noName.Name = "  "
	if err := noName.Validate(); err != ErrInstrumentInvalid {
		t.Fatalf("want ErrInstrumentInvalid for empty name, got %v", err)
	}

	badScale := sampleInstrument()
	badScale.ScaleMin, badScale.ScaleMax = 4, 4
	if err := badScale.Validate(); err != ErrInstrumentInvalid {
		t.Fatalf("want ErrInstrumentInvalid for scale_min >= scale_max, got %v", err)
	}

	dup := sampleInstrument()
	dup.Criteria = append(dup.Criteria, Criterion{Key: "materi", Name: "Duplikat"})
	// Its own error, so the form can say the codes must be unique instead
	// of the generic "needs a name, a criterion and a scale".
	if err := dup.Validate(); err != ErrCriterionKeyTaken {
		t.Fatalf("want ErrCriterionKeyTaken for duplicate criterion key, got %v", err)
	}

	noCriteria := sampleInstrument()
	noCriteria.Criteria = nil
	if err := noCriteria.Validate(); err != ErrInstrumentInvalid {
		t.Fatalf("want ErrInstrumentInvalid for no criteria, got %v", err)
	}
}

func TestInstrumentValidateNames(t *testing.T) {
	if err := sampleInstrument().ValidateNames(nil); err != nil {
		t.Fatalf("distinct names rejected: %v", err)
	}

	// Two rows the scoring form could not tell apart, even though their
	// keys differ: refused on create, whatever the case or spacing.
	dup := sampleInstrument()
	dup.Criteria = append(dup.Criteria, Criterion{Key: "materi_2", Name: "  penguasaan   MATERI "})
	if err := dup.ValidateNames(nil); err != ErrCriterionNameTaken {
		t.Fatalf("want ErrCriterionNameTaken for a repeated name, got %v", err)
	}

	// An instrument saved before the rule keeps its repetition editable...
	if err := dup.ValidateNames(&dup); err != nil {
		t.Fatalf("an already repeated name blocked the edit: %v", err)
	}
	// ...but a new repetition is still refused.
	more := dup
	more.Criteria = append(append([]Criterion{}, dup.Criteria...), Criterion{Key: "kelas_2", Name: "Pengelolaan kelas"})
	if err := more.ValidateNames(&dup); err != ErrCriterionNameTaken {
		t.Fatalf("want ErrCriterionNameTaken for a new repetition, got %v", err)
	}
	// ...and so is a third copy of the name that already repeated.
	third := dup
	third.Criteria = append(append([]Criterion{}, dup.Criteria...), Criterion{Key: "materi_3", Name: "Penguasaan Materi"})
	if err := third.ValidateNames(&dup); err != ErrCriterionNameTaken {
		t.Fatalf("want ErrCriterionNameTaken for a third copy of a legacy repetition, got %v", err)
	}
	// Dropping a copy, or renaming one to a distinct name, stays allowed.
	fewer := sampleInstrument()
	if err := fewer.ValidateNames(&dup); err != nil {
		t.Fatalf("removing a legacy copy was refused: %v", err)
	}
	renamed := dup
	renamed.Criteria = append([]Criterion{}, dup.Criteria...)
	renamed.Criteria[len(renamed.Criteria)-1].Name = "Penguasaan materi lanjutan"
	if err := renamed.ValidateNames(&dup); err != nil {
		t.Fatalf("renaming a legacy copy was refused: %v", err)
	}
}

func TestInstrumentValidateScores(t *testing.T) {
	instrument := sampleInstrument()

	complete := []CriterionScore{
		{CriterionKey: "materi", Score: 3},
		{CriterionKey: "kelas", Score: 4},
		{CriterionKey: "metode", Score: 2},
	}
	if err := instrument.ValidateScores(complete); err != nil {
		t.Fatalf("valid scores rejected: %v", err)
	}

	missing := complete[:2]
	if err := instrument.ValidateScores(missing); err != ErrScoreCountMismatch {
		t.Fatalf("want ErrScoreCountMismatch for missing criterion, got %v", err)
	}

	unknown := []CriterionScore{
		{CriterionKey: "materi", Score: 3},
		{CriterionKey: "kelas", Score: 4},
		{CriterionKey: "tidak-ada", Score: 2},
	}
	if err := instrument.ValidateScores(unknown); err != ErrScoreCountMismatch {
		t.Fatalf("want ErrScoreCountMismatch for unknown criterion key, got %v", err)
	}

	duplicate := []CriterionScore{
		{CriterionKey: "materi", Score: 3},
		{CriterionKey: "materi", Score: 4},
		{CriterionKey: "metode", Score: 2},
	}
	if err := instrument.ValidateScores(duplicate); err != ErrScoreCountMismatch {
		t.Fatalf("want ErrScoreCountMismatch for duplicate criterion key, got %v", err)
	}

	outOfRange := []CriterionScore{
		{CriterionKey: "materi", Score: 0},
		{CriterionKey: "kelas", Score: 4},
		{CriterionKey: "metode", Score: 2},
	}
	if err := instrument.ValidateScores(outOfRange); err != ErrScoreOutOfRange {
		t.Fatalf("want ErrScoreOutOfRange for score below scale, got %v", err)
	}

	tooHigh := []CriterionScore{
		{CriterionKey: "materi", Score: 5},
		{CriterionKey: "kelas", Score: 4},
		{CriterionKey: "metode", Score: 2},
	}
	if err := instrument.ValidateScores(tooHigh); err != ErrScoreOutOfRange {
		t.Fatalf("want ErrScoreOutOfRange for score above scale, got %v", err)
	}
}

func TestAverage(t *testing.T) {
	scores := []CriterionScore{{Score: 2}, {Score: 4}, {Score: 3}}
	if got := Average(scores); got != 3 {
		t.Fatalf("Average() = %v, want 3", got)
	}
	if got := Average(nil); got != 0 {
		t.Fatalf("Average(nil) = %v, want 0", got)
	}
}

func TestObservationVisibleTo(t *testing.T) {
	obs := Observation{}
	cases := []struct {
		name   string
		reader ObservationReader
		want   bool
	}{
		{"observer reads own report", ObservationReader{IsObserver: true}, true},
		{"leadership reads", ObservationReader{IsLeadership: true}, true},
		{"observed teacher reads own", ObservationReader{IsObserved: true}, true},
		{"unrelated teacher cannot read", ObservationReader{}, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := obs.VisibleTo(c.reader); got != c.want {
				t.Fatalf("VisibleTo(%+v) = %v, want %v", c.reader, got, c.want)
			}
		})
	}
}

func TestScheduledObservationMatchesLessonDay(t *testing.T) {
	friday := ScheduledObservation{LessonDate: time.Date(2026, 11, 20, 0, 0, 0, 0, time.UTC)}
	if err := friday.MatchesLessonDay(5); err != nil {
		t.Fatalf("a Friday lesson on a Friday: want nil, got %v", err)
	}
	if err := friday.MatchesLessonDay(1); err != ErrLessonDayMismatch {
		t.Fatalf("a Monday lesson on a Friday: want ErrLessonDayMismatch, got %v", err)
	}
	sunday := ScheduledObservation{LessonDate: time.Date(2026, 11, 22, 0, 0, 0, 0, time.UTC)}
	if err := sunday.MatchesLessonDay(7); err != nil {
		t.Fatalf("Sunday is ISO weekday 7: want nil, got %v", err)
	}
}
