package http

import (
	"errors"
	"fmt"
	"testing"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/reports/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// TestMapScheduleError_RecipientDetails proves a recipient problem reaches
// the client as a validation error naming the recipients field (and, for
// an address that is no school account, that address) instead of a bare
// VALIDATION_FAILED the form cannot act on.
func TestMapScheduleError_RecipientDetails(t *testing.T) {
	cases := []struct {
		name    string
		err     error
		code    string
		message string
	}{
		{"not a tenant user", fmt.Errorf("create: %w", domain.RecipientNotTenantUserError{Email: "kepala@contoh.sch.id"}), RecipientCodeNotTenantUser, "kepala@contoh.sch.id"},
		{"none", domain.ErrNoRecipients, RecipientCodeRequired, ""},
		{"too many", domain.ErrTooManyRecipients, RecipientCodeTooMany, ""},
		{"duplicate", domain.ErrDuplicateRecipient, RecipientCodeDuplicate, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var appErr *httpx.Error
			if !errors.As(mapScheduleError(tc.err), &appErr) {
				t.Fatalf("expected an *httpx.Error, got %v", mapScheduleError(tc.err))
			}
			if appErr.Code != httpx.ErrValidation.Code || appErr.Status != httpx.ErrValidation.Status {
				t.Fatalf("expected VALIDATION_FAILED, got %s/%d", appErr.Code, appErr.Status)
			}
			if len(appErr.Details) != 1 {
				t.Fatalf("expected one detail, got %+v", appErr.Details)
			}
			d := appErr.Details[0]
			if d.Field != "recipients" || d.Code != tc.code || d.Message != tc.message {
				t.Fatalf("unexpected detail %+v", d)
			}
		})
	}

	if !errors.Is(domain.RecipientNotTenantUserError{Email: "x@y.z"}, domain.ErrRecipientNotTenantUser) {
		t.Fatal("RecipientNotTenantUserError must match ErrRecipientNotTenantUser")
	}
}
