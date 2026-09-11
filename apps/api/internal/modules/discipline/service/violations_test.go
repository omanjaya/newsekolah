package service

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/omanjaya/newsekolah/apps/api/internal/modules/discipline/domain"
)

// fakeRecordRepo is an in-memory stand-in for Repository, just enough to
// exercise RecordViolation's eligibility check, batch recording and
// workflow idempotency without a database. Every method the tests in
// this file do not touch panics, so a test that starts exercising new
// behaviour is forced to extend the fake rather than silently getting a
// zero value.
type fakeRecordRepo struct {
	enrolled bool
	active   bool

	types map[uuid.UUID]domain.ViolationType

	records     []domain.ViolationRecord
	byWorkflow  map[[2]uuid.UUID]domain.ViolationRecord // (workflow_instance_id, violation_type_id) -> record
	createCalls int
}

func newFakeRecordRepo() *fakeRecordRepo {
	return &fakeRecordRepo{enrolled: true, active: true, types: map[uuid.UUID]domain.ViolationType{}, byWorkflow: map[[2]uuid.UUID]domain.ViolationRecord{}}
}

func (f *fakeRecordRepo) addType(t domain.ViolationType) { f.types[t.ID] = t }

func (f *fakeRecordRepo) StudentEligible(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) (bool, bool, error) {
	return f.enrolled, f.active, nil
}

func (f *fakeRecordRepo) SumActivePoints(_ context.Context, _, _, studentID uuid.UUID) (int, error) {
	total := 0
	for _, r := range f.records {
		if r.StudentUserID == studentID && !r.IsVoided() {
			total += r.PointsSnapshot
		}
	}
	return total, nil
}

func (f *fakeRecordRepo) GetViolationType(_ context.Context, _ uuid.UUID, id uuid.UUID) (domain.ViolationType, bool, error) {
	t, ok := f.types[id]
	return t, ok, nil
}

func (f *fakeRecordRepo) GetRecordByWorkflow(_ context.Context, _ uuid.UUID, workflowInstanceID, violationTypeID uuid.UUID) (domain.ViolationRecord, bool, error) {
	r, ok := f.byWorkflow[[2]uuid.UUID{workflowInstanceID, violationTypeID}]
	return r, ok, nil
}

func (f *fakeRecordRepo) CreateRecord(_ context.Context, r domain.ViolationRecord) (domain.ViolationRecord, error) {
	f.createCalls++
	r.ID = uuid.Must(uuid.NewV7())
	r.CreatedAt = time.Now()
	f.records = append(f.records, r)
	if r.WorkflowInstanceID.Valid {
		f.byWorkflow[[2]uuid.UUID{r.WorkflowInstanceID.UUID, r.ViolationTypeID}] = r
	}
	return r, nil
}

func (f *fakeRecordRepo) ListLettersForStudent(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) ([]domain.WarningLetter, error) {
	return nil, nil
}

// The remaining Repository methods are unused by these tests.
func (f *fakeRecordRepo) unimplemented() {
	panic("fakeRecordRepo: method not implemented for this test")
}

