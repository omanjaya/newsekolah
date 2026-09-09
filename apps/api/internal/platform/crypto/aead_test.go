package crypto_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/platform/crypto"
)

const testSecret = "a-test-secret-of-at-least-32-bytes!!"

func TestSealAndOpenRoundTrip(t *testing.T) {
	sealer, err := crypto.NewSealer("v1", testSecret)
	require.NoError(t, err)

	sealed, err := sealer.Seal([]byte("catatan konseling"))
	require.NoError(t, err)
	require.NotContains(t, string(sealed), "catatan", "the plaintext must not survive in the ciphertext")

	opened, err := sealer.Open(sealed)
	require.NoError(t, err)
	require.Equal(t, "catatan konseling", string(opened))
}

func TestSealUsesAFreshNoncePerCall(t *testing.T) {
	sealer, err := crypto.NewSealer("v1", testSecret)
	require.NoError(t, err)

	first, err := sealer.Seal([]byte("same text"))
	require.NoError(t, err)
	second, err := sealer.Seal([]byte("same text"))
	require.NoError(t, err)
	require.NotEqual(t, first, second, "identical plaintext must not produce identical ciphertext")
}

func TestOpenRejectsTamperedOrForeignCiphertext(t *testing.T) {
	sealer, err := crypto.NewSealer("v1", testSecret)
	require.NoError(t, err)
	sealed, err := sealer.Seal([]byte("secret"))
	require.NoError(t, err)

	tampered := append([]byte(nil), sealed...)
	tampered[len(tampered)-1] ^= 0xff
	_, err = sealer.Open(tampered)
	require.ErrorIs(t, err, crypto.ErrCiphertextInvalid)

	_, err = sealer.Open([]byte("too short"))
	require.ErrorIs(t, err, crypto.ErrCiphertextInvalid)

	other, err := crypto.NewSealer("v1", "a-different-secret-of-32-plus-bytes!")
	require.NoError(t, err)
	_, err = other.Open(sealed)
	require.ErrorIs(t, err, crypto.ErrCiphertextInvalid, "a different key must not decrypt")
}

func TestNewSealerRejectsShortSecrets(t *testing.T) {
	_, err := crypto.NewSealer("v1", "too short")
	require.Error(t, err)
}
