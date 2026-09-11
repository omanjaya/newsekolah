package service

import (
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

// TestMapCheckViolation proves the 23514 (check constraint) safety net
// maps to the given domain error, leaves every other error untouched, and
// passes nil through -- the same contract mapUniqueViolation and
// mapNotFound already have.
func TestMapCheckViolation(t *testing.T) {
	require.NoError(t, mapCheckViolation(nil, domain.ErrFieldTooLong))

	checkErr := &pgconn.PgError{Code: postgresCheckViolation}
	require.ErrorIs(t, mapCheckViolation(checkErr, domain.ErrFieldTooLong), domain.ErrFieldTooLong)

	uniqueErr := &pgconn.PgError{Code: postgresUniqueViolation}
	require.Same(t, uniqueErr, mustAsPgError(t, mapCheckViolation(uniqueErr, domain.ErrFieldTooLong)))
}

func mustAsPgError(t *testing.T, err error) *pgconn.PgError {
	t.Helper()
	pgErr, ok := err.(*pgconn.PgError)
	require.True(t, ok, "expected a *pgconn.PgError, got %T", err)
	return pgErr
}
