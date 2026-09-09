package domain

import "testing"

func TestSignPayload_DeterministicAndKeyed(t *testing.T) {
	secret := []byte("a-shared-secret")
	body := []byte(`{"event":"leave_request.issued"}`)

	sig1 := SignPayload(secret, 1700000000, body)
	sig2 := SignPayload(secret, 1700000000, body)
	if sig1 != sig2 {
		t.Fatalf("expected deterministic signature, got %q and %q", sig1, sig2)
	}

	if other := SignPayload([]byte("different-secret"), 1700000000, body); other == sig1 {
		t.Fatal("expected a different secret to produce a different signature")
	}
	if other := SignPayload(secret, 1700000001, body); other == sig1 {
		t.Fatal("expected a different timestamp to produce a different signature")
	}
	if other := SignPayload(secret, 1700000000, []byte(`{"event":"other"}`)); other == sig1 {
		t.Fatal("expected a different body to produce a different signature")
	}
}

func TestVerifySignature(t *testing.T) {
	secret := []byte("a-shared-secret")
	body := []byte(`{"event":"leave_request.issued"}`)
	sig := SignPayload(secret, 1700000000, body)

	if !VerifySignature(secret, 1700000000, body, sig) {
		t.Error("expected the recomputed signature to verify")
	}
	if VerifySignature(secret, 1700000000, body, sig+"tampered") {
		t.Error("expected a tampered signature to fail verification")
	}
	if VerifySignature([]byte("wrong-secret"), 1700000000, body, sig) {
		t.Error("expected verification with the wrong secret to fail")
	}
	if VerifySignature(secret, 1700000000, []byte("tampered body"), sig) {
		t.Error("expected verification with a tampered body to fail")
	}
}

func TestSignatureHeaderValue_CarriesTimestampAndSignature(t *testing.T) {
	secret := []byte("a-shared-secret")
	body := []byte(`{}`)
	header := SignatureHeaderValue(secret, 1700000000, body)
	want := "t=1700000000,v1=" + SignPayload(secret, 1700000000, body)
	if header != want {
		t.Errorf("SignatureHeaderValue = %q, want %q", header, want)
	}
}
