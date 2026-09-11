-- Catalogue master data: material types, collection categories,
-- acquisition sources, partners, locations, and the read-only DDC class
-- list (migration 0095). Each of the five tenant-scoped tables gets the
-- same shape of CRUD the old app had per table (library_catalog.go).

-- Material types.

-- name: CreateMaterialType :one
insert into library_material_types (tenant_id, code, name, max_loan_items, max_loan_days, max_renewals, is_active, sort_order)
values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: UpdateMaterialType :one
update library_material_types set code = $3, name = $4, max_loan_items = $5, max_loan_days = $6,
  max_renewals = $7, is_active = $8, sort_order = $9
where tenant_id = $1 and id = $2
returning *;

-- name: GetMaterialType :one
select * from library_material_types where tenant_id = $1 and id = $2;

-- name: ListMaterialTypes :many
select * from library_material_types where tenant_id = $1 order by sort_order, name;

-- name: DeleteMaterialType :execrows
delete from library_material_types where tenant_id = $1 and id = $2;

-- name: CountMaterialTypeUsage :one
select count(*)::int from library_titles where tenant_id = $1 and material_type_id = $2 and deleted_at is null;

-- Collection categories.

-- name: CreateCollectionCategory :one
insert into library_collection_categories (tenant_id, code, name, is_active, sort_order)
values ($1, $2, $3, $4, $5)
returning *;

-- name: UpdateCollectionCategory :one
update library_collection_categories set code = $3, name = $4, is_active = $5, sort_order = $6
where tenant_id = $1 and id = $2
returning *;

-- name: GetCollectionCategory :one
select * from library_collection_categories where tenant_id = $1 and id = $2;

-- name: ListCollectionCategories :many
select * from library_collection_categories where tenant_id = $1 order by sort_order, name;

-- name: DeleteCollectionCategory :execrows
delete from library_collection_categories where tenant_id = $1 and id = $2;

-- name: CountCollectionCategoryUsage :one
select count(*)::int from library_copies where tenant_id = $1 and category_id = $2;

-- Acquisition sources.

-- name: CreateAcquisitionSource :one
insert into library_acquisition_sources (tenant_id, code, name, is_active, sort_order)
values ($1, $2, $3, $4, $5)
returning *;

-- name: UpdateAcquisitionSource :one
update library_acquisition_sources set code = $3, name = $4, is_active = $5, sort_order = $6
where tenant_id = $1 and id = $2
returning *;

-- name: GetAcquisitionSource :one
select * from library_acquisition_sources where tenant_id = $1 and id = $2;

-- name: ListAcquisitionSources :many
select * from library_acquisition_sources where tenant_id = $1 order by sort_order, name;

-- name: DeleteAcquisitionSource :execrows
delete from library_acquisition_sources where tenant_id = $1 and id = $2;

-- name: CountAcquisitionSourceUsage :one
select count(*)::int from library_copies where tenant_id = $1 and source_id = $2;

-- Partners.

-- name: CreatePartner :one
insert into library_partners (tenant_id, code, name, contact_name, phone, address, is_active, sort_order)
values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: UpdatePartner :one
update library_partners set code = $3, name = $4, contact_name = $5, phone = $6, address = $7, is_active = $8, sort_order = $9
where tenant_id = $1 and id = $2
returning *;

-- name: GetPartner :one
select * from library_partners where tenant_id = $1 and id = $2;

-- name: ListPartners :many
select * from library_partners where tenant_id = $1 order by sort_order, name;

-- name: DeletePartner :execrows
delete from library_partners where tenant_id = $1 and id = $2;

-- name: CountPartnerUsage :one
select count(*)::int from library_copies where tenant_id = $1 and partner_id = $2;

-- Locations.

-- name: CreateLocation :one
insert into library_locations (tenant_id, code, name, is_active, sort_order)
values ($1, $2, $3, $4, $5)
returning *;

-- name: UpdateLocation :one
update library_locations set code = $3, name = $4, is_active = $5, sort_order = $6
where tenant_id = $1 and id = $2
returning *;

-- name: GetLocation :one
select * from library_locations where tenant_id = $1 and id = $2;

-- name: ListLocations :many
select * from library_locations where tenant_id = $1 order by sort_order, name;

-- name: DeleteLocation :execrows
delete from library_locations where tenant_id = $1 and id = $2;

-- name: CountLocationUsage :one
select count(*)::int from library_copies where tenant_id = $1 and location_id = $2;

-- DDC classes: platform-wide, read-only.

-- name: ListDDCClasses :many
select * from library_ddc_classes order by code;