func (f *fakeRecordRepo) ListViolationTypes(context.Context, uuid.UUID, bool, string) ([]domain.ViolationType, error) {
	f.unimplemented()
	return nil, nil
}
func (f *fakeRecordRepo) CreateViolationType(context.Context, domain.ViolationType) (domain.ViolationType, error) {
	f.unimplemented()
	return domain.ViolationType{}, nil
}
func (f *fakeRecordRepo) UpdateViolationType(context.Context, domain.ViolationType) (domain.ViolationType, error) {
	f.unimplemented()
	return domain.ViolationType{}, nil
}
func (f *fakeRecordRepo) DeleteViolationType(context.Context, uuid.UUID, uuid.UUID) error {
	f.unimplemented()
	return nil
}
func (f *fakeRecordRepo) GetRecord(context.Context, uuid.UUID, uuid.UUID) (domain.ViolationRecord, bool, error) {
	f.unimplemented()
	return domain.ViolationRecord{}, false, nil
}
func (f *fakeRecordRepo) VoidRecord(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, string) (domain.ViolationRecord, bool, error) {
	f.unimplemented()
	return domain.ViolationRecord{}, false, nil
}
func (f *fakeRecordRepo) ListRecordsForStudent(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) ([]domain.ViolationRecord, error) {
	f.unimplemented()
	return nil, nil
}
func (f *fakeRecordRepo) ListRecords(context.Context, uuid.UUID, uuid.UUID, RecordFilter) ([]domain.ViolationRecord, error) {
	f.unimplemented()
	return nil, nil
}
func (f *fakeRecordRepo) ListPointTotals(context.Context, uuid.UUID, uuid.UUID, uuid.NullUUID, int) ([]PointTotal, error) {
	f.unimplemented()
	return nil, nil
}
func (f *fakeRecordRepo) ListActivePoints(context.Context, uuid.UUID, uuid.UUID, uuid.NullUUID) ([]StudentPointRecord, error) {
	f.unimplemented()
	return nil, nil
}
func (f *fakeRecordRepo) CreateLetter(context.Context, domain.WarningLetter) (domain.WarningLetter, error) {
	f.unimplemented()
	return domain.WarningLetter{}, nil
}
func (f *fakeRecordRepo) GetLetter(context.Context, uuid.UUID, uuid.UUID) (domain.WarningLetter, bool, error) {
	f.unimplemented()
	return domain.WarningLetter{}, false, nil
}
func (f *fakeRecordRepo) ListLetters(context.Context, uuid.UUID, uuid.UUID, uuid.NullUUID, int, int) ([]domain.WarningLetter, error) {
	f.unimplemented()
	return nil, nil
}
func (f *fakeRecordRepo) ListSPCandidates(context.Context, uuid.UUID, uuid.UUID, CandidateFilter) ([]SPCandidate, error) {
	f.unimplemented()
	return nil, nil
}
func (f *fakeRecordRepo) CreateCounseling(context.Context, domain.Counseling, []byte, []byte, []byte, []byte, string) (domain.Counseling, error) {
	f.unimplemented()
	return domain.Counseling{}, nil
}
func (f *fakeRecordRepo) UpdateCounseling(context.Context, domain.Counseling, []byte, []byte, []byte, []byte, string) (domain.Counseling, error) {
	f.unimplemented()
	return domain.Counseling{}, nil
}
func (f *fakeRecordRepo) GetCounseling(context.Context, uuid.UUID, uuid.UUID) (EncryptedCounseling, bool, error) {
	f.unimplemented()
	return EncryptedCounseling{}, false, nil
}
func (f *fakeRecordRepo) ListCounselingsForStudent(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) ([]EncryptedCounseling, error) {
	f.unimplemented()
	return nil, nil
}
func (f *fakeRecordRepo) ListCounselingsByCounselor(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, int, int) ([]EncryptedCounseling, error) {
	f.unimplemented()
	return nil, nil
}
func (f *fakeRecordRepo) ListCounselingsByVisibility(context.Context, uuid.UUID, uuid.UUID, string, int, int) ([]EncryptedCounseling, error) {
	f.unimplemented()
	return nil, nil
}
func (f *fakeRecordRepo) DeleteCounseling(context.Context, uuid.UUID, uuid.UUID) error {
	f.unimplemented()
	return nil
}
func (f *fakeRecordRepo) CreateCounselingAttachment(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) (domain.CounselingAttachment, error) {
	f.unimplemented()
	return domain.CounselingAttachment{}, nil
}
func (f *fakeRecordRepo) ListCounselingAttachments(context.Context, uuid.UUID, uuid.UUID) ([]domain.CounselingAttachment, error) {
	f.unimplemented()
	return nil, nil
}
func (f *fakeRecordRepo) GetCounselingAttachment(context.Context, uuid.UUID, uuid.UUID) (domain.CounselingAttachment, bool, error) {
	f.unimplemented()
	return domain.CounselingAttachment{}, false, nil
}
func (f *fakeRecordRepo) GetLatestPolicy(context.Context, uuid.UUID, string) ([]byte, int, bool, error) {
	f.unimplemented()
	return nil, 0, false, nil
}
func (f *fakeRecordRepo) CreatePolicy(context.Context, uuid.UUID, string, int, []byte, time.Time, uuid.NullUUID) error {
	f.unimplemented()
	return nil
}
func (f *fakeRecordRepo) StudentSnapshot(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) (StudentSnapshot, error) {
	f.unimplemented()
	return StudentSnapshot{}, nil
}
func (f *fakeRecordRepo) HasActiveDuty(context.Context, uuid.UUID, uuid.UUID, uuid.UUID, string, uuid.NullUUID) (bool, error) {
	f.unimplemented()
	return false, nil
}
func (f *fakeRecordRepo) ActiveClassID(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) (uuid.NullUUID, error) {
	f.unimplemented()
	return uuid.NullUUID{}, nil
}
func (f *fakeRecordRepo) CreateAsset(context.Context, uuid.UUID, string, string, string, int64, string, string, string, uuid.UUID) (uuid.UUID, error) {
	f.unimplemented()
	return uuid.Nil, nil
}
func (f *fakeRecordRepo) GetAsset(context.Context, uuid.UUID, uuid.UUID) (AssetInfo, bool, error) {
	f.unimplemented()
	return AssetInfo{}, false, nil
}

