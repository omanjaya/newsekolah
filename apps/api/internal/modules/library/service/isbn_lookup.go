package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/library/domain"
)

// externalHTTPClient is shared across every outbound ISBN-lookup and
// cover-download request; a 12s timeout matches the old app's
// libraryExternalHTTPClient.
var externalHTTPClient = &http.Client{Timeout: 12 * time.Second}

// ISBNLookupResult is one ISBN lookup's answer: either a match (from the
// local catalogue or one of the external sources) or not found, never an
// error -- an upstream outage degrades to "not found", it never fails the
// request (old app: libraryISBNLookupResponse).
type ISBNLookupResult struct {
	Found        bool
	Source       string // "local" | "openlibrary" | "googlebooks"
	Bibliography domain.ExternalBibliography
	LocalTitleID uuid.NullUUID
}

type isbnCacheEntry struct {
	result    ISBNLookupResult
	expiresAt time.Time
}

// isbnCache is an in-memory, process-local cache: a positive match is
// worth remembering for a day (publishers rarely change ISBN metadata),
// a miss only for two minutes so a transient upstream outage does not
// "lock in" a false negative for the rest of the day (old app:
// libraryISBNCache, 24h positive / 2m negative).
type isbnCache struct {
	mu      sync.Mutex
	entries map[string]isbnCacheEntry
}

func newISBNCache() *isbnCache { return &isbnCache{entries: make(map[string]isbnCacheEntry)} }

func (c *isbnCache) get(isbn string) (ISBNLookupResult, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[isbn]
	if !ok || time.Now().After(entry.expiresAt) {
		return ISBNLookupResult{}, false
	}
	return entry.result, true
}

const (
	isbnCachePositiveTTL = 24 * time.Hour
	isbnCacheNegativeTTL = 2 * time.Minute
)

func (c *isbnCache) set(isbn string, result ISBNLookupResult) {
	ttl := isbnCachePositiveTTL
	if !result.Found {
		ttl = isbnCacheNegativeTTL
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[isbn] = isbnCacheEntry{result: result, expiresAt: time.Now().Add(ttl)}
}

// LookupISBN resolves isbn against the local catalogue first, then Open
// Library, then Google Books, caching whichever answer it lands on. It
// never returns a network error to the caller: an upstream that is down
// or times out is treated the same as a source with no match (old app:
// GET /bibliographies/isbn-lookup).
func (s *Service) LookupISBN(ctx context.Context, tenantID uuid.UUID, isbn string) (ISBNLookupResult, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return ISBNLookupResult{}, err
	}
	normalized := domain.NormalizeISBN(isbn)
	if normalized == "" {
		return ISBNLookupResult{}, domain.ErrInvalidInput
	}

	if cached, ok := s.isbnCache.get(normalized); ok {
		return cached, nil
	}

	var title domain.Title
	var foundLocal bool
	err := s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var err error
		title, foundLocal, err = s.repo.GetTitleByISBN(ctx, tenantID, normalized)
		return err
	})
	if err == nil && foundLocal {
		result := ISBNLookupResult{
			Found: true, Source: "local", LocalTitleID: uuid.NullUUID{UUID: title.ID, Valid: true},
			Bibliography: domain.ExternalBibliography{
				Title: title.Title, Subtitle: title.Subtitle, MainAuthor: title.Author, AdditionalAuthors: title.AdditionalAuthors,
				Publisher: title.Publisher, PublishPlace: title.PublishPlace, PublishYear: title.PublishYear, Pages: title.Pages,
				ISBN: title.ISBN, Subjects: title.Subjects, Language: title.Language, Abstract: title.Abstract,
			},
		}
		s.isbnCache.set(normalized, result)
		return result, nil
	}

	if bib, ok := fetchOpenLibrary(ctx, normalized); ok {
		result := ISBNLookupResult{Found: true, Source: "openlibrary", Bibliography: bib}
		s.isbnCache.set(normalized, result)
		return result, nil
	}
	if bib, ok := fetchGoogleBooks(ctx, normalized); ok {
		result := ISBNLookupResult{Found: true, Source: "googlebooks", Bibliography: bib}
		s.isbnCache.set(normalized, result)
		return result, nil
	}

	notFound := ISBNLookupResult{Found: false}
	s.isbnCache.set(normalized, notFound)
	return notFound, nil
}

// fetchURL fetches rawURL with a 12s timeout and a 2MB response cap,
// returning ok=false on any failure -- nothing here ever panics or
// bubbles an error up to LookupISBN.
func fetchURL(ctx context.Context, rawURL string) ([]byte, bool) {
	fetchCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(fetchCtx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, false
	}
	req.Header.Set("User-Agent", "newsekolah-library/1.0")
	req.Header.Set("Accept", "application/json")
	resp, err := externalHTTPClient.Do(req)
	if err != nil {
		return nil, false
	}
	defer resp.Body.Close() //nolint:errcheck // response body close error carries no recovery action here
	if resp.StatusCode != http.StatusOK {
		return nil, false
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, false
	}
	return data, true
}

