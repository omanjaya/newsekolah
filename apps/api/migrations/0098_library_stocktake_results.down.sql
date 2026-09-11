drop table if exists library_stocktake_results;

alter table library_stocktakes
  drop column if exists mark_missing_as,
  drop column if exists misplaced_count,
  drop column if exists unexpected_count,
  drop column if exists missing_count;

drop index if exists ux_library_stocktake_scans_stocktake_copy;
alter table library_stocktake_scans add constraint library_stocktake_scans_stocktake_id_copy_id_key unique (stocktake_id, copy_id);
alter table library_stocktake_scans
  drop column if exists location_id,
  drop column if exists outcome;
alter table library_stocktake_scans alter column copy_id set not null;
alter table library_stocktake_scans rename column raw_code to barcode;
