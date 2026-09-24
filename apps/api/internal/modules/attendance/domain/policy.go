// Package domain holds attendance's entities and the business rules that
// must never disagree depending on which HTTP handler happens to compute
// them: the status policy, the one daily-status algorithm (used by the
// student calendar, homeroom view, daily report, and monitor snapshot
// alike), and the save-window rules. Nothing here imports pgx, chi, or
// gen/*, per docs/03-layered-architecture.md section 1.
package domain

// StatusCodeAlpha is the code the default (and every observed tenant)
// policy uses for an unexcused absence. A few call sites need to single
// out "absent" specifically rather than just "not present" -- e.g.
// notifying guardians on submit -- so this is named rather than repeating
// the literal "A".
const StatusCodeAlpha = "A"

// StatusDef is one attendance status code a tenant accepts, configured via
// tenant_policies(kind='attendance_statuses'). Priority breaks a tie when
// DailyStatus (see daily_status.go) cannot find a strict majority among a
// day's entries: the lowest Priority value wins, i.e. the status most
// worth an admin's attention surfaces first. The default order (Alpha,
// Dispensasi, Izin, Sakit, Hadir) replaces two different, undocumented
// priority orders the old system used in different reports
// (docs/analysis/backend-inventory.md sections 1.10 and 1.11) with one
// place that decides.
type StatusDef struct {
	Code            string
	Label           string
	Color           string
	CountsAsPresent bool
	Priority        int
}

// StatusPolicy is the full configured set of statuses for one tenant, plus
// the version stamped on tenant_policies so a change is auditable.
type StatusPolicy struct {
	Version  int
	Statuses []StatusDef
}

// DefaultStatusPolicy is the platform default seeded for every tenant that
// has not configured its own: H(adir)/S(akit)/I(zin)/D(ispensasi)/A(lpha),
// matching the old system's fixed status set
// (docs/analysis/database-inventory.md section 1.4) so behaviour does not
// change for a school that never touches this setting.
func DefaultStatusPolicy() StatusPolicy {
	return StatusPolicy{
		Version: 1,
		Statuses: []StatusDef{
			{Code: "H", Label: "Hadir", Color: "#16a34a", CountsAsPresent: true, Priority: 5},
			{Code: "S", Label: "Sakit", Color: "#f59e0b", CountsAsPresent: false, Priority: 4},
			{Code: "I", Label: "Izin", Color: "#0ea5e9", CountsAsPresent: false, Priority: 3},
			{Code: "D", Label: "Dispensasi", Color: "#8b5cf6", CountsAsPresent: false, Priority: 2},
			{Code: "A", Label: "Alpha", Color: "#dc2626", CountsAsPresent: false, Priority: 1},
		},
	}
}

// IsValid reports whether code is a status this policy accepts.
func (p StatusPolicy) IsValid(code string) bool {
	_, ok := p.lookup(code)
	return ok
}

// CountsAsPresent reports whether code counts as the student having
// attended, per the tenant's configuration. An unknown code counts as not
// present, the safer default.
func (p StatusPolicy) CountsAsPresent(code string) bool {
	def, ok := p.lookup(code)
	return ok && def.CountsAsPresent
}

func (p StatusPolicy) priority(code string) int {
	if def, ok := p.lookup(code); ok {
		return def.Priority
	}
	// An unrecognized code should never win a tie-break; push it to the
	// back rather than letting a data error silently take priority.
	return int(^uint(0) >> 1)
}

// Label returns code's tenant-configured display label (e.g. "H" ->
// "Hadir"), for a report or screen that must not print the raw status
// code. Only ok reports whether code is part of this policy; the special
// codes StatusNone/StatusIncomplete/StatusMixed never are (a report
// translates those itself, since they are not tenant content).
func (p StatusPolicy) Label(code string) (string, bool) {
	def, ok := p.lookup(code)
	if !ok {
		return "", false
	}
	return def.Label, true
}

func (p StatusPolicy) lookup(code string) (StatusDef, bool) {
	for _, s := range p.Statuses {
		if s.Code == code {
			return s, true
		}
	}
	return StatusDef{}, false
}