func fetchOpenLibrary(ctx context.Context, isbn string) (domain.ExternalBibliography, bool) {
	data, ok := fetchURL(ctx, "https://openlibrary.org/api/books?bibkeys=ISBN:"+url.QueryEscape(isbn)+"&format=json&jscmd=data")
	if !ok {
		return domain.ExternalBibliography{}, false
	}
	bib, ok := domain.MapOpenLibraryJSON(data, isbn)
	if !ok {
		return domain.ExternalBibliography{}, false
	}
	if bib.ISBN == "" {
		bib.ISBN = isbn
	}
	return bib, true
}

func fetchGoogleBooks(ctx context.Context, isbn string) (domain.ExternalBibliography, bool) {
	data, ok := fetchURL(ctx, "https://www.googleapis.com/books/v1/volumes?q=isbn:"+url.QueryEscape(isbn))
	if !ok {
		return domain.ExternalBibliography{}, false
	}
	bib, ok := domain.MapGoogleBooksJSON(data)
	if !ok {
		return domain.ExternalBibliography{}, false
	}
	if bib.ISBN == "" {
		bib.ISBN = isbn
	}
	return bib, true
}

const (
	coverMaxBytes = 3 << 20 // 3 MB
)

// downloadExternalImage fetches rawURL (http/https only) and returns its
// bytes, capped at 3MB, without interpreting content beyond the size
// limit -- callers decide whether the bytes are actually an image.
func downloadExternalImage(ctx context.Context, rawURL string) ([]byte, error) {
	trimmed := strings.TrimSpace(rawURL)
	parsed, err := url.Parse(trimmed)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return nil, domain.ErrInvalidInput
	}
	fetchCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(fetchCtx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "newsekolah-library/1.0")
	resp, err := externalHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download cover: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck // response body close error carries no recovery action here
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download cover: upstream returned status %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, coverMaxBytes+1))
	if err != nil {
		return nil, fmt.Errorf("download cover: %w", err)
	}
	if len(data) > coverMaxBytes {
		return nil, domain.ErrCoverTooLarge
	}
	return data, nil
}

// sniffCoverMime identifies data as jpeg/png/webp by magic bytes (never by
// a server-supplied Content-Type header, which a misconfigured host can
// get wrong), returning "" when it is none of those.
func sniffCoverMime(data []byte) string {
	switch {
	case len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF:
		return "image/jpeg"
	case len(data) >= 8 && bytes.Equal(data[:8], []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}):
		return "image/png"
	case len(data) >= 12 && bytes.Equal(data[0:4], []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WEBP")):
		return "image/webp"
	default:
		return ""
	}
}

// coverExtensionFor maps a sniffed cover MIME to the object-key extension
// downloadCoverFromURL stores it under.
func coverExtensionFor(mime string) string {
	switch mime {
	case "image/jpeg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/webp":
		return "webp"
	default:
		return "bin"
	}
}

// DownloadCoverFromURL fetches an external cover image, validates it
// (http/https, <=3MB, jpeg/png/webp by magic bytes), and stores it through
// the same assets pipeline the module already accepts a cover_asset_id
// from -- so a caller wires the returned asset ID straight into a title
// create/update as cover_asset_id.
func (s *Service) DownloadCoverFromURL(ctx context.Context, tenantID, actorUserID uuid.UUID, rawURL string) (uuid.UUID, error) {
	if err := s.requireEnabled(ctx, tenantID); err != nil {
		return uuid.Nil, err
	}
	if s.storage == nil {
		return uuid.Nil, domain.ErrStorageUnavailable
	}
	data, err := downloadExternalImage(ctx, rawURL)
	if err != nil {
		return uuid.Nil, err
	}
	mime := sniffCoverMime(data)
	if mime == "" {
		return uuid.Nil, domain.ErrCoverInvalidType
	}
	objectKey := fmt.Sprintf("tenants/%s/library/covers/%s.%s", tenantID, uuid.New(), coverExtensionFor(mime))
	if err := s.storage.PutObject(ctx, objectKey, data, mime); err != nil {
		return uuid.Nil, fmt.Errorf("store cover: %w", err)
	}
	sum := sha256.Sum256(data)
	var assetID uuid.UUID
	err = s.withTx(ctx, tenantID, func(ctx context.Context) error {
		var txErr error
		assetID, txErr = s.repo.CreateAsset(ctx, tenantID, s.storageBucket, objectKey, mime, int64(len(data)), hex.EncodeToString(sum[:]), "cover", "tenant_public", actorUserID)
		return txErr
	})
	if err != nil {
		return uuid.Nil, fmt.Errorf("record cover asset: %w", err)
	}
	return assetID, nil
}
