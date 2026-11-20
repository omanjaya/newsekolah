package httpx

import "testing"

func TestParseReportColumnsDecodesEncodedLabels(t *testing.T) {
	got := ParseReportColumns("no:No,name:Nama%20pegawai%2C%20kelas, class ,raw:100%")
	want := []ReportColumnChoice{
		{Key: "no", Label: "No"},
		{Key: "name", Label: "Nama pegawai, kelas"},
		{Key: "class", Label: ""},
		{Key: "raw", Label: "100%"},
	}
	if len(got) != len(want) {
		t.Fatalf("got %d columns, want %d: %+v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("column %d = %+v, want %+v", i, got[i], want[i])
		}
	}
}

func TestParseReportColumnsBlank(t *testing.T) {
	if got := ParseReportColumns("  "); got != nil {
		t.Fatalf("blank input = %+v, want nil", got)
	}
}
