package domain_test

import (
	"errors"
	"testing"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/notifications/domain"
)

func TestRenderTemplate(t *testing.T) {
	tmpl := domain.WhatsAppTemplate{
		Body: "Halo {{parent_name}}, tagihan {{amount}} jatuh tempo {{due_date}}.",
	}

	got, err := domain.RenderTemplate(tmpl, map[string]string{
		"parent_name": "Bu Sari",
		"amount":      "Rp150.000",
		"due_date":    "10 Oktober 2026",
	})
	if err != nil {
		t.Fatalf("RenderTemplate: unexpected error: %v", err)
	}
	want := "Halo Bu Sari, tagihan Rp150.000 jatuh tempo 10 Oktober 2026."
	if got != want {
		t.Fatalf("RenderTemplate = %q, want %q", got, want)
	}
}

func TestRenderTemplate_MissingVariable(t *testing.T) {
	tmpl := domain.WhatsAppTemplate{Body: "Halo {{parent_name}}, saldo Anda {{balance}}."}

	_, err := domain.RenderTemplate(tmpl, map[string]string{"parent_name": "Bu Sari"})
	if !errors.Is(err, domain.ErrMissingTemplateVariable) {
		t.Fatalf("RenderTemplate error = %v, want ErrMissingTemplateVariable", err)
	}
}

func TestRenderTemplate_NoPlaceholders(t *testing.T) {
	tmpl := domain.WhatsAppTemplate{Body: "Sekolah libur besok."}

	got, err := domain.RenderTemplate(tmpl, nil)
	if err != nil {
		t.Fatalf("RenderTemplate: unexpected error: %v", err)
	}
	if got != tmpl.Body {
		t.Fatalf("RenderTemplate = %q, want %q", got, tmpl.Body)
	}
}

func TestExtractPlaceholders(t *testing.T) {
	got := domain.ExtractPlaceholders("Halo {{name}}, {{name}} juga {{amount}}.")
	want := []string{"name", "amount"}
	if len(got) != len(want) {
		t.Fatalf("ExtractPlaceholders = %v, want %v", got, want)
	}
	for i, v := range want {
		if got[i] != v {
			t.Fatalf("ExtractPlaceholders[%d] = %q, want %q", i, got[i], v)
		}
	}
}
