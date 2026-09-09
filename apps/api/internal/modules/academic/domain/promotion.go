package domain

import "github.com/google/uuid"

const (
	PromotionActionPromote  = "promote"
	PromotionActionRetain   = "retain"
	PromotionActionGraduate = "graduate"
	// PromotionActionTransfer marks a student as leaving to another
	// school instead of continuing here: like graduate, it closes the
	// source enrollment without opening one in the destination year.
	PromotionActionTransfer = "transfer"
)

// PromotionCandidate is one currently-enrolled student the planner
// considers, described only by what promotion needs: their current class
// and grade level sequence. Grade levels are a tenant-wide catalog (not
// per academic year), so GradeLevelID is stable across the source and
// destination year.
type PromotionCandidate struct {
	StudentUserID uuid.UUID
	EnrollmentID  uuid.UUID
	FromClassID   uuid.UUID
	GradeLevelID  uuid.UUID
	GradeSequence int16
	TrackID       *uuid.UUID
}

// TargetClass is a class that already exists in the destination academic
// year, keyed by the grade level (and, when set, track) it serves.
type TargetClass struct {
	ClassID      uuid.UUID
	GradeLevelID uuid.UUID
	TrackID      *uuid.UUID
}

// PromotionOverride lets an operator force a specific action/class for one
// student instead of the sequence-based default (e.g. a student who
// repeats a grade, or a manual placement into a specific class).
type PromotionOverride struct {
	StudentUserID uuid.UUID
	Action        string
	TargetClassID *uuid.UUID
}

// PromotionPlanItem is one row of a promotion preview or commit result.
type PromotionPlanItem struct {
	StudentUserID uuid.UUID
	EnrollmentID  uuid.UUID
	FromClassID   uuid.UUID
	Action        string
	TargetClassID *uuid.UUID
	// Unresolved is true when Action is promote/retain but no matching
	// target class was found and no override supplied one: the caller
	// must assign the student manually before or during commit.
	Unresolved bool
}

// BuildPromotionPlan computes, for every candidate, whether they graduate,
// retain their grade, or promote to the next one, and which class in the
// destination year that maps to. gradeLevelIDBySequence resolves "the next
// grade level" for a promote decision (grade levels are a tenant-wide
// catalog shared across years); maxSequence is the highest
// GradeLevel.Sequence in that catalog, so a candidate already there
// graduates by default regardless of which candidates happen to be in this
// batch.
//
// This is pure domain logic (no I/O) so promotion rules can be unit
// tested without a database.
func BuildPromotionPlan(
	candidates []PromotionCandidate,
	targets []TargetClass,
	overrides []PromotionOverride,
	gradeLevelIDBySequence map[int16]uuid.UUID,
	maxSequence int16,
) []PromotionPlanItem {
	overrideByStudent := make(map[uuid.UUID]PromotionOverride, len(overrides))
	for _, o := range overrides {
		overrideByStudent[o.StudentUserID] = o
	}

	plan := make([]PromotionPlanItem, 0, len(candidates))
	for _, c := range candidates {
		item := PromotionPlanItem{
			StudentUserID: c.StudentUserID,
			EnrollmentID:  c.EnrollmentID,
			FromClassID:   c.FromClassID,
		}

		override, hasOverride := overrideByStudent[c.StudentUserID]

		switch {
		case hasOverride && override.Action == PromotionActionGraduate:
			item.Action = PromotionActionGraduate
		case hasOverride && override.Action == PromotionActionTransfer:
			item.Action = PromotionActionTransfer
		case hasOverride && override.Action == PromotionActionRetain:
			item.Action = PromotionActionRetain
			item.TargetClassID = firstNonNil(override.TargetClassID, findTarget(targets, c.GradeLevelID, c.TrackID))
		case hasOverride && override.Action == PromotionActionPromote:
			item.Action = PromotionActionPromote
			item.TargetClassID = firstNonNil(override.TargetClassID, promoteTarget(targets, gradeLevelIDBySequence, c))
		case c.GradeSequence >= maxSequence:
			item.Action = PromotionActionGraduate
		default:
			item.Action = PromotionActionPromote
			item.TargetClassID = promoteTarget(targets, gradeLevelIDBySequence, c)
		}

		needsTarget := item.Action == PromotionActionPromote || item.Action == PromotionActionRetain
		if needsTarget && item.TargetClassID == nil {
			item.Unresolved = true
		}

		plan = append(plan, item)
	}
	return plan
}

func promoteTarget(targets []TargetClass, gradeLevelIDBySequence map[int16]uuid.UUID, c PromotionCandidate) *uuid.UUID {
	nextGradeLevelID, ok := gradeLevelIDBySequence[c.GradeSequence+1]
	if !ok {
		return nil
	}
	return findTarget(targets, nextGradeLevelID, c.TrackID)
}

func findTarget(targets []TargetClass, gradeLevelID uuid.UUID, trackID *uuid.UUID) *uuid.UUID {
	for _, t := range targets {
		if t.GradeLevelID == gradeLevelID && sameTrack(t.TrackID, trackID) {
			id := t.ClassID
			return &id
		}
	}
	return nil
}

func sameTrack(a, b *uuid.UUID) bool {
	if a == nil || b == nil {
		return a == b
	}
	return *a == *b
}

func firstNonNil(a, b *uuid.UUID) *uuid.UUID {
	if a != nil {
		return a
	}
	return b
}
