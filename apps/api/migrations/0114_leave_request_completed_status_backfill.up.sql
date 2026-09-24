-- Data fix for a regression fixed in code by cd37e06 ("fix(permits):
-- complete a leave request when its letter is issued"): before that fix,
-- IssueLeaveLetter advanced a leave request's workflow_instances row to
-- status 'approved' when the counselor issued the letter, instead of
-- 'completed'. GetInProgressWorkflowInstance (queries/workflow_instances.sql)
-- treats 'approved' as still open, so any student whose leave request had
-- already been issued a letter before the fix was permanently blocked
-- from ever submitting a new leave request (every SubmitLeaveRequest call
-- failed with ErrAlreadyInProgress / 409, forever).
--
-- 'approved' is otherwise unreachable for kind = 'leave_request':
-- ReviewLeaveRequest refuses to approve the final stage
-- (ErrLeaveRequestNotReviewable), so the only code path that could have
-- left a leave_request instance at 'approved' is the pre-fix
-- IssueLeaveLetter -- which also always sets leave_requests.issued_at in
-- the same transaction. Restricting the backfill to rows with a
-- non-null issued_at is therefore both necessary and sufficient to target
-- exactly the instances the bug produced, without touching a legitimately
-- in-progress request.
--
-- closed_at is set the same way AdvanceInstance sets it for any other
-- transition into a terminal status (now(), only if not already set) --
-- see service/workflow.go's approveCurrentStage.
update workflow_instances wi
set status = 'completed',
    closed_at = coalesce(wi.closed_at, now())
from leave_requests lr
where lr.instance_id = wi.id
  and wi.kind = 'leave_request'
  and wi.status = 'approved'
  and lr.issued_at is not null;
