package service

import (
	"go/ast"
	"go/parser"
	"go/token"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

// noteSinks are the helpers whose last argument becomes a workflow
// event's note.
var noteSinks = map[string]bool{"rejectInstance": true, "cancelInstance": true}

// TestEveryLiteralEventNoteIsASystemNote reads this package's source and
// checks that each string literal written as a workflow event note (a
// Note/note field, or the reason passed to rejectInstance/cancelInstance)
// is one of domain.SystemNotes. The API flags those notes as system_note
// and the web hides them, so a new log label left out of the list would
// reach students and staff as a reviewer's "Catatan".
func TestEveryLiteralEventNoteIsASystemNote(t *testing.T) {
	files, err := filepath.Glob("*.go")
	require.NoError(t, err)

	fset := token.NewFileSet()
	var unflagged []string
	for _, name := range files {
		if strings.HasSuffix(name, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fset, name, nil, 0)
		require.NoError(t, err)
		ast.Inspect(file, func(n ast.Node) bool {
			var value ast.Expr
			switch node := n.(type) {
			case *ast.KeyValueExpr:
				if key, ok := node.Key.(*ast.Ident); ok && (key.Name == "Note" || key.Name == "note") {
					value = node.Value
				}
			case *ast.CallExpr:
				if sel, ok := node.Fun.(*ast.SelectorExpr); ok && noteSinks[sel.Sel.Name] && len(node.Args) > 0 {
					value = node.Args[len(node.Args)-1]
				}
			}
			lit, ok := value.(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return true
			}
			text, err := strconv.Unquote(lit.Value)
			require.NoError(t, err)
			if !domain.IsSystemNote(text) {
				unflagged = append(unflagged, fset.Position(lit.Pos()).String()+": "+lit.Value)
			}
			return true
		})
	}
	require.Empty(t, unflagged, "literal event notes must be domain.SystemNotes constants")
}

func TestSystemNotesAreFlagged(t *testing.T) {
	for _, note := range domain.SystemNotes {
		require.True(t, domain.Event{Note: note}.HasSystemNote(), note)
	}
	require.False(t, domain.Event{Note: "Tanggal 26 November ada ulangan."}.HasSystemNote())
	require.False(t, domain.Event{Note: staffRecordNote}.HasSystemNote())
}
