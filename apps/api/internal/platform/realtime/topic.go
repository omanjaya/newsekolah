package realtime

import "github.com/google/uuid"

// Topic name helpers. Every topic this package understands is tenant-
// prefixed, so a Subscribe/Publish call can never cross a tenant boundary
// by construction (docs/analysis/realtime-plan-2026-09-25.md section 3.2:
// "klien tidak pernah memilih topik yang server tidak verifikasi"). Callers
// build every topic through one of these instead of concatenating strings
// themselves, so the wire format only ever changes in one place.

// TopicUser is one signed-in user's own topic: notifications and any other
// per-user push (workflow results, exports, grading results) land here.
func TopicUser(tenantID, userID uuid.UUID) string {
	return "user:" + tenantID.String() + ":" + userID.String()
}

// TopicRole is every holder of a fixed role (admin, principal, librarian,
// hr). Cheap to authorize: claims.Roles already lists it on the verified
// access token, so a subscribe request needs no DB round trip.
func TopicRole(tenantID uuid.UUID, role string) string {
	return "role:" + tenantID.String() + ":" + role
}

// TopicDuty is every holder of a duty assignment (homeroom, counselor,
// duty_teacher/piket, security), optionally scoped to one class (homeroom
// is always class-scoped; counselor/duty_teacher/security are tenant-wide,
// classID left invalid). Unlike TopicRole, authorizing this needs a live
// DutyLookup call: duty assignments change without a new token being
// issued -- a duty piket teacher swapped at recess must lose the topic
// without waiting for their token to expire (plan section 3.2).
func TopicDuty(tenantID uuid.UUID, slug string, classID uuid.NullUUID) string {
	if classID.Valid {
		return "duty:" + tenantID.String() + ":" + slug + ":" + classID.UUID.String()
	}
	return "duty:" + tenantID.String() + ":" + slug
}

// TopicMonitor is one tenant's public monitor-screen topic (GET
// /ws/monitor): not tied to any one user, gated by the tenant's display
// token instead of a claim.
func TopicMonitor(tenantID uuid.UUID) string {
	return "monitor:" + tenantID.String()
}
