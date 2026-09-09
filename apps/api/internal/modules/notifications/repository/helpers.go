package repository

import "github.com/jackc/pgx/v5/pgtype"

// intPtrToInt2 and int2ToIntPtr round-trip the *int this module's service
// layer uses for an optional hour (0-23) through pgtype.Int2, the sqlc
// type for a nullable smallint column.
func intPtrToInt2(v *int) pgtype.Int2 {
	if v == nil {
		return pgtype.Int2{}
	}
	return pgtype.Int2{Int16: int16(*v), Valid: true} //nolint:gosec // hour is validated to 0-23 by the transport layer
}

func int2ToIntPtr(v pgtype.Int2) *int {
	if !v.Valid {
		return nil
	}
	n := int(v.Int16)
	return &n
}
