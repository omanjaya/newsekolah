package domain_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/academic/domain"
)

// TestValidateMaxLength covers the boundary the class-name overlong-input
// review finding was about: a name at the limit must pass, one rune past
// it must fail with ErrFieldTooLong so the service can reject it with a
// 400 before it ever reaches the check(length(name) <= 150) constraint.
func TestValidateMaxLength(t *testing.T) {
	require.NoError(t, domain.ValidateMaxLength(strings.Repeat("a", domain.MaxClassNameLength), domain.MaxClassNameLength))
	require.NoError(t, domain.ValidateMaxLength("", domain.MaxClassNameLength))

	err := domain.ValidateMaxLength(strings.Repeat("a", domain.MaxClassNameLength+1), domain.MaxClassNameLength)
	require.ErrorIs(t, err, domain.ErrFieldTooLong)
}

// TestValidateMaxLengthCountsRunes proves the limit is counted in runes,
// not bytes, matching Postgres's length() on a UTF-8 text column: a
// multi-byte character must count as one character, not several.
func TestValidateMaxLengthCountsRunes(t *testing.T) {
	name := strings.Repeat("A", 19) + "é" // 20 runes, 21 bytes: é is two bytes in UTF-8
	require.NoError(t, domain.ValidateMaxLength(name, 20))
	require.ErrorIs(t, domain.ValidateMaxLength(name, 19), domain.ErrFieldTooLong)
}
