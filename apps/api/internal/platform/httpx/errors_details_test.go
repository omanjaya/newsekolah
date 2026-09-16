package httpx

import "testing"

// The package-level sentinels are shared by every module, and several error
// maps are built at init time, so WithDetails must never write through to the
// value it was called on.
func TestWithDetailsLeavesTheSentinelAlone(t *testing.T) {
	first := ErrValidation.WithDetails(ErrorDetail{Field: "user_id", Code: "NOT_TEACHER_OR_STAFF"})
	second := ErrValidation.WithDetails(ErrorDetail{Field: "name", Code: "REQUIRED"})

	if len(ErrValidation.Details) != 0 {
		t.Fatalf("the shared sentinel picked up details: %+v", ErrValidation.Details)
	}
	if first.Details[0].Field != "user_id" {
		t.Fatalf("the first error lost its own details: %+v", first.Details)
	}
	if second.Details[0].Field != "name" {
		t.Fatalf("the second error lost its own details: %+v", second.Details)
	}
	if first.Code != ErrValidation.Code || first.Status != ErrValidation.Status {
		t.Fatalf("the copy changed code or status: %d %s", first.Status, first.Code)
	}
}
