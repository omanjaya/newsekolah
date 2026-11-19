package permits

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	api "github.com/omanjaya/newsekolah/apps/api/internal/gen/api"
	permitshttp "github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/transport/http"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/httpx"
)

// TestCurrentLateArrivalAnswersNoContentWhenNoneIsOpen pins the "none"
// answer of GET /v1/late-arrivals/current: a student with no late arrival
// in progress gets 204, not a 404 that browsers log as a failed request on
// every load of the late-arrival page; once one is open it comes back 200.
func TestCurrentLateArrivalAnswersNoContentWhenNoneIsOpen(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	svc, _ := flaggedLateArrivals(pg.AppPool, &recordingDiscipline{})
	handler := permitshttp.New(svc, clock.Real{})

	w := seedRealtimeWorld(t, ctx, pg.AdminPool, "late-current-"+uuid.NewString())
	studentCtx := httpx.WithUserID(httpx.WithTenantID(ctx, w.tenantID), w.studentID)

	visit := func() int {
		t.Helper()
		response, err := handler.GetCurrentLateArrival(studentCtx, api.GetCurrentLateArrivalRequestObject{})
		require.NoError(t, err)
		recorder := httptest.NewRecorder()
		require.NoError(t, response.VisitGetCurrentLateArrivalResponse(recorder))
		return recorder.Code
	}

	require.Equal(t, http.StatusNoContent, visit(), "no late arrival in progress is not an error")

	openLateArrival(t, ctx, svc, w)
	require.Equal(t, http.StatusOK, visit())
}
