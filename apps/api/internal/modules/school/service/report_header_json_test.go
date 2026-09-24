package service

import (
	"encoding/json"
	"testing"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school/domain"
)

func TestReportHeaderJSONWithoutEmphasisReadsAsAuto(t *testing.T) {
	var stored reportHeaderJSON
	if err := json.Unmarshal([]byte(`{"show_logo":true,"lines":["A","B"],"place":"Denpasar","signers":[]}`), &stored); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got := stored.toDomain().Emphasis; got != domain.EmphasisAuto {
		t.Fatalf("a blob saved before emphasis existed must read as automatic, got %d", got)
	}
}

func TestReportHeaderJSONRoundTripsEmphasis(t *testing.T) {
	for _, emphasis := range []int{domain.EmphasisAuto, 0, 2} {
		raw, err := json.Marshal(toReportHeaderJSON(domain.ReportHeader{Lines: []string{"A", "B", "C"}, Emphasis: emphasis}))
		if err != nil {
			t.Fatalf("marshal: %v", err)
		}
		var back reportHeaderJSON
		if err := json.Unmarshal(raw, &back); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if got := back.toDomain().Emphasis; got != emphasis {
			t.Fatalf("emphasis %d round-tripped as %d (stored %s)", emphasis, got, raw)
		}
	}
}
