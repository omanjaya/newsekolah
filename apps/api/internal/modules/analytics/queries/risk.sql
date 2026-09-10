-- name: AnalyticsUpsertStudentRisk :exec
insert into analytics_student_risk (
  tenant_id, academic_year_id, student_user_id, class_id, level, score, signals, reasons, policy_version, computed_at
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
on conflict (tenant_id, academic_year_id, student_user_id) do update set
  class_id = excluded.class_id,
  level = excluded.level,
  score = excluded.score,
  signals = excluded.signals,
  reasons = excluded.reasons,
  policy_version = excluded.policy_version,
  computed_at = excluded.computed_at;

-- name: AnalyticsListStudentRisk :many
-- sqlc.narg('class_id') left null lists every class (counselor/leadership scope).
select tenant_id, academic_year_id, student_user_id, class_id, level, score, signals, reasons, policy_version, computed_at
from analytics_student_risk
where tenant_id = $1 and academic_year_id = $2
  and (sqlc.narg('class_id')::uuid is null or class_id = sqlc.narg('class_id'))
order by score desc, student_user_id;

-- name: AnalyticsGetStudentRisk :one
select tenant_id, academic_year_id, student_user_id, class_id, level, score, signals, reasons, policy_version, computed_at
from analytics_student_risk
where tenant_id = $1 and academic_year_id = $2 and student_user_id = $3;
