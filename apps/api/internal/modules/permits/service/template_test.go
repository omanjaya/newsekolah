package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
)

// TestBuiltinLeaveLetterCategoryText is the regression test for the
// letter printing the raw enum ("dengan keterangan sick: Sakit").
func TestBuiltinLeaveLetterCategoryText(t *testing.T) {
	render := func(t *testing.T, lr domain.LeaveRequest) string {
		t.Helper()
		out, err := documents.NewHTMLPDFRenderer().Render(context.Background(),
			documents.Template{Engine: documents.EngineHTML, Body: builtinLeaveLetterHTML},
			leaveLetterVars(lr, leaveLetterExtras{number: "1/IZIN/XI/2026"}))
		require.NoError(t, err)
		return string(out.HTML)
	}
	day := time.Date(2026, time.November, 23, 0, 0, 0, 0, time.UTC)

	t.Run("a fixed category prints its Indonesian name once", func(t *testing.T) {
		html := render(t, domain.LeaveRequest{Category: domain.CategorySick, Reason: "Sakit", StartsOn: day, EndsOn: day})
		require.Contains(t, html, "dengan keterangan Sakit.")
		require.NotContains(t, html, "sick")
	})

	t.Run("dispensation uses the full name, not the stored short reason", func(t *testing.T) {
		html := render(t, domain.LeaveRequest{Category: domain.CategoryDispensation, Reason: "Dispen", StartsOn: day, EndsOn: day})
		require.Contains(t, html, "dengan keterangan Dispensasi.")
		require.NotContains(t, html, "dispensation")
	})

	t.Run("other keeps the student's own reason after the category", func(t *testing.T) {
		html := render(t, domain.LeaveRequest{Category: domain.CategoryOther, Reason: "Acara keluarga", StartsOn: day, EndsOn: day})
		require.Contains(t, html, "dengan keterangan Lainnya: Acara keluarga.")
	})

	t.Run("the length is the school days, not the calendar span", func(t *testing.T) {
		lr := domain.LeaveRequest{Category: domain.CategorySick, Reason: "Sakit", StartsOn: day, EndsOn: day.AddDate(0, 0, 4)}
		out, err := documents.NewHTMLPDFRenderer().Render(context.Background(),
			documents.Template{Engine: documents.EngineHTML, Body: builtinLeaveLetterHTML},
			leaveLetterVars(lr, leaveLetterExtras{number: "1/IZIN/XI/2026", schoolDays: 2}))
		require.NoError(t, err)
		require.Contains(t, string(out.HTML), "(2 hari sekolah)")
	})
}

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
