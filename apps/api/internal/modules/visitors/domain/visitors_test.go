package domain_test

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/visitors/domain"
)

func TestBoardFlagsOverdueVisitors(t *testing.T) {
	now := time.Date(2026, 9, 10, 16, 0, 0, 0, time.UTC)
	onTime := domain.Visit{ID: uuid.New(), ArrivedAt: now.Add(-2 * time.Hour)}
	overdue := domain.Visit{ID: uuid.New(), ArrivedAt: now.Add(-9 * time.Hour)}
	edge := domain.Visit{ID: uuid.New(), ArrivedAt: now.Add(-domain.OverdueAfter)}

	entries := domain.Board([]domain.Visit{onTime, overdue, edge}, now)

	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}
	if entries[0].Overdue {
		t.Errorf("visit arrived 2h ago should not be overdue")
	}
	if !entries[1].Overdue {
		t.Errorf("visit arrived 9h ago should be overdue")
	}
	if entries[2].Overdue {
		t.Errorf("visit arrived exactly at the threshold should not yet be overdue")
	}
}

func TestVisitOnCampus(t *testing.T) {
	departed := time.Now()
	stillIn := domain.Visit{}
	left := domain.Visit{DepartedAt: &departed}

	if !stillIn.OnCampus() {
		t.Error("a visit with no departure time should read as on campus")
	}
	if left.OnCampus() {
		t.Error("a visit with a departure time should not read as on campus")
	}
}

func TestIncidentVisibleTo(t *testing.T) {
	incident := domain.Incident{}

	cases := []struct {
		name string
		role domain.IncidentReaderRole
		want bool
	}{
		{"reporter", domain.IncidentReaderRole{IsReporter: true}, true},
		{"security duty", domain.IncidentReaderRole{IsSecurity: true}, true},
		{"leadership duty", domain.IncidentReaderRole{IsLeadership: true}, true},
		{"none", domain.IncidentReaderRole{}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := incident.VisibleTo(tc.role); got != tc.want {
				t.Errorf("VisibleTo(%+v) = %v, want %v", tc.role, got, tc.want)
			}
		})
	}
}
