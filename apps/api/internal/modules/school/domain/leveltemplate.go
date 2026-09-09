// Package domain (this file): education-level templates for the onboarding
// wizard. A template is a starting point, not a fixed catalog -- applying
// one only fills in what a fresh tenant does not have yet (grade levels,
// subjects, a default bell schedule), so a school with SD, SMP, and SMA in
// one tenant can apply more than one template without conflict. Pure data
// and validation only; creating the rows is the service's job.
package domain

import "errors"

// LevelTemplateKey names one Indonesian education level. These match the
// SchoolProfileWrite.education_level values already used by the tenant
// profile step (openapi/modules/tenant.yaml) so the wizard can default the
// template choice to the profile the school just set.
type LevelTemplateKey string

const (
	LevelSD  LevelTemplateKey = "sd"
	LevelSMP LevelTemplateKey = "smp"
	LevelSMA LevelTemplateKey = "sma"
	LevelSMK LevelTemplateKey = "smk"
)

// ErrUnknownLevelTemplate is returned for any key other than sd/smp/sma/smk.
var ErrUnknownLevelTemplate = errors.New("unknown level template")

// GradeLevelSpec is one grade level a template contributes, matched against
// existing grade levels by Code.
type GradeLevelSpec struct {
	Code     string
	Name     string
	Sequence int16
}

// SubjectSpec is one subject a template contributes, matched by Code.
type SubjectSpec struct {
	Code string
	Name string
}

// PeriodSpec is one row of the default bell schedule, matched by Sequence
// within the template's period template.
type PeriodSpec struct {
	Sequence    int16
	Name        string
	StartHour   int
	StartMinute int
	EndHour     int
	EndMinute   int
	IsBreak     bool
}

// LevelTemplate bundles everything one education level starts a fresh
// tenant with.
type LevelTemplate struct {
	Key            LevelTemplateKey
	Name           string
	PeriodTemplate string
	GradeLevels    []GradeLevelSpec
	Subjects       []SubjectSpec
	Periods        []PeriodSpec
}

