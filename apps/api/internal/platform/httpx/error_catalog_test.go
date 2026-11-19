package httpx

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
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

// internalErrorCodes are codes that signal a server-side wiring gap rather
// than anything the user did or can change, so the client deliberately
// shows them as the generic "something went wrong" (errors.UNKNOWN).
var internalErrorCodes = map[string]bool{
	// An operation with no x-permission declaration (platform/authz):
	// a deploy bug, never a state the user can fix.
	"AUTHZ_NOT_CONFIGURED": true,
	// A stub handler (attendance) for an endpoint not built yet.
	"NOT_IMPLEMENTED": true,
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
// code the API declares (see declaredErrorCodes) must have an
// entry in both locales of the shared catalog, be listed in
// featureMessageCodes with a feature-level message, or be listed in
// internalErrorCodes as deliberately generic.
func TestEveryErrorCodeHasAClientMessage(t *testing.T) {
	codes := declaredErrorCodes(t)
	if len(codes) == 0 {
		t.Fatal("found no NewError/WrapError codes; the parser no longer matches the API source")
	}

	shared := make([]map[string]any, len(sharedCatalogs))
	for i, file := range sharedCatalogs {
		shared[i] = messageObject(t, file, []string{"errors"})
	}

	var missing []string
	for _, code := range codes {
		if internalErrorCodes[code] {
			continue
		}
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
	for code := range internalErrorCodes {
		if !declared[code] {
			t.Errorf("internalErrorCodes lists %s, which the API no longer declares", code)
		}
		if _, ok := shared[0][code]; ok {
			t.Errorf("internalErrorCodes lists %s, which the shared catalog covers", code)
		}
	}
	for code := range featureMessageCodes {
		if !declared[code] {
			t.Errorf("featureMessageCodes lists %s, which the API no longer declares", code)
		}
		if _, ok := shared[0][code]; ok {
			t.Errorf("featureMessageCodes lists %s, which the shared catalog already covers", code)
		}
	}
}

// apiRoot is the Go module root (apps/api) as seen from this package.
const apiRoot = "../../.."

// declaredErrorCodes returns every code literal the API declares, sorted
// and deduplicated: the code argument of NewError and WrapError, called
// bare inside this package or as httpx.NewError / httpx.WrapError from
// any other package, plus the code column of a sentinel-to-code table (a
// slice of anonymous structs with a `code string` field, as academic's
// conflictErrs) in a file that imports httpx. It walks every non-test file under apps/api except the
// generated code in internal/gen.
func declaredErrorCodes(t *testing.T) []string {
	t.Helper()
	fset := token.NewFileSet()
	seen := map[string]bool{}
	addLiteral := func(expr ast.Expr) {
		lit, ok := expr.(*ast.BasicLit)
		if !ok || lit.Kind != token.STRING {
			return
		}
		code, err := strconv.Unquote(lit.Value)
		if err != nil {
			t.Fatalf("%s: unquote %s: %v", fset.Position(lit.Pos()), lit.Value, err)
		}
		seen[code] = true
	}
	var usesHTTPX bool
	inspect := func(node ast.Node) bool {
		switch node := node.(type) {
		case *ast.CallExpr:
			if isErrorConstructor(node.Fun) && len(node.Args) >= 2 {
				addLiteral(node.Args[1])
			}
		case *ast.CompositeLit:
			if usesHTTPX {
				for _, code := range codeTableEntries(node) {
					addLiteral(code)
				}
			}
		}
		return true
	}
	err := filepath.WalkDir(apiRoot, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			if path == filepath.Join(apiRoot, "internal", "gen") {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		parsed, err := parser.ParseFile(fset, path, nil, 0)
		if err != nil {
			return err
		}
		usesHTTPX = parsed.Name.Name == "httpx" || importsHTTPX(parsed)
		ast.Inspect(parsed, inspect)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	codes := make([]string, 0, len(seen))
	for code := range seen {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	return codes
}

// importsHTTPX reports whether file imports this package, so a code table
// in it feeds API errors rather than, say, an ETL lookup.
func importsHTTPX(file *ast.File) bool {
	for _, spec := range file.Imports {
		if strings.HasSuffix(spec.Path.Value, "/platform/httpx\"") {
			return true
		}
	}
	return false
}

// isErrorConstructor reports whether fun names NewError or WrapError,
// either bare (inside this package) or through the httpx import.
func isErrorConstructor(fun ast.Expr) bool {
	var name string
	switch fun := fun.(type) {
	case *ast.Ident:
		name = fun.Name
	case *ast.SelectorExpr:
		pkg, ok := fun.X.(*ast.Ident)
		if !ok || pkg.Name != "httpx" {
			return false
		}
		name = fun.Sel.Name
	default:
		return false
	}
	return name == "NewError" || name == "WrapError"
}

// codeTableEntries returns the code expression of each row when lit is a
// slice of anonymous structs with a `code` field, and nil otherwise.
func codeTableEntries(lit *ast.CompositeLit) []ast.Expr {
	array, ok := lit.Type.(*ast.ArrayType)
	if !ok {
		return nil
	}
	row, ok := array.Elt.(*ast.StructType)
	if !ok {
		return nil
	}
	index, position := -1, 0
	for _, field := range row.Fields.List {
		for _, name := range field.Names {
			if name.Name == "code" {
				index = position
			}
			position++
		}
	}
	if index < 0 {
		return nil
	}
	var codes []ast.Expr
	for _, elt := range lit.Elts {
		entry, ok := elt.(*ast.CompositeLit)
		if !ok {
			continue
		}
		for i, value := range entry.Elts {
			if kv, ok := value.(*ast.KeyValueExpr); ok {
				if key, ok := kv.Key.(*ast.Ident); ok && key.Name == "code" {
					codes = append(codes, kv.Value)
				}
				continue
			}
			if i == index {
				codes = append(codes, value)
			}
		}
	}
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
