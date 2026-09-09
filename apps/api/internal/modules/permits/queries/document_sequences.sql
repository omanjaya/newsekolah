-- name: NextDocumentSequenceValue :one
-- Bug fix vs. the old app (docs/analysis/backend-inventory.md 1.14/1.17):
-- the issued number comes from this single atomic UPDATE ... RETURNING
-- (implemented as an upsert since the row may not exist yet), never a
-- COUNT(*) + 1 that two concurrent issuances could both compute.
insert into document_sequences (tenant_id, kind, academic_year_id, next_value)
values ($1, $2, $3, 2)
on conflict (tenant_id, kind, academic_year_id)
do update set next_value = document_sequences.next_value + 1
returning (next_value - 1)::bigint as issued_value;
