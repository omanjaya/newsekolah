package domain

import "testing"

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
	if err := dup.Validate(); err != ErrInstrumentInvalid {
		t.Fatalf("want ErrInstrumentInvalid for duplicate criterion key, got %v", err)
	}

	noCriteria := sampleInstrument()
	noCriteria.Criteria = nil
	if err := noCriteria.Validate(); err != ErrInstrumentInvalid {
		t.Fatalf("want ErrInstrumentInvalid for no criteria, got %v", err)
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
