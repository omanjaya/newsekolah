package httpx

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// repoRoot is the monorepo root as seen from this package's directory
// (apps/api/internal/platform/httpx), where `go test` runs.
const repoRoot = "../../../../.."

// featureMessageCodes are the codes a client deliberately does not take
// from the shared errors catalog: each one is worded by a feature-level
// message map instead, and the test checks that map really has it, in
// both locales. Anything else missing from the shared catalog reaches the
// user as the generic "something went wrong" (useApiErrorMessage's and
// apiErrorMessageKey's errors.UNKNOWN fallback), which is wrong advice
// for a validation error a retry cannot fix.
var featureMessageCodes = map[string]featureCatalog{
	// apps/web/features/library/use-library-error-message.ts.
	"LIBRARY_TITLE_HAS_COPIES":        libraryErrors,
	"LIBRARY_CONTROL_NUMBER_EXISTS":   libraryErrors,
	"LIBRARY_COPY_ACCESSION_EXISTS":   libraryErrors,
	"LIBRARY_COPY_HAS_LOAN_HISTORY":   libraryErrors,
	"LIBRARY_COPY_STATUS_NOT_MANUAL":  libraryErrors,
	"LIBRARY_MASTER_DATA_NOT_FOUND":   libraryErrors,
	"LIBRARY_MASTER_DATA_CODE_EXISTS": libraryErrors,
	"LIBRARY_MASTER_DATA_IN_USE":      libraryErrors,
}

// featureCatalog is one feature's message files (per locale) and the path
// of the object holding its error messages inside them.
type featureCatalog struct {
	files []string
	path  []string
}

var libraryErrors = featureCatalog{
	files: []string{
		"apps/web/messages/features/library.id.json",
		"apps/web/messages/features/library.en.json",
	},
	path: []string{"errors"},
}

var sharedCatalogs = []string{
	"packages/i18n/messages/id.json",
	"packages/i18n/messages/en.json",
}

// TestEveryErrorCodeHasAClientMessage keeps the API's stable error codes
// and the clients' shared errors catalog (packages/i18n) in step: every
// code this package declares through NewError or WrapError must have an
// entry in both locales of the shared catalog, or be listed in
// featureMessageCodes with a feature-level message.
func TestEveryErrorCodeHasAClientMessage(t *testing.T) {
	codes := declaredErrorCodes(t)
	if len(codes) == 0 {
		t.Fatal("found no NewError/WrapError codes; the parser no longer matches this package")
	}

	shared := make([]map[string]any, len(sharedCatalogs))
	for i, file := range sharedCatalogs {
		shared[i] = messageObject(t, file, []string{"errors"})
	}

	var missing []string
	for _, code := range codes {
		if feature, ok := featureMessageCodes[code]; ok {
			for _, file := range feature.files {
				if _, ok := messageObject(t, file, feature.path)[code]; !ok {
					missing = append(missing, code+" (feature message in "+file+")")
				}
			}
			continue
		}
		for i, file := range sharedCatalogs {
			if _, ok := shared[i][code]; !ok {
				missing = append(missing, code+" ("+file+" errors)")
			}
		}
	}
	if len(missing) > 0 {
		t.Errorf("error codes with no client message (add them to the shared errors catalog):\n  %s",
			strings.Join(missing, "\n  "))
	}

	// A stale allow-list entry hides nothing today but would excuse a
	// future gap, so it fails too.
	declared := make(map[string]bool, len(codes))
	for _, code := range codes {
		declared[code] = true
	}
	for code := range featureMessageCodes {
		if !declared[code] {
			t.Errorf("featureMessageCodes lists %s, which this package no longer declares", code)
		}
		if _, ok := shared[0][code]; ok {
			t.Errorf("featureMessageCodes lists %s, which the shared catalog already covers", code)
		}
	}
}

// declaredErrorCodes returns every code literal passed to NewError or
// WrapError in this package's non-test files, sorted and deduplicated.
func declaredErrorCodes(t *testing.T) []string {
	t.Helper()
	fset := token.NewFileSet()
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		parsed, err := parser.ParseFile(fset, file, nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", file, err)
		}
		ast.Inspect(parsed, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok || len(call.Args) < 2 {
				return true
			}
			fn, ok := call.Fun.(*ast.Ident)
			if !ok || (fn.Name != "NewError" && fn.Name != "WrapError") {
				return true
			}
			lit, ok := call.Args[1].(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return true
			}
			code, err := strconv.Unquote(lit.Value)
			if err != nil {
				t.Fatalf("%s: unquote %s: %v", fset.Position(lit.Pos()), lit.Value, err)
			}
			seen[code] = true
			return true
		})
	}
	codes := make([]string, 0, len(seen))
	for code := range seen {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	return codes
}

// messageObject reads a JSON message file (relative to the repo root) and
// returns the object at path.
func messageObject(t *testing.T, file string, path []string) map[string]any {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(repoRoot, file))
	if err != nil {
		t.Fatalf("read %s: %v", file, err)
	}
	var node map[string]any
	if err := json.Unmarshal(raw, &node); err != nil {
		t.Fatalf("decode %s: %v", file, err)
	}
	for _, key := range path {
		next, ok := node[key].(map[string]any)
		if !ok {
			t.Fatalf("%s has no object at %s", file, strings.Join(path, "."))
		}
		node = next
	}
	return node
}