var levelTemplates = map[LevelTemplateKey]LevelTemplate{
	LevelSD: {
		Key: LevelSD, Name: "Sekolah Dasar", PeriodTemplate: "Reguler SD",
		GradeLevels: []GradeLevelSpec{
			{Code: "1", Name: "Kelas 1", Sequence: 1},
			{Code: "2", Name: "Kelas 2", Sequence: 2},
			{Code: "3", Name: "Kelas 3", Sequence: 3},
			{Code: "4", Name: "Kelas 4", Sequence: 4},
			{Code: "5", Name: "Kelas 5", Sequence: 5},
			{Code: "6", Name: "Kelas 6", Sequence: 6},
		},
		Subjects: []SubjectSpec{
			{Code: "PAI", Name: "Pendidikan Agama dan Budi Pekerti"},
			{Code: "PKN", Name: "Pendidikan Pancasila dan Kewarganegaraan"},
			{Code: "BIN", Name: "Bahasa Indonesia"},
			{Code: "MTK", Name: "Matematika"},
			{Code: "IPAS", Name: "Ilmu Pengetahuan Alam dan Sosial"},
			{Code: "SBDP", Name: "Seni Budaya dan Prakarya"},
			{Code: "PJOK", Name: "Pendidikan Jasmani, Olahraga, dan Kesehatan"},
		},
		Periods: []PeriodSpec{
			{Sequence: 1, Name: "Jam ke-1", StartHour: 7, StartMinute: 0, EndHour: 7, EndMinute: 35},
			{Sequence: 2, Name: "Jam ke-2", StartHour: 7, StartMinute: 35, EndHour: 8, EndMinute: 10},
			{Sequence: 3, Name: "Jam ke-3", StartHour: 8, StartMinute: 10, EndHour: 8, EndMinute: 45},
			{Sequence: 4, Name: "Istirahat", StartHour: 8, StartMinute: 45, EndHour: 9, EndMinute: 5, IsBreak: true},
			{Sequence: 5, Name: "Jam ke-4", StartHour: 9, StartMinute: 5, EndHour: 9, EndMinute: 40},
			{Sequence: 6, Name: "Jam ke-5", StartHour: 9, StartMinute: 40, EndHour: 10, EndMinute: 15},
			{Sequence: 7, Name: "Jam ke-6", StartHour: 10, StartMinute: 15, EndHour: 10, EndMinute: 50},
		},
	},
	LevelSMP: {
		Key: LevelSMP, Name: "Sekolah Menengah Pertama", PeriodTemplate: "Reguler SMP",
		GradeLevels: []GradeLevelSpec{
			{Code: "7", Name: "Kelas 7", Sequence: 1},
			{Code: "8", Name: "Kelas 8", Sequence: 2},
			{Code: "9", Name: "Kelas 9", Sequence: 3},
		},
		Subjects: []SubjectSpec{
			{Code: "PAI", Name: "Pendidikan Agama dan Budi Pekerti"},
			{Code: "PKN", Name: "Pendidikan Pancasila dan Kewarganegaraan"},
			{Code: "BIN", Name: "Bahasa Indonesia"},
			{Code: "MTK", Name: "Matematika"},
			{Code: "IPA", Name: "Ilmu Pengetahuan Alam"},
			{Code: "IPS", Name: "Ilmu Pengetahuan Sosial"},
			{Code: "BIG", Name: "Bahasa Inggris"},
			{Code: "SBK", Name: "Seni Budaya"},
			{Code: "PJOK", Name: "Pendidikan Jasmani, Olahraga, dan Kesehatan"},
			{Code: "PRA", Name: "Prakarya"},
		},
		Periods: []PeriodSpec{
			{Sequence: 1, Name: "Jam ke-1", StartHour: 7, StartMinute: 0, EndHour: 7, EndMinute: 40},
			{Sequence: 2, Name: "Jam ke-2", StartHour: 7, StartMinute: 40, EndHour: 8, EndMinute: 20},
			{Sequence: 3, Name: "Jam ke-3", StartHour: 8, StartMinute: 20, EndHour: 9, EndMinute: 0},
			{Sequence: 4, Name: "Jam ke-4", StartHour: 9, StartMinute: 0, EndHour: 9, EndMinute: 40},
			{Sequence: 5, Name: "Istirahat", StartHour: 9, StartMinute: 40, EndHour: 10, EndMinute: 0, IsBreak: true},
			{Sequence: 6, Name: "Jam ke-5", StartHour: 10, StartMinute: 0, EndHour: 10, EndMinute: 40},
			{Sequence: 7, Name: "Jam ke-6", StartHour: 10, StartMinute: 40, EndHour: 11, EndMinute: 20},
			{Sequence: 8, Name: "Jam ke-7", StartHour: 11, StartMinute: 20, EndHour: 12, EndMinute: 0},
		},
	},
	LevelSMA: {
		Key: LevelSMA, Name: "Sekolah Menengah Atas", PeriodTemplate: "Reguler SMA",
		GradeLevels: []GradeLevelSpec{
			{Code: "X", Name: "Kelas X", Sequence: 1},
			{Code: "XI", Name: "Kelas XI", Sequence: 2},
			{Code: "XII", Name: "Kelas XII", Sequence: 3},
		},
		Subjects: []SubjectSpec{
			{Code: "PAI", Name: "Pendidikan Agama dan Budi Pekerti"},
			{Code: "PKN", Name: "Pendidikan Pancasila dan Kewarganegaraan"},
			{Code: "BIN", Name: "Bahasa Indonesia"},
			{Code: "MTK", Name: "Matematika"},
			{Code: "BIG", Name: "Bahasa Inggris"},
			{Code: "FIS", Name: "Fisika"},
			{Code: "KIM", Name: "Kimia"},
			{Code: "BIO", Name: "Biologi"},
			{Code: "SEJ", Name: "Sejarah"},
			{Code: "GEO", Name: "Geografi"},
			{Code: "EKO", Name: "Ekonomi"},
			{Code: "SOS", Name: "Sosiologi"},
			{Code: "PJOK", Name: "Pendidikan Jasmani, Olahraga, dan Kesehatan"},
		},
		Periods: []PeriodSpec{
			{Sequence: 1, Name: "Jam ke-1", StartHour: 7, StartMinute: 0, EndHour: 7, EndMinute: 45},
			{Sequence: 2, Name: "Jam ke-2", StartHour: 7, StartMinute: 45, EndHour: 8, EndMinute: 30},
			{Sequence: 3, Name: "Jam ke-3", StartHour: 8, StartMinute: 30, EndHour: 9, EndMinute: 15},
			{Sequence: 4, Name: "Jam ke-4", StartHour: 9, StartMinute: 15, EndHour: 10, EndMinute: 0},
			{Sequence: 5, Name: "Istirahat", StartHour: 10, StartMinute: 0, EndHour: 10, EndMinute: 20, IsBreak: true},
			{Sequence: 6, Name: "Jam ke-5", StartHour: 10, StartMinute: 20, EndHour: 11, EndMinute: 5},
			{Sequence: 7, Name: "Jam ke-6", StartHour: 11, StartMinute: 5, EndHour: 11, EndMinute: 50},
			{Sequence: 8, Name: "Jam ke-7", StartHour: 11, StartMinute: 50, EndHour: 12, EndMinute: 35},
			{Sequence: 9, Name: "Istirahat Kedua", StartHour: 12, StartMinute: 35, EndHour: 13, EndMinute: 15, IsBreak: true},
			{Sequence: 10, Name: "Jam ke-8", StartHour: 13, StartMinute: 15, EndHour: 14, EndMinute: 0},
		},
	},
	LevelSMK: {
		Key: LevelSMK, Name: "Sekolah Menengah Kejuruan", PeriodTemplate: "Reguler SMK",
		GradeLevels: []GradeLevelSpec{
			{Code: "X", Name: "Kelas X", Sequence: 1},
			{Code: "XI", Name: "Kelas XI", Sequence: 2},
			{Code: "XII", Name: "Kelas XII", Sequence: 3},
		},
		Subjects: []SubjectSpec{
			{Code: "PAI", Name: "Pendidikan Agama dan Budi Pekerti"},
			{Code: "PKN", Name: "Pendidikan Pancasila dan Kewarganegaraan"},
			{Code: "BIN", Name: "Bahasa Indonesia"},
			{Code: "MTK", Name: "Matematika"},
			{Code: "BIG", Name: "Bahasa Inggris"},
			{Code: "IPAS", Name: "Ilmu Pengetahuan Alam dan Sosial"},
			{Code: "PJOK", Name: "Pendidikan Jasmani, Olahraga, dan Kesehatan"},
			{Code: "KEJ", Name: "Mata Pelajaran Kejuruan"},
			{Code: "PKL", Name: "Praktik Kerja Lapangan"},
		},
		Periods: []PeriodSpec{
			{Sequence: 1, Name: "Jam ke-1", StartHour: 7, StartMinute: 0, EndHour: 7, EndMinute: 45},
			{Sequence: 2, Name: "Jam ke-2", StartHour: 7, StartMinute: 45, EndHour: 8, EndMinute: 30},
			{Sequence: 3, Name: "Jam ke-3", StartHour: 8, StartMinute: 30, EndHour: 9, EndMinute: 15},
			{Sequence: 4, Name: "Jam ke-4", StartHour: 9, StartMinute: 15, EndHour: 10, EndMinute: 0},
			{Sequence: 5, Name: "Istirahat", StartHour: 10, StartMinute: 0, EndHour: 10, EndMinute: 20, IsBreak: true},
			{Sequence: 6, Name: "Jam ke-5", StartHour: 10, StartMinute: 20, EndHour: 11, EndMinute: 5},
			{Sequence: 7, Name: "Jam ke-6", StartHour: 11, StartMinute: 5, EndHour: 11, EndMinute: 50},
			{Sequence: 8, Name: "Jam ke-7", StartHour: 11, StartMinute: 50, EndHour: 12, EndMinute: 35},
			{Sequence: 9, Name: "Istirahat Kedua", StartHour: 12, StartMinute: 35, EndHour: 13, EndMinute: 15, IsBreak: true},
			{Sequence: 10, Name: "Jam ke-8", StartHour: 13, StartMinute: 15, EndHour: 14, EndMinute: 0},
			{Sequence: 11, Name: "Jam ke-9", StartHour: 14, StartMinute: 0, EndHour: 14, EndMinute: 45},
		},
	},
}

// LevelTemplateKeys lists every known template key, in a stable order, for
// building the wizard's step-1 picker.
func LevelTemplateKeys() []LevelTemplateKey {
	return []LevelTemplateKey{LevelSD, LevelSMP, LevelSMA, LevelSMK}
}

// LevelTemplateByKey returns the full template for a known key, or
// ErrUnknownLevelTemplate. Slices are copied so a caller mutating the
// result cannot corrupt the package-level catalog.
func LevelTemplateByKey(key string) (LevelTemplate, error) {
	tpl, ok := levelTemplates[LevelTemplateKey(key)]
	if !ok {
		return LevelTemplate{}, ErrUnknownLevelTemplate
	}
	out := tpl
	out.GradeLevels = append([]GradeLevelSpec(nil), tpl.GradeLevels...)
	out.Subjects = append([]SubjectSpec(nil), tpl.Subjects...)
	out.Periods = append([]PeriodSpec(nil), tpl.Periods...)
	return out, nil
}
