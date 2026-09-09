package service

import (
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// postgresUniqueViolation is Postgres's SQLSTATE for a unique constraint
// violation (23505); mapUniqueViolation turns that into the domain
// sentinel a repository caller already knows how to map to an HTTP
// response, instead of leaking a raw pgconn.PgError.
const postgresUniqueViolation = "23505"

func mapUniqueViolation(err error, domainErr error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == postgresUniqueViolation {
		return domainErr
	}
	return err
}

func mapNotFound(err error, domainErr error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return domainErr
	}
	return err
}
