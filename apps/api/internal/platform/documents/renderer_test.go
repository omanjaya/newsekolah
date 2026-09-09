package documents

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestHTMLPDFRendererRender(t *testing.T) {
	r := NewHTMLPDFRenderer()
	tmpl := Template{
		Engine: EngineHTML,
		Body:   "<p>Surat Izin untuk {{.StudentName}}</p><p>Kelas: {{.ClassName}}</p>",
	}
	vars := map[string]any{"StudentName": "Budi Santoso", "ClassName": "X IPA 1"}

	out, err := r.Render(context.Background(), tmpl, vars)
	require.NoError(t, err)
	require.Contains(t, string(out.HTML), "Budi Santoso")
	require.Contains(t, string(out.HTML), "X IPA 1")
	require.NotEmpty(t, out.PDF)
	// %PDF is the magic header of every well-formed PDF file.
	require.Equal(t, "%PDF", string(out.PDF[:4]))
}

func TestHTMLPDFRendererEscapesVariables(t *testing.T) {
	r := NewHTMLPDFRenderer()
	tmpl := Template{Engine: EngineHTML, Body: "<p>{{.Reason}}</p>"}

	out, err := r.Render(context.Background(), tmpl, map[string]any{"Reason": "<script>alert(1)</script>"})
	require.NoError(t, err)
	require.NotContains(t, string(out.HTML), "<script>")
}

func TestHTMLPDFRendererRejectsDocxEngine(t *testing.T) {
	r := NewHTMLPDFRenderer()
	_, err := r.Render(context.Background(), Template{Engine: "docx", Body: "x"}, nil)
	require.Error(t, err)
}
