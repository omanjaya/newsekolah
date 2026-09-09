package auth

import "testing"

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	if err := VerifyPassword(hash, "correct horse battery staple"); err != nil {
		t.Errorf("expected correct password to verify, got %v", err)
	}

	if err := VerifyPassword(hash, "wrong password"); err == nil {
		t.Error("expected wrong password to fail verification")
	}
}

func TestVerifyPasswordRejectsMalformedHash(t *testing.T) {
	for _, hash := range []string{"", "not-a-hash", "$argon2id$v=19$garbage"} {
		if err := VerifyPassword(hash, "anything"); err == nil {
			t.Errorf("expected malformed hash %q to fail verification", hash)
		}
	}
}

func TestVerifyAgainstDummyNeverPanics(t *testing.T) {
	VerifyAgainstDummy("some password that does not matter")
}
