package wiring

import (
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	disciplineservice "github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/events"
)

// TestWarningLetterBridge_LinksEachRecipientToARealPage is the regression
// test for SP notifications that opened /discipline/letters/{id}, a route
// the web app never had. The student is sent to their own record and the
// homeroom teacher to the student's staff discipline page.
func TestWarningLetterBridge_LinksEachRecipientToARealPage(t *testing.T) {
	tenantID := uuid.New()
	classID := uuid.New()
	student := uuid.New()
	homeroom := uuid.New()
	issuer := uuid.New()
	letterID := uuid.New()

	bus := events.NewBus()
	RegisterNotificationBridge(bus, fakeDutyLookup{holders: map[string][]uuid.UUID{
		"homeroom:" + classID.String(): {homeroom, issuer},
	}}, slog.Default())
	got := spyEnvelopes(t, bus, events.WarningLetterIssued)

	require.NoError(t, bus.Publish(context.Background(), disciplineservice.WarningLetterIssued{
		TenantID: tenantID, LetterID: letterID, StudentUserID: student,
		ClassID: uuid.NullUUID{UUID: classID, Valid: true},
		Level:   1, LevelLabel: "SP 1", LetterNumber: "001/SP/XI/2026", IssuedBy: issuer,
	}))

	require.Len(t, *got, 2)
	byRecipient := map[uuid.UUID]string{}
	for _, envelope := range *got {
		require.Equal(t, letterID.String(), envelope.Payload["letter_id"])
		for _, id := range envelope.Subject {
			byRecipient[id] = envelope.Payload["href"].(string)
		}
	}
	require.Equal(t, "/my-discipline", byRecipient[student])
	require.Equal(t, "/discipline/students/"+student.String(), byRecipient[homeroom])
	_, issuerNotified := byRecipient[issuer]
	require.False(t, issuerNotified, "the issuer is not notified about their own letter")
	for _, href := range byRecipient {
		require.False(t, strings.HasPrefix(href, "/discipline/letters/"), "no web route serves %s", href)
	}
}
