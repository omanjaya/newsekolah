package permits

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/domain"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/repository"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/permits/service"
	"github.com/omanjaya/newsekolah/apps/api/internal/modules/school"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/clock"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/dbtest"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/documents"
	"github.com/omanjaya/newsekolah/apps/api/internal/platform/tenant"
)

// capturingRenderer records the variables each document was rendered with,
// so a test can read the printed values without parsing the PDF.
type capturingRenderer struct {
	mu   sync.Mutex
	vars []map[string]any
}

func (r *capturingRenderer) Render(_ context.Context, _ documents.Template, vars map[string]any) (documents.Rendered, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.vars = append(r.vars, vars)
	return documents.Rendered{PDF: []byte("%PDF-test")}, nil
}

func (r *capturingRenderer) last() map[string]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.vars[len(r.vars)-1]
}

func buildCapturingService(pool *pgxpool.Pool, renderer documents.Renderer) *service.Service {
	schoolModule := school.Register(pool, tenant.ModeSingle, nil)
	return service.New(pool, repository.New(pool), schoolModule.Service, noSchedule{}, &fakeAttendanceSync{}, noDiscipline{}, nil, noRealtime{}, nil,
		renderer, clock.Real{}, service.Config{DocumentSigningKey: []byte("a-test-signing-key"), EvidenceMaxBytes: 6 << 20})
}

// TestIssuedDocumentsDateOnTheSchoolsDay pins the receipt footer that read
// "diterbitkan pada 20-11-2026" for a payment made at 00:17 WITA on 21
// November: the shared document pipeline took the UTC clock as the issue
// day. The issued date and the {{month_roman}}/{{year}} numbering both
// follow the school's own calendar, and the date prints as the long
// Indonesian date the rest of the receipt uses.
func TestIssuedDocumentsDateOnTheSchoolsDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLeaveWorld(t, ctx, pg.AdminPool, "issued-on-local-"+uuid.NewString())
	_, err := pg.AdminPool.Exec(ctx, `update tenants set timezone = 'Asia/Makassar' where id = $1`, w.tenantID)
	require.NoError(t, err)

	renderer := &capturingRenderer{}
	svc := buildCapturingService(pg.AppPool, renderer)

	issue := func(at time.Time) service.IssuedDocumentResult {
		t.Helper()
		out, err := svc.IssueDocument(clock.WithTime(ctx, at), w.tenantID, service.IssueDocumentInput{
			Kind: domain.TemplateKind("receipt"), NumberingTemplate: "{{seq}}/KWT/{{month_roman}}/{{year}}",
			EntityType: "payment", EntityID: uuid.New(), AcademicYearID: w.yearID, IssuerUserID: w.counselorID,
			ObjectKey: "unused", Vars: map[string]any{}, BuiltinHTML: "<p>{{.issued_at}}</p>",
		})
		require.NoError(t, err)
		return out
	}

	// 16:17 UTC on 20 November is 00:17 WITA on 21 November.
	first := issue(time.Date(2026, time.November, 20, 16, 17, 0, 0, time.UTC))
	require.Equal(t, "21 November 2026", renderer.last()["issued_at"])
	require.Equal(t, "1/KWT/XI/2026", first.Number)

	// 16:30 UTC on 31 December is already 1 January in the school.
	second := issue(time.Date(2026, time.December, 31, 16, 30, 0, 0, time.UTC))
	require.Equal(t, "1 Januari 2027", renderer.last()["issued_at"])
	require.Equal(t, "2/KWT/I/2027", second.Number)
}

// TestLeaveLetterDatesOnTheSchoolsDay is the leave letter's copy of the
// same rule: it numbers and dates itself outside IssueDocument.
func TestLeaveLetterDatesOnTheSchoolsDay(t *testing.T) {
	pg := dbtest.Start(t)
	ctx := context.Background()
	w := seedLeaveWorld(t, ctx, pg.AdminPool, "leave-issued-on-local-"+uuid.NewString())
	_, err := pg.AdminPool.Exec(ctx, `update tenants set timezone = 'Asia/Makassar' where id = $1`, w.tenantID)
	require.NoError(t, err)

	renderer := &capturingRenderer{}
	svc := buildCapturingService(pg.AppPool, renderer)

	starts := time.Now().UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)
	submitted, err := svc.SubmitLeaveRequest(ctx, service.SubmitLeaveRequestInput{
		TenantID: w.tenantID, ActorUserID: w.studentID, StudentUserID: w.studentID,
		Category: domain.CategorySick, StartsOn: starts, EndsOn: starts,
	})
	require.NoError(t, err)
	_, err = svc.ReviewLeaveRequest(ctx, w.tenantID, submitted.Instance.ID, w.homeroomTeacherID, true, "")
	require.NoError(t, err)

	// 16:40 UTC on 30 November is 00:40 WITA on 1 December.
	at := time.Date(2026, time.November, 30, 16, 40, 0, 0, time.UTC)
	issued, err := svc.IssueLeaveLetter(clock.WithTime(ctx, at), w.tenantID, submitted.Instance.ID, w.counselorID)
	require.NoError(t, err)
	require.Equal(t, "1 Desember 2026", renderer.last()["issued_at"])
	require.Contains(t, issued.LeaveRequest.LetterNumber, "/XII/2026")
	// The leave dates use the same long style as the issue date.
	longDate := fmt.Sprintf(`^%d [A-Z][a-z]+ %d$`, starts.Day(), starts.Year())
	require.Regexp(t, longDate, renderer.last()["starts_on"])
	require.Regexp(t, longDate, renderer.last()["ends_on"])
}
