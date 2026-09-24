package httpx

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"
)

// IdempotencyStore is the minimal key-value contract Idempotent needs.
// platform/auth.KVStore (Redis-backed, or the in-memory fallback) already
// satisfies this structurally; httpx does not import platform/auth so a
// lower layer never depends on a sibling platform package for no reason.
type IdempotencyStore interface {
	Get(ctx context.Context, key string) (string, bool, error)
	Set(ctx context.Context, key, value string, ttl time.Duration) error
	// SetNX sets key only when it does not already exist and reports
	// whether this call won that race -- the atomic claim Idempotent uses
	// to make sure only one concurrent retry of the same key runs fn.
	SetNX(ctx context.Context, key, value string, ttl time.Duration) (bool, error)
}

// IdempotencyTTL is how long a finished result is replayed for, per
// docs/08-security.md section 7: "Idempotency-Key untuk POST dari mobile
// ... disimpan 24 jam di Redis."
const IdempotencyTTL = 24 * time.Hour

// idempotencyLockTTL bounds how long an in-flight claim blocks a
// concurrent duplicate before it can be retried. It is short (rather than
// IdempotencyTTL) so a request that crashed mid-flight -- the handler
// process died before it could store a result -- does not wedge that key
// for a whole day; the next retry after this TTL simply claims the key
// again and runs fn from scratch.
const idempotencyLockTTL = 30 * time.Second

var (
	// ErrIdempotencyKeyReused is returned when the same Idempotency-Key
	// header is reused for a request whose body differs from the first
	// one that used it. Replaying a cached response would silently apply
	// the wrong data, so this is rejected instead.
	ErrIdempotencyKeyReused = NewError(http.StatusUnprocessableEntity, "IDEMPOTENCY_KEY_REUSED")
	// ErrIdempotencyInProgress is returned for a concurrent duplicate: a
	// request with the same key is still running when another one with
	// that key (and the same body) arrives. The caller should retry
	// shortly instead of racing the first attempt.
	ErrIdempotencyInProgress = NewError(http.StatusConflict, "IDEMPOTENCY_REQUEST_IN_PROGRESS")
)

type idempotencyState string

const (
	idempotencyInProgress idempotencyState = "in_progress"
	idempotencyDone       idempotencyState = "done"
)

// idempotencyRecord is what Idempotent stores under a key: either a claim
// marker (while fn is still running) or the finished response to replay.
type idempotencyRecord struct {
	State       idempotencyState `json:"state"`
	RequestHash string           `json:"request_hash"`
	Status      int              `json:"status,omitempty"`
	Header      http.Header      `json:"header,omitempty"`
	Body        []byte           `json:"body,omitempty"`
}

// IdempotencyKey derives the store key for one idempotent call. scope must
// already identify the tenant, the caller, and the operation (method and
// route) -- two different callers, or the same caller on two different
// operations, must never be able to collide on the same client-supplied
// header value. headerValue is the raw Idempotency-Key header; an empty
// one makes Idempotent a no-op (see below). The scope and header are
// hashed together so the resulting key has a bounded, safe length
// regardless of what the client sends.
func IdempotencyKey(scope, headerValue string) string {
	if headerValue == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(scope + "\x00" + headerValue))
	return "idempotency:" + hex.EncodeToString(sum[:])
}

