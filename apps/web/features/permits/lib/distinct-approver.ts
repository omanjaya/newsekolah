import type { components } from "@newsekolah/api-client";

type WorkflowInstance = components["schemas"]["WorkflowInstance"];

/**
 * The label of the earlier stage `userId` approved that the instance's
 * current stage must be distinct from, or undefined when nothing keeps
 * them off the current stage.
 *
 * Mirrors the API's checkDistinctFrom (permits/service/rules.go): for each
 * key in `current_stage.distinct_from`, the stage's approver is the actor
 * of its latest event, and the API refuses that actor at the current
 * stage (WORKFLOW_APPROVER_NOT_DISTINCT). A homeroom teacher who also
 * holds a Guru BK duty is the case in practice: they cannot issue the
 * letter of a leave request they approved as homeroom.
 */
export function approvedDistinctStage(
  instance: WorkflowInstance,
  userId: string | undefined,
): string | undefined {
  if (!userId) return undefined;
  const events = instance.events ?? [];
  for (const key of instance.current_stage?.distinct_from ?? []) {
    let latest: (typeof events)[number] | undefined;
    for (const event of events) {
      if (event.stage_key !== key) continue;
      if (!latest || Date.parse(event.occurred_at) >= Date.parse(latest.occurred_at)) {
        latest = event;
      }
    }
    if (latest?.actor_user_id === userId) {
      // A key the instance's stage list no longer names (a definition
      // edited since) still blocks; the key stands in for its label.
      return instance.stages.find((stage) => stage.key === key)?.label ?? key;
    }
  }
  return undefined;
}