var _ Repository = (*fakeRecordRepo)(nil)

func testPolicy() domain.SPPolicy { return domain.DefaultSPPolicy() }

func TestRecordViolationCoreRejectsInactiveStudent(t *testing.T) {
	repo := newFakeRecordRepo()
	repo.active = false
	typeID := uuid.Must(uuid.NewV7())
	repo.addType(domain.ViolationType{ID: typeID, IsActive: true, Points: 10})

	in := RecordInput{StudentUserID: uuid.New(), ViolationTypeID: typeID, OccurredOn: time.Now(), ReporterUserID: uuid.New()}
	_, _, err := recordViolationCore(context.Background(), repo, testPolicy(), uuid.New(), uuid.New(), in, []uuid.UUID{typeID})

	require.ErrorIs(t, err, domain.ErrStudentInactive, "an inactive student account must not receive a new violation record")
	require.Zero(t, repo.createCalls, "no record should be written once eligibility fails")
}

func TestRecordViolationCoreRejectsUnenrolledStudent(t *testing.T) {
	repo := newFakeRecordRepo()
	repo.enrolled = false
	typeID := uuid.Must(uuid.NewV7())
	repo.addType(domain.ViolationType{ID: typeID, IsActive: true, Points: 10})

	in := RecordInput{StudentUserID: uuid.New(), ViolationTypeID: typeID, OccurredOn: time.Now(), ReporterUserID: uuid.New()}
	_, _, err := recordViolationCore(context.Background(), repo, testPolicy(), uuid.New(), uuid.New(), in, []uuid.UUID{typeID})

	require.ErrorIs(t, err, domain.ErrStudentNotEnrolled, "a student with no active enrollment in the active year must not receive a new violation record")
	require.Zero(t, repo.createCalls)
}

func TestRecordViolationCoreBatchRecordsEachDistinctType(t *testing.T) {
	repo := newFakeRecordRepo()
	typeA := uuid.Must(uuid.NewV7())
	typeB := uuid.Must(uuid.NewV7())
	repo.addType(domain.ViolationType{ID: typeA, IsActive: true, Points: 5, Name: "Terlambat"})
	repo.addType(domain.ViolationType{ID: typeB, IsActive: true, Points: 15, Name: "Bolos"})

	studentID := uuid.New()
	in := RecordInput{StudentUserID: studentID, OccurredOn: time.Now(), ReporterUserID: uuid.New()}
	result, crossed, err := recordViolationCore(context.Background(), repo, testPolicy(), uuid.New(), uuid.New(), in, []uuid.UUID{typeA, typeB})

	require.NoError(t, err)
	require.Len(t, result.Records, 2, "both distinct types are recorded in one call")
	require.Equal(t, 20, result.TotalPoints)
	require.Equal(t, result.Records[0], result.Record, "Record stays the first row, for single-type callers")
	require.Len(t, crossed, 0, "20 points does not reach the default SP1 threshold of 25")
}

