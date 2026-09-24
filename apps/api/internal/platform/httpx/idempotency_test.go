package httpx

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// fakeIdempotencyStore is a minimal, mutex-protected implementation of
// IdempotencyStore, standing in for auth.RedisStore/auth.MemoryStore so
// this package's tests don't need to depend on platform/auth.
type fakeIdempotencyStore struct {
	mu      sync.Mutex
	entries map[string]string

	// getErr/setNXErr, when set, are returned by the next call instead of
	// the normal behaviour, to exercise the "store misbehaved" paths.
	getErr   error
	setNXErr error
}

func newFakeIdempotencyStore() *fakeIdempotencyStore {
	return &fakeIdempotencyStore{entries: make(map[string]string)}
}

func (s *fakeIdempotencyStore) Get(_ context.Context, key string) (string, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.getErr != nil {
		return "", false, s.getErr
	}
	v, ok := s.entries[key]
	return v, ok, nil
}

func (s *fakeIdempotencyStore) Set(_ context.Context, key, value string, _ time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries[key] = value
	return nil
}

func (s *fakeIdempotencyStore) SetNX(_ context.Context, key, value string, _ time.Duration) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.setNXErr != nil {
		return false, s.setNXErr
	}
	if _, ok := s.entries[key]; ok {
		return false, nil
	}
	s.entries[key] = value
	return true, nil
}

func (s *fakeIdempotencyStore) del(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.entries, key)
}

func runOK(t *testing.T, ctx context.Context, store IdempotencyStore, key string, body []byte, fnCalls *int32) (*httptest.ResponseRecorder, error) {
	t.Helper()
	rw := httptest.NewRecorder()
	err := Idempotent(ctx, store, key, body, rw, func(inner http.ResponseWriter) error {
		if fnCalls != nil {
			atomic.AddInt32(fnCalls, 1)
		}
		inner.Header().Set("X-Test", "yes")
		inner.WriteHeader(http.StatusCreated)
		_, _ = inner.Write([]byte(`{"ok":true}`))
		return nil
	})
	return rw, err
}

func TestIdempotent_EmptyKeyAlwaysRunsFn(t *testing.T) {
	store := newFakeIdempotencyStore()
	var calls int32
	body := []byte(`{"a":1}`)

	for i := 0; i < 3; i++ {
		if _, err := runOK(t, context.Background(), store, "", body, &calls); err != nil {
			t.Fatalf("call %d: unexpected error: %v", i, err)
		}
	}
	if calls != 3 {
		t.Fatalf("fn calls = %d, want 3 (no key means no dedup)", calls)
	}
}

func TestIdempotent_NilStoreAlwaysRunsFn(t *testing.T) {
	var calls int32
	body := []byte(`{"a":1}`)

	for i := 0; i < 3; i++ {
		if _, err := runOK(t, context.Background(), nil, "some-key", body, &calls); err != nil {
			t.Fatalf("call %d: unexpected error: %v", i, err)
		}
	}
	if calls != 3 {
		t.Fatalf("fn calls = %d, want 3 (nil store means no dedup)", calls)
	}
}

func TestIdempotent_SecondCallReplaysCachedResponse(t *testing.T) {
	store := newFakeIdempotencyStore()
	ctx := context.Background()
	key := IdempotencyKey("tenant|user|POST|RecordPayment", "abc-123")
	body := []byte(`{"amount_minor":50000}`)
	var calls int32

	first, err := runOK(t, ctx, store, key, body, &calls)
	if err != nil {
		t.Fatalf("first call: unexpected error: %v", err)
	}
	second, err := runOK(t, ctx, store, key, body, &calls)
	if err != nil {
		t.Fatalf("second call: unexpected error: %v", err)
	}

	if calls != 1 {
		t.Fatalf("fn calls = %d, want 1 (second call should replay)", calls)
	}
	if second.Code != first.Code || second.Code != http.StatusCreated {
		t.Fatalf("replayed status = %d, want %d", second.Code, http.StatusCreated)
	}
	if second.Body.String() != first.Body.String() {
		t.Fatalf("replayed body = %q, want %q", second.Body.String(), first.Body.String())
	}
	if second.Header().Get("X-Test") != "yes" {
		t.Fatalf("replayed response missing header carried from the first response")
	}
}

func TestIdempotent_ReusedKeyDifferentBodyRejected(t *testing.T) {
	store := newFakeIdempotencyStore()
	ctx := context.Background()
	key := IdempotencyKey("tenant|user|POST|RecordPayment", "abc-123")
	var calls int32

	if _, err := runOK(t, ctx, store, key, []byte(`{"amount_minor":50000}`), &calls); err != nil {
		t.Fatalf("first call: unexpected error: %v", err)
	}
	_, err := runOK(t, ctx, store, key, []byte(`{"amount_minor":99999}`), &calls)
	if !errors.Is(err, ErrIdempotencyKeyReused) {
		t.Fatalf("second call err = %v, want ErrIdempotencyKeyReused", err)
	}
	if calls != 1 {
		t.Fatalf("fn calls = %d, want 1 (mismatched body must not re-run fn)", calls)
	}
	var appErr *Error
	if !errors.As(err, &appErr) || appErr.Status != http.StatusUnprocessableEntity {
		t.Fatalf("ErrIdempotencyKeyReused status = %+v, want 422", appErr)
	}
}

