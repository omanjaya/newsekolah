package domain

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func validStudentRow() ImportRow {
	return ImportRow{
		RowNumber:   2,
		Name:        "Siti Aminah",
		ProfileKind: ProfileStudent,
		RoleSlug:    "siswa",
		Password:    "Password123!",
		NIS:         "2026001",
		Gender:      "female",
	}
}

func TestValidateImportRow(t *testing.T) {
	tests := []struct {
		name     string
		row      func() ImportRow
		isUpdate bool
		wantErrs []string
	}{
		{
			name:     "valid student row create",
			row:      validStudentRow,
			isUpdate: false,
			wantErrs: nil,
		},
		{
			name: "missing name",
			row: func() ImportRow {
				r := validStudentRow()
				r.Name = ""
				return r
			},
			wantErrs: []string{"name is required"},
		},
		{
			name: "name too long",
			row: func() ImportRow {
				r := validStudentRow()
				r.Name = string(make([]byte, 151))
				return r
			},
			wantErrs: []string{"name must be at most 150 characters"},
		},
		{
			name: "invalid profile kind",
			row: func() ImportRow {
				r := validStudentRow()
				r.ProfileKind = "alien"
				return r
			},
			wantErrs: []string{"profile_kind must be one of student, teacher, staff"},
		},
		{
			name: "missing role slug",
			row: func() ImportRow {
				r := validStudentRow()
				r.RoleSlug = ""
				return r
			},
			wantErrs: []string{"role_slug is required"},
		},
		{
			name: "student without nis",
			row: func() ImportRow {
				r := validStudentRow()
				r.NIS = ""
				return r
			},
			wantErrs: []string{"nis is required for student profiles"},
		},
		{
			name: "teacher without nip",
			row: func() ImportRow {
				return ImportRow{Name: "Pak Guru", ProfileKind: ProfileTeacher, RoleSlug: "guru", Password: "Password123!"}
			},
			wantErrs: []string{"nip is required for teacher profiles"},
		},
		{
			name: "staff without employee number",
			row: func() ImportRow {
				return ImportRow{Name: "Bu Staf", ProfileKind: ProfileStaff, RoleSlug: "pegawai", Password: "Password123!"}
			},
			wantErrs: []string{"employee_number is required for staff profiles"},
		},
		{
			name: "invalid gender",
			row: func() ImportRow {
				r := validStudentRow()
				r.Gender = "other"
				return r
			},
			wantErrs: []string{"gender must be L/P (or male/female)"},
		},
		{
			name: "weak password on create",
			row: func() ImportRow {
				r := validStudentRow()
				r.Password = "short"
				return r
			},
			wantErrs: []string{ErrPasswordTooShort.Error()},
		},
		{
			name: "weak password ignored on update",
			row: func() ImportRow {
				r := validStudentRow()
				r.Password = "short"
				return r
			},
			isUpdate: true,
			wantErrs: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			errs := ValidateImportRow(tt.row(), tt.isUpdate)
			require.Equal(t, tt.wantErrs, errs)
		})
	}
}

func TestNormalizeGender(t *testing.T) {
	tests := []struct {
		in     string
		want   string
		wantOK bool
	}{
		{"L", "male", true},
		{"p", "female", true},
		{"Laki-Laki", "male", true},
		{"perempuan", "female", true},
		{"male", "male", true},
		{"FEMALE", "female", true},
		{"other", "", false},
		{"", "", false},
	}
	for _, tt := range tests {
		got, ok := NormalizeGender(tt.in)
		if got != tt.want || ok != tt.wantOK {
			t.Errorf("NormalizeGender(%q) = (%q, %v), want (%q, %v)", tt.in, got, ok, tt.want, tt.wantOK)
		}
	}
}

func TestValidateBloodType(t *testing.T) {
	tests := []struct {
		in   string
		want bool
	}{
		{"A", true}, {"o", true}, {"AB+", true}, {"ab-", true},
		{"", false}, {"C", false}, {"A++", false},
	}
	for _, tt := range tests {
		if got := ValidateBloodType(tt.in); got != tt.want {
			t.Errorf("ValidateBloodType(%q) = %v, want %v", tt.in, got, tt.want)
		}
	}
}

func TestResolveRoleAlias(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"siswa", "student"},
		{"Guru", "teacher"},
		{"PEGAWAI", "staff"},
		{"wali", "wali"},                   // no longer a known alias (parent accounts removed); passes through
		{"wali_kelas_7a", "wali_kelas_7a"}, // unknown alias passes through as a custom slug
	}
	for _, tt := range tests {
		if got := ResolveRoleAlias(tt.in); got != tt.want {
			t.Errorf("ResolveRoleAlias(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