func TestRecordViolationCoreThresholdCrossedOnlyOnce(t *testing.T) {
	repo := newFakeRecordRepo()
	crossingType := uuid.Must(uuid.NewV7())
	zeroPointType := uuid.Must(uuid.NewV7())
	repo.addType(domain.ViolationType{ID: crossingType, IsActive: true, Points: 25, Name: "Berkelahi"})
	repo.addType(domain.ViolationType{ID: zeroPointType, IsActive: true, Points: 0, Name: "Peringatan lisan"})
	studentID, tenantID, yearID := uuid.New(), uuid.New(), uuid.New()

	in := RecordInput{StudentUserID: studentID, ViolationTypeID: crossingType, OccurredOn: time.Now(), ReporterUserID: uuid.New()}
	result, crossed, err := recordViolationCore(context.Background(), repo, testPolicy(), tenantID, yearID, in, []uuid.UUID{crossingType})
	require.NoError(t, err)
	require.Len(t, crossed, 1, "the 25-point record crosses SP1")
	require.Equal(t, 1, crossed[0].Level)
	require.Equal(t, 25, result.TotalPoints)

	// A second, zero-point record for the same student leaves the total at
	// SP1's own threshold; SP1 is already reached, so it must not be
	// reported as newly crossed a second time.
	in.ViolationTypeID = zeroPointType
	_, crossed, err = recordViolationCore(context.Background(), repo, testPolicy(), tenantID, yearID, in, []uuid.UUID{zeroPointType})
	require.NoError(t, err)
	require.Empty(t, crossed, "a level already reached before this call is not \"newly\" crossed")
}

func TestRecordViolationCoreIdempotentOnWorkflowInstance(t *testing.T) {
	repo := newFakeRecordRepo()
	typeID := uuid.Must(uuid.NewV7())
	repo.addType(domain.ViolationType{ID: typeID, IsActive: true, Points: 10})
	workflowID := uuid.New()
	in := RecordInput{
		StudentUserID: uuid.New(), ViolationTypeID: typeID, OccurredOn: time.Now(), ReporterUserID: uuid.New(),
		WorkflowInstanceID: uuid.NullUUID{UUID: workflowID, Valid: true},
	}

	first, _, err := recordViolationCore(context.Background(), repo, testPolicy(), uuid.New(), uuid.New(), in, []uuid.UUID{typeID})
	require.NoError(t, err)
	require.Equal(t, 1, repo.createCalls)

	second, _, err := recordViolationCore(context.Background(), repo, testPolicy(), uuid.New(), uuid.New(), in, []uuid.UUID{typeID})
	require.NoError(t, err)
	require.Equal(t, 1, repo.createCalls, "a retry with the same (workflow_instance_id, violation_type_id) must not insert a second row")
	require.Equal(t, first.Record.ID, second.Record.ID)
}

// requireEligibleStudent is shared by RecordViolation and CreateCounseling
// (counseling.go); this direct test documents that shared contract
// independent of which caller exercises it.
func TestRequireEligibleStudent(t *testing.T) {
	tests := []struct {
		name     string
		enrolled bool
		active   bool
		wantErr  error
	}{
		{"active and enrolled", true, true, nil},
		{"inactive account", true, false, domain.ErrStudentInactive},
		{"not enrolled", false, true, domain.ErrStudentNotEnrolled},
		{"inactive takes precedence over not enrolled", false, false, domain.ErrStudentInactive},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newFakeRecordRepo()
			repo.enrolled, repo.active = tt.enrolled, tt.active
			err := requireEligibleStudent(context.Background(), repo, uuid.New(), uuid.New(), uuid.New())
			if tt.wantErr == nil {
				require.NoError(t, err)
				return
			}
			require.ErrorIs(t, err, tt.wantErr)
		})
	}
}

func TestRecordInputValidateRejectsTooManyOrDuplicateTypes(t *testing.T) {
	base := RecordInput{StudentUserID: uuid.New(), OccurredOn: time.Now()}

	t.Run("no types", func(t *testing.T) {
		_, err := base.validate()
		require.ErrorIs(t, err, domain.ErrInvalidInput)
	})

	t.Run("duplicate type", func(t *testing.T) {
		id := uuid.New()
		in := base
		in.ViolationTypeID = id
		in.ViolationTypeIDs = []uuid.UUID{id}
		_, err := in.validate()
		require.ErrorIs(t, err, domain.ErrInvalidInput, "the old app requires 1-50 distinct types")
	})

	t.Run("more than 50 types", func(t *testing.T) {
		in := base
		ids := make([]uuid.UUID, 51)
		for i := range ids {
			ids[i] = uuid.New()
		}
		in.ViolationTypeIDs = ids
		_, err := in.validate()
		require.ErrorIs(t, err, domain.ErrInvalidInput)
	})

	t.Run("valid batch", func(t *testing.T) {
		in := base
		in.ViolationTypeIDs = []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
		ids, err := in.validate()
		require.NoError(t, err)
		require.Len(t, ids, 3)
	})
}