func TestIdempotent_ClaimStillInProgressRejectsConcurrentDuplicate(t *testing.T) {
	store := newFakeIdempotencyStore()
	ctx := context.Background()
	key := IdempotencyKey("tenant|user|POST|RecordPayment", "abc-123")
	body := []byte(`{"amount_minor":50000}`)

	// Seed the store as another in-flight caller would: a claim marker for
	// the same key and the same request body, not yet resolved to "done".
	claim := fmt.Sprintf(`{"state":"in_progress","request_hash":%q}`, HashRequestBody(body))
	if err := store.Set(ctx, key, claim, IdempotencyTTL); err != nil {
		t.Fatalf("seed claim: %v", err)
	}

	var calls int32
	_, err := runOK(t, ctx, store, key, body, &calls)
	if !errors.Is(err, ErrIdempotencyInProgress) {
		t.Fatalf("err = %v, want ErrIdempotencyInProgress", err)
	}
	if calls != 0 {
		t.Fatalf("fn calls = %d, want 0 (must not run fn while another attempt is in flight)", calls)
	}
	var appErr *Error
	if !errors.As(err, &appErr) || appErr.Status != http.StatusConflict {
		t.Fatalf("ErrIdempotencyInProgress status = %+v, want 409", appErr)
	}
}

func TestIdempotent_FailedFnIsNotCached(t *testing.T) {
	store := newFakeIdempotencyStore()
	ctx := context.Background()
	key := IdempotencyKey("tenant|user|POST|RecordPayment", "abc-123")
	body := []byte(`{"amount_minor":50000}`)
	boom := errors.New("boom")

	rw := httptest.NewRecorder()
	err := Idempotent(ctx, store, key, body, rw, func(http.ResponseWriter) error {
		return boom
	})
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want boom", err)
	}

	// The claim marker is left behind (it just expires on its own TTL), so
	// a retry right away still sees "in progress" rather than silently
	// succeeding against a half-finished attempt.
	var calls int32
	_, err = runOK(t, ctx, store, key, body, &calls)
	if !errors.Is(err, ErrIdempotencyInProgress) {
		t.Fatalf("retry err = %v, want ErrIdempotencyInProgress", err)
	}

	// Once the claim expires (simulated here by deleting it, since the
	// fake store doesn't honor TTL passively), a retry runs fn fresh.
	store.del(key)
	if _, err := runOK(t, ctx, store, key, body, &calls); err != nil {
		t.Fatalf("retry after expiry: unexpected error: %v", err)
	}
	if calls != 1 {
		t.Fatalf("fn calls after expiry = %d, want 1", calls)
	}
}

func TestIdempotent_StoreGetErrorSurfaces(t *testing.T) {
	store := newFakeIdempotencyStore()
	store.getErr = errors.New("redis down")
	ctx := context.Background()

	var calls int32
	_, err := runOK(t, ctx, store, "some-key", []byte("body"), &calls)
	if err == nil {
		t.Fatal("want an error when the store's Get fails")
	}
	if calls != 0 {
		t.Fatalf("fn calls = %d, want 0 (a store error must not risk a duplicate run)", calls)
	}
}

func TestIdempotent_ConcurrentDuplicatesRunFnExactlyOnce(t *testing.T) {
	store := newFakeIdempotencyStore()
	ctx := context.Background()
	key := IdempotencyKey("tenant|user|POST|RecordPayment", "race-key")
	body := []byte(`{"amount_minor":1}`)

	const n = 20
	var calls int32
	var successes, rejections int32
	start := make(chan struct{})
	var wg sync.WaitGroup

	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			rw := httptest.NewRecorder()
			err := Idempotent(ctx, store, key, body, rw, func(inner http.ResponseWriter) error {
				atomic.AddInt32(&calls, 1)
				time.Sleep(10 * time.Millisecond) // widen the window so goroutines actually overlap
				inner.WriteHeader(http.StatusCreated)
				_, _ = inner.Write([]byte(`{"ok":true}`))
				return nil
			})
			switch {
			case err == nil:
				atomic.AddInt32(&successes, 1)
			case errors.Is(err, ErrIdempotencyInProgress):
				atomic.AddInt32(&rejections, 1)
			default:
				t.Errorf("unexpected error: %v", err)
			}
		}()
	}
	close(start)
	wg.Wait()

	if calls != 1 {
		t.Fatalf("fn calls = %d, want exactly 1 across %d concurrent duplicates", calls, n)
	}
	if successes < 1 {
		t.Fatalf("successes = %d, want at least 1 (the winner, replayed or not)", successes)
	}
	if successes+rejections != n {
		t.Fatalf("successes(%d)+rejections(%d) != %d", successes, rejections, n)
	}
}

func TestIdempotencyKey(t *testing.T) {
	if got := IdempotencyKey("scope", ""); got != "" {
		t.Fatalf("IdempotencyKey with empty header = %q, want empty (pass-through)", got)
	}

	a := IdempotencyKey("tenant-a|user-1|POST|RecordPayment", "same-header")
	b := IdempotencyKey("tenant-b|user-1|POST|RecordPayment", "same-header")
	if a == b {
		t.Fatal("different scopes with the same header value must not collide")
	}

	c := IdempotencyKey("tenant-a|user-1|POST|RecordPayment", "same-header")
	if a != c {
		t.Fatal("the same scope and header value must derive the same key")
	}
}

func TestHashRequestBody(t *testing.T) {
	if HashRequestBody([]byte("a")) == HashRequestBody([]byte("b")) {
		t.Fatal("different bodies must hash differently")
	}
	if HashRequestBody([]byte("a")) != HashRequestBody([]byte("a")) {
		t.Fatal("the same body must hash the same way")
	}
}
