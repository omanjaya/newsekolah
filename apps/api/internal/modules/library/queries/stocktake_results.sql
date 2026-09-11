-- Persisted stocktake reconciliation (migration 0098): Close writes one
-- row per anomalous copy here so the result survives the page being
-- closed, and the progress/report endpoints read it back.

-- name: InsertStocktakeResult :exec
insert into library_stocktake_results (tenant_id, stocktake_id, copy_id, outcome, found_location_id)
values ($1, $2, $3, $4, $5);

-- name: ListStocktakeResults :many
select * from library_stocktake_results where tenant_id = $1 and stocktake_id = $2 order by created_at;
