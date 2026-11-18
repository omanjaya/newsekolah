package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
)

func TestValidateTemplateBody(t *testing.T) {
	t.Run("accepts a valid html body", func(t *testing.T) {
		require.NoError(t, validateTemplateBody(domain.EngineHTML, "<p>Surat izin untuk {{.name}}</p>"))
	})

	t.Run("accepts the built-in leave letter body", func(t *testing.T) {
		require.NoError(t, validateTemplateBody(domain.EngineHTML, builtinLeaveLetterHTML))
	})

	t.Run("rejects an unclosed action", func(t *testing.T) {
		err := validateTemplateBody(domain.EngineHTML, "<p>Surat izin untuk {{.name")
		require.ErrorIs(t, err, domain.ErrTemplateInvalid)
		require.ErrorContains(t, err, "unclosed action")
	})

	t.Run("leaves engines the renderer does not handle alone", func(t *testing.T) {
		require.NoError(t, validateTemplateBody(domain.EngineDocx, "{{.name"))
	})
}

// TestCreateTemplateRejectsInvalidBody checks the refusal happens before
// anything is written: the Service has no pool, so reaching the
// transaction would panic.
func TestCreateTemplateRejectsInvalidBody(t *testing.T) {
	svc := &Service{}
	_, err := svc.CreateTemplate(context.Background(), domain.Template{
		TenantID: uuid.New(),
		Kind:     domain.TemplateKindLeaveLetter,
		Name:     "Surat izin",
		Body:     "<p>{{.name</p>",
	})
	require.ErrorIs(t, err, domain.ErrTemplateInvalid)
}
