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

func TestValidateHTML(t *testing.T) {
	valid := map[string]string{
		"plain variables":                   "<p>{{.student_name}}</p>",
		"range over a list":                 "{{range .violations}}<tr><td>{{.date}}</td></tr>{{end}}",
		"nested field of a missing value":   "<p>{{.student.name}}</p>",
		"function on a missing value":       "<p>{{len .violations}}</p>",
		"variable inside an attribute":      `<a href="{{.verify_url}}">{{.letter_number}}</a>`,
		"empty body":                        "",
		"conditional with matching endings": "{{if .nis}}<p>{{.nis}}</p>{{end}}",
	}
	for name, body := range valid {
		t.Run("accepts "+name, func(t *testing.T) {
			require.NoError(t, ValidateHTML(body))
		})
	}

	invalid := map[string]string{
		"unclosed action":                  "<p>{{.student_name",
		"unknown function":                 "<p>{{upper .student_name}}</p>",
		"unterminated if":                  "{{if .nis}}<p>{{.nis}}</p>",
		"branches ending in other context": `{{if .x}}<a href="{{end}}`,
		"undefined nested template":        `{{template "letter"}}`,
	}
	for name, body := range invalid {
		t.Run("rejects "+name, func(t *testing.T) {
			require.Error(t, ValidateHTML(body))
		})
	}
}

// TestValidateHTMLMatchesRender pins the contract ValidateHTML exists for:
// a body it rejects is one Render fails on too.
func TestValidateHTMLMatchesRender(t *testing.T) {
	body := `{{if .x}}<a href="{{end}}`
	require.Error(t, ValidateHTML(body))
	_, err := NewHTMLPDFRenderer().Render(context.Background(), Template{Engine: EngineHTML, Body: body}, map[string]any{"x": true})
	require.Error(t, err)
}
