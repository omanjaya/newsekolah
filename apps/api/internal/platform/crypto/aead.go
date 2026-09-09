// Package crypto holds the small symmetric-encryption helper used for
// fields that must stay unreadable to database operators (counseling
// notes, docs/08-security.md section 5). AES-256-GCM with a random nonce
// per value; the key id travels with the ciphertext so keys can rotate.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
)

var ErrCiphertextInvalid = errors.New("crypto: ciphertext invalid")

// Sealer encrypts and decrypts with one active key. KeyID names the key
// for storage next to the ciphertext.
type Sealer struct {
	KeyID string
	aead  cipher.AEAD
}

// NewSealer derives a 32-byte key from secret with SHA-256 so any
// sufficiently long passphrase from the environment works.
func NewSealer(keyID, secret string) (*Sealer, error) {
	if len(secret) < 32 {
		return nil, errors.New("crypto: secret must be at least 32 bytes")
	}
	sum := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return nil, fmt.Errorf("crypto: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("crypto: %w", err)
	}
	return &Sealer{KeyID: keyID, aead: aead}, nil
}

func (s *Sealer) Seal(plaintext []byte) ([]byte, error) {
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("crypto: nonce: %w", err)
	}
	return append(nonce, s.aead.Seal(nil, nonce, plaintext, nil)...), nil
}

func (s *Sealer) Open(ciphertext []byte) ([]byte, error) {
	size := s.aead.NonceSize()
	if len(ciphertext) < size {
		return nil, ErrCiphertextInvalid
	}
	out, err := s.aead.Open(nil, ciphertext[:size], ciphertext[size:], nil)
	if err != nil {
		return nil, ErrCiphertextInvalid
	}
	return out, nil
}