// HashRequestBody fingerprints a request payload so a reused key can be
// checked against the body it was first used with.
func HashRequestBody(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

// responseRecorder buffers a handler's status, headers and body so
// Idempotent can cache them before they reach the real ResponseWriter.
// net/http/httptest exists for tests, not production code, so this keeps
// its own minimal writer instead of importing it.
type responseRecorder struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func newResponseRecorder() *responseRecorder {
	return &responseRecorder{header: make(http.Header), status: http.StatusOK}
}

func (r *responseRecorder) Header() http.Header         { return r.header }
func (r *responseRecorder) Write(b []byte) (int, error) { return r.body.Write(b) }
func (r *responseRecorder) WriteHeader(status int)      { r.status = status }

func writeResponse(rw http.ResponseWriter, status int, header http.Header, body []byte) {
	dst := rw.Header()
	for k, vv := range header {
		for _, v := range vv {
			dst.Add(k, v)
		}
	}
	if status == 0 {
		status = http.StatusOK
	}
	rw.WriteHeader(status)
	_, _ = rw.Write(body)
}

// Idempotent makes fn safe to retry under the same key: the first call
// runs fn and caches the status/headers/body it wrote to rw; any later
// call with the same key, before IdempotencyTTL expires, replays that
// cached response onto rw instead of running fn again. A concurrent
// duplicate (fn from the first call still running) is rejected with
// ErrIdempotencyInProgress rather than queued, and a reused key whose
// requestBody differs from the one first paired with it is rejected with
// ErrIdempotencyKeyReused rather than ever replaying the wrong response.
//
// key must already be scoped (see IdempotencyKey) or empty. An empty key,
// or a nil store (Redis not configured and no fallback wired), makes this
// a pass-through: fn runs directly against rw, unmemoized.
func Idempotent(ctx context.Context, store IdempotencyStore, key string, requestBody []byte, rw http.ResponseWriter, fn func(http.ResponseWriter) error) error {
	if key == "" || store == nil {
		return fn(rw)
	}

	requestHash := HashRequestBody(requestBody)

	if replayed, err := idempotencyReplay(ctx, store, key, requestHash, rw); err != nil {
		return err
	} else if replayed {
		return nil
	}

	claim, err := json.Marshal(idempotencyRecord{State: idempotencyInProgress, RequestHash: requestHash})
	if err != nil {
		return Internal(err)
	}
	acquired, err := store.SetNX(ctx, key, string(claim), idempotencyLockTTL)
	if err != nil {
		return Internal(err)
	}
	if !acquired {
		// Lost the race: another goroutine/instance holds this key. It
		// may have just finished (replay its result) or may still be
		// working (reject; the client retries).
		if replayed, err := idempotencyReplay(ctx, store, key, requestHash, rw); err != nil {
			return err
		} else if replayed {
			return nil
		}
		return ErrIdempotencyInProgress
	}

	rec := newResponseRecorder()
	if err := fn(rec); err != nil {
		// Leave the claim in place: it just expires after
		// idempotencyLockTTL, so a retry can claim the key again and run
		// fn fresh rather than replaying a failed attempt forever.
		return err
	}

	result, err := json.Marshal(idempotencyRecord{
		State:       idempotencyDone,
		RequestHash: requestHash,
		Status:      rec.status,
		Header:      rec.header,
		Body:        rec.body.Bytes(),
	})
	if err == nil {
		_ = store.Set(ctx, key, string(result), IdempotencyTTL)
	}

	writeResponse(rw, rec.status, rec.header, rec.body.Bytes())
	return nil
}

// idempotencyReplay looks up key and, when a matching record is stored,
// writes it onto rw and reports true. It reports an error (never (true,
// err)) for a stored-but-unusable record: a body mismatch or a still
// in-flight claim.
func idempotencyReplay(ctx context.Context, store IdempotencyStore, key, requestHash string, rw http.ResponseWriter) (bool, error) {
	cached, ok, err := store.Get(ctx, key)
	if err != nil {
		return false, Internal(err)
	}
	if !ok {
		return false, nil
	}

	var rec idempotencyRecord
	if err := json.Unmarshal([]byte(cached), &rec); err != nil {
		// A corrupt or foreign value in this slot: don't risk replaying
		// garbage or silently re-running fn against it.
		return false, Internal(err)
	}
	if rec.RequestHash != requestHash {
		return false, ErrIdempotencyKeyReused
	}
	if rec.State != idempotencyDone {
		return false, ErrIdempotencyInProgress
	}

	writeResponse(rw, rec.Status, rec.Header, rec.Body)
	return true, nil
}
