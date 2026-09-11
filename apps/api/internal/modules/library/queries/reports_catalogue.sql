-- Catalogue-side accreditation summary and the accession register (Buku
-- Induk). Figures that need library_members/library_visits (students,
-- members, visits) are intentionally not queried here: those tables
-- belong to the circulation half of this module and do not exist in this
-- worktree; the service layer fills those fields with zero rather than
-- failing the whole report.

-- name: TitlesByDDCClass :many
select d.code, d.name, count(t.id)::int as title_count
from library_ddc_classes d
left join library_titles t
  on t.tenant_id = $1 and t.deleted_at is null and t.ddc_number <> '' and left(t.ddc_number, 1) = left(d.code, 1)
group by d.code, d.name
order by d.code;

-- name: ItemsByCategory :many
select cc.id, cc.code, cc.name, count(c.id)::int as item_count
from library_collection_categories cc
left join library_copies c on c.tenant_id = $1 and c.category_id = cc.id
where cc.tenant_id = $1
group by cc.id, cc.code, cc.name
order by cc.sort_order, cc.name;

-- name: ItemsByMaterialType :many
select mt.id, mt.code, mt.name, count(t.id)::int as title_count
from library_material_types mt
left join library_titles t on t.tenant_id = $1 and t.deleted_at is null and t.material_type_id = mt.id
where mt.tenant_id = $1
group by mt.id, mt.code, mt.name
order by mt.sort_order, mt.name;

-- name: FictionRatioCounts :one
select
  count(*) filter (where cc.code = 'fiksi')::int as fiction_count,
  count(*)::int as total_count
from library_copies c
left join library_collection_categories cc on cc.id = c.category_id
where c.tenant_id = $1;

-- name: CountTitlesAddedInPeriod :one
select count(*)::int from library_titles where tenant_id = $1 and created_at >= $2 and created_at < $3 and deleted_at is null;

-- name: CountActiveBorrowers :one
select count(distinct member_user_id)::int from library_loans where tenant_id = $1 and status = 'active';

-- name: CountOverdueNow :one
select count(*)::int from library_loans where tenant_id = $1 and status = 'active' and due_on < $2;

-- name: GetLastClosedStocktake :one
select * from library_stocktakes where tenant_id = $1 and status = 'closed' order by ended_on desc nulls last, updated_at desc limit 1;

-- name: ListLoansInPeriodWithTitle :many
select l.*, t.title as title_name
from library_loans l
join library_titles t on t.id = l.title_id
where l.tenant_id = $1 and l.borrowed_at >= $2 and l.borrowed_at < $3
order by l.borrowed_at;

-- name: ListCopiesAcquiredInPeriod :many
select * from library_copies
where tenant_id = $1 and acquired_on is not null and acquired_on >= $2 and acquired_on <= $3
order by acquired_on, accession_number;
