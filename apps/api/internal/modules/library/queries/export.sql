-- Full-catalogue XLSX export (old app: library_catalog_v2.go's
-- exportLibraryCatalogXlsx): every title with its copy counts, and every
-- copy with its category/location/source names already joined in so the
-- service layer never has to N+1 master data lookups per row.

-- name: ListTitlesForExport :many
select sqlc.embed(t), coalesce(mt.code, '') as material_type_code,
  count(c.id)::int as total_copies,
  count(c.id) filter (where c.status = 'available')::int as available_copies
from library_titles t
left join library_material_types mt on mt.id = t.material_type_id
left join library_copies c on c.title_id = t.id
where t.tenant_id = $1 and t.deleted_at is null
group by t.id, mt.code
order by t.title;

-- name: ListCopiesForExport :many
select sqlc.embed(c), t.title as title_name, t.author as title_author,
  coalesce(cat.name, '') as category_name, coalesce(loc.name, '') as location_name, coalesce(src.name, '') as source_name
from library_copies c
join library_titles t on t.id = c.title_id
left join library_collection_categories cat on cat.id = c.category_id
left join library_locations loc on loc.id = c.location_id
left join library_acquisition_sources src on src.id = c.source_id
where c.tenant_id = $1
order by c.created_at;
