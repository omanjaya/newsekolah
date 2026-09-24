package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"

	"github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// idempotentOperations lists the operationIds (as api.StrictMiddlewareFunc
// receives them -- see authzStrictMiddleware's doc comment) where a
// duplicate POST/PUT, retried by a client on a bad mobile network, would
// double-submit money or a record: billing payments, leave/exit/late-
// arrival workflow starts, the mobile attendance save, library circulation,
// and visitor check-in. Read-only and idempotent-by-nature operations
// (list/get, or ones already built as an upsert, like openAttendanceSession)
// are deliberately left out.
var idempotentOperations = map[string]bool{
	"RecordPayment":            true,
	"VoidPayment":              true,
	"SubmitLeaveRequest":       true,
	"CreateExitPermit":         true,
	"OpenLateArrival":          true,
	"RecordLateArrivalByStaff": true,
	"SaveAttendanceEntries":    true,
	"BorrowLibraryLoan":        true,
	"ReturnLibraryLoan":        true,
	"BatchBorrowLibraryLoans":  true,
	"CheckInVisit":             true,
}

// idempotencyStrictMiddleware adapts httpx.Idempotent to oapi-codegen's
// StrictMiddlewareFunc, the same seam authzStrictMiddleware uses. It must
// be listed before authzStrictMiddleware in NewStrictHandlerWithOptions so
// authorization runs first (an unauthorized retry should never claim or
// consume an Idempotency-Key), and it only acts on idempotentOperations --
// every other operation passes straight through untouched.
//
// The request used to fingerprint the body is request itself (the parsed,
// typed RequestObject oapi-codegen built), not the raw bytes off the wire:
// it already captures path/query params plus the JSON body in one
// deterministic struct, and the raw io.Reader has been consumed by the
// time a strict middleware runs anyway.
func idempotencyStrictMiddleware(store httpx.IdempotencyStore) api.StrictMiddlewareFunc {
	return func(f api.StrictHandlerFunc, operationID string) api.StrictHandlerFunc {
		if !idempotentOperations[operationID] {
			return f
		}
		return func(ctx context.Context, w http.ResponseWriter, r *http.Request, request any) (any, error) {
			headerValue := r.Header.Get("Idempotency-Key")
			if headerValue == "" {
				return f(ctx, w, r, request)
			}

			tenantID, _ := httpx.TenantIDFromContext(ctx)
			userID, _ := httpx.UserIDFromContext(ctx)
			scope := fmt.Sprintf("%s|%s|%s|%s", tenantID, userID, r.Method, operationID)
			key := httpx.IdempotencyKey(scope, headerValue)

			requestBody, err := json.Marshal(request)
			if err != nil {
				return nil, httpx.Internal(err)
			}

			err = httpx.Idempotent(ctx, store, key, requestBody, w, func(rw http.ResponseWriter) error {
				response, err := f(ctx, rw, r, request)
				if err != nil {
					return err
				}
				return visitStrictResponse(rw, operationID, response)
			})
			// Idempotent already wrote the response (fresh or replayed) or
			// the error case leaves nothing written; either way the
			// generated ServeHTTP wrapper must not visit response again,
			// so this always returns a nil response.
			return nil, err
		}
	}
}

// visitStrictResponse renders response the same way the generated
// ServeHTTP wrapper would: by calling its Visit<OperationId>Response
// method. Every api.XxxResponseObject implements a method by exactly that
// name (oapi-codegen's own convention), but each one has a different
// method name, so nothing in this package can call it without either
// generating per-operation glue or, as here, looking it up once by the
// operationId the middleware chain already carries.
func visitStrictResponse(w http.ResponseWriter, operationID string, response any) error {
	if response == nil {
		return nil
	}
	method := reflect.ValueOf(response).MethodByName("Visit" + operationID + "Response")
	if !method.IsValid() {
		return fmt.Errorf("idempotency: %T has no Visit%sResponse method", response, operationID)
	}
	out := method.Call([]reflect.Value{reflect.ValueOf(w)})
	if len(out) != 1 || out[0].IsNil() {
		return nil
	}
	err, _ := out[0].Interface().(error)
	return err
}
