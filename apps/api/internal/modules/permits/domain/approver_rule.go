package domain

import "strings"

// Approver rule names a Stage.ApproverRule can carry. service's rule
// registry maps each of these to a check against duty assignments,
// enrollments, or permits.ScheduleLookup; domain only knows the names and
// how to parse the parameterized "duty:<slug>" form.
const (
	RuleAnyTeacher        = "any_teacher"
	RuleTeacherOfClassNow = "teacher_of_class_now"
	RuleHomeroomOfStudent = "homeroom_of_student"
	dutyRulePrefix        = "duty:"
)

// ParseDutyRule returns the duty_types.slug encoded in a "duty:<slug>"
// approver rule, or ok=false if rule is not that form.
func ParseDutyRule(rule string) (slug string, ok bool) {
	if !strings.HasPrefix(rule, dutyRulePrefix) {
		return "", false
	}
	slug = strings.TrimPrefix(rule, dutyRulePrefix)
	return slug, slug != ""
}
