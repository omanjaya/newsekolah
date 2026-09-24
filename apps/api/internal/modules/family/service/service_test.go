package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeLinkChecker struct {
	linked bool
	err    error
}

func (f fakeLinkChecker) IsParentOf(_ context.Context, _, _, _ uuid.UUID) (bool, error) {
	return f.linked, f.err
}

type fakeLeaveRequestSubmitter struct {
	called     bool
	gotActor   uuid.UUID
	gotStudent uuid.UUID
	gotCat     string
	gotReason  string
	gotStarts  time.Time
	gotEnds    time.Time
	result     uuid.UUID
	err        error
}

func (f *fakeLeaveRequestSubmitter) SubmitChildLeaveRequest(
	_ context.Context, _, guardianUserID, studentUserID uuid.UUID,
	category, reason string, startsOn, endsOn time.Time,
) (uuid.UUID, error) {
	f.called = true
	f.gotActor = guardianUserID
	f.gotStudent = studentUserID
	f.gotCat = category
	f.gotReason = reason
	f.gotStarts = startsOn
	f.gotEnds = endsOn
	return f.result, f.err
}

func TestSubmitChildLeaveRequest_RequiresGuardianLink(t *testing.T) {
	submitter := &fakeLeaveRequestSubmitter{}
	svc := New(fakeLinkChecker{linked: false}, nil, nil, nil, nil, submitter)

	_, err := svc.SubmitChildLeaveRequest(
		context.Background(), uuid.New(), uuid.New(), uuid.New(),
		"sick", "demam", time.Now(), time.Now(),
	)

	require.ErrorIs(t, err, ErrNotLinked)
	require.False(t, submitter.called, "must not reach the leave-request submitter without a proven link")
}

func TestSubmitChildLeaveRequest_PropagatesLinkCheckError(t *testing.T) {
	boom := errors.New("boom")
	submitter := &fakeLeaveRequestSubmitter{}
	svc := New(fakeLinkChecker{err: boom}, nil, nil, nil, nil, submitter)

	_, err := svc.SubmitChildLeaveRequest(
		context.Background(), uuid.New(), uuid.New(), uuid.New(),
		"sick", "demam", time.Now(), time.Now(),
	)

	require.ErrorIs(t, err, boom)
	require.False(t, submitter.called)
}

func TestSubmitChildLeaveRequest_DelegatesOnceLinked(t *testing.T) {
	tenantID, parentID, studentID := uuid.New(), uuid.New(), uuid.New()
	starts := time.Date(2026, 9, 24, 0, 0, 0, 0, time.UTC)
	ends := starts.AddDate(0, 0, 1)
	wantInstance := uuid.New()
	submitter := &fakeLeaveRequestSubmitter{result: wantInstance}
	svc := New(fakeLinkChecker{linked: true}, nil, nil, nil, nil, submitter)

	got, err := svc.SubmitChildLeaveRequest(
		context.Background(), tenantID, parentID, studentID,
		"sick", "demam", starts, ends,
	)

	require.NoError(t, err)
	require.Equal(t, wantInstance, got)
	require.True(t, submitter.called)
	require.Equal(t, parentID, submitter.gotActor)
	require.Equal(t, studentID, submitter.gotStudent)
	require.Equal(t, "sick", submitter.gotCat)
	require.Equal(t, "demam", submitter.gotReason)
	require.True(t, starts.Equal(submitter.gotStarts))
	require.True(t, ends.Equal(submitter.gotEnds))
}

func TestSubmitChildLeaveRequest_PropagatesSubmitterError(t *testing.T) {
	submitter := &fakeLeaveRequestSubmitter{err: ErrLeaveGuardianNotApproving}
	svc := New(fakeLinkChecker{linked: true}, nil, nil, nil, nil, submitter)

	_, err := svc.SubmitChildLeaveRequest(
		context.Background(), uuid.New(), uuid.New(), uuid.New(),
		"sick", "demam", time.Now(), time.Now(),
	)

	require.ErrorIs(t, err, ErrLeaveGuardianNotApproving)
}
