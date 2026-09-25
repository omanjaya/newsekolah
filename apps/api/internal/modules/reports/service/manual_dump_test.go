package service_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/reportdoc"
)

// TestManualGradeLevelDump renders a realistic 14-class grade-level
// export (one class with no rows, one with a long status) to disk for
// visual review. Skipped unless REPORTDOC_DUMP is set.
func TestManualGradeLevelDump(t *testing.T) {
	if os.Getenv("REPORTDOC_DUMP") == "" {
		t.Skip("set REPORTDOC_DUMP=1 to render a sample file to /tmp")
	}

	gradeLevel := uuid.New()
	rows := map[uuid.UUID][][]any{}
	byID := map[uuid.UUID]service.ClassRef{}
	byGradeLvl := map[uuid.UUID][]service.ClassRef{}
	var classRefs []service.ClassRef
	for i := 0; i < 14; i++ {
		classID := uuid.New()
		name := fmt.Sprintf("X-%d", i+1)
		byID[classID] = service.ClassRef{ID: classID, Name: name}
		classRefs = append(classRefs, service.ClassRef{ID: classID, Name: name})
		if i == 3 {
			rows[classID] = nil // one empty class, like the coordinator's review
			continue
		}
		classRows := make([][]any, 0, 30)
		for j := 0; j < 30; j++ {
			status := "H"
			complete := true
			if j%7 == 0 {
				status = "INCOMPLETE"
				complete = false
			} else if j%5 == 0 {
				status = "S"
			}
			classRows = append(classRows, []any{j + 1, fmt.Sprintf("Siswa Nomor %d Kelas %s", j+1, name), status, 6, 6, complete})
		}
		rows[classID] = classRows
	}
	byGradeLvl[gradeLevel] = classRefs

	attendance := fakeAttendance{rows: rows, labels: map[string]string{"H": "Hadir", "S": "Sakit", "I": "Izin", "D": "Dispensasi", "A": "Alpha"}}
	academic := fakeAcademic{byID: byID, byGradeLvl: byGradeLvl, gradeLevels: map[uuid.UUID]string{gradeLevel: "Kelas X"}}
	svc := service.New(attendance, nil, nil, nil, nil)
	svc.SetReportDocDependencies(academic, fakeLetterhead{
		lh: &reportdoc.Letterhead{
			Lines:    []string{"Yayasan Pendidikan Dharma Praja", "SMA Negeri 1 Denpasar", "Jl. Kamboja No. 4, Denpasar", "Telp. (0361) 123456"},
			Emphasis: 1,
		},
		sig: &reportdoc.Signature{
			Place: "Denpasar",
			Signers: []reportdoc.Signer{
				{RoleLabel: "Wali Kelas", Name: "Ni Made Sari, S.Pd.", IDLabel: "NIP", IDNumber: "198001012005011001"},
				{RoleLabel: "Kepala Sekolah", Name: "I Wayan Arta, M.Pd.", IDLabel: "NIP", IDNumber: "197001011999031002"},
			},
		},
	})

	date := time.Date(2026, 9, 22, 0, 0, 0, 0, time.UTC)
	out, _, err := svc.RunDocument(context.Background(), uuid.New(), service.KindAttendanceDaily, service.RunArgs{
		GradeLevelID: uuid.NullUUID{UUID: gradeLevel, Valid: true}, Date: &date,
	}, reportdoc.Options{Format: reportdoc.FormatPDF, ShowLetterhead: true}, reportdoc.LocaleID)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("/tmp/reportdoc_grade_level.pdf", out, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Log("wrote /tmp/reportdoc_grade_level.pdf")
}
