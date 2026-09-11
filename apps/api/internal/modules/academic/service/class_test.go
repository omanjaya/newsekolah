package service

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

// TestCreateClassRejectsOverlongName proves CreateClass rejects a class
// name past the 150-character check(length(name) <= 150) constraint
// (migrations/0100_class_name.up.sql) with a domain error before ever
// opening a transaction -- previously nothing enforced this in Go, so an
// overlong name reached Postgres and surfaced as an unmapped check-
// constraint violation.
func TestCreateClassRejectsOverlongName(t *testing.T) {
	svc := &Service{}
	overlong := strings.Repeat("a", domain.MaxClassNameLength+1)

	_, err := svc.CreateClass(context.Background(), domain.Class{
		TenantID: uuid.New(), AcademicYearID: uuid.New(), GradeLevelID: uuid.New(), Name: overlong,
	})
	require.ErrorIs(t, err, domain.ErrFieldTooLong)
}

// TestUpdateClassRejectsOverlongName is UpdateClass's equivalent of
// TestCreateClassRejectsOverlongName.
func TestUpdateClassRejectsOverlongName(t *testing.T) {
	svc := &Service{}
	overlong := strings.Repeat("a", domain.MaxClassNameLength+1)

	_, err := svc.UpdateClass(context.Background(), domain.Class{
		ID: uuid.New(), TenantID: uuid.New(), AcademicYearID: uuid.New(), GradeLevelID: uuid.New(), Name: overlong,
	})
	require.ErrorIs(t, err, domain.ErrFieldTooLong)
}
