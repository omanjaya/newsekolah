-- name: GetLatestLibraryPolicy :one
select * from library_policies where tenant_id = $1 order by version desc limit 1;

-- name: CreateLibraryPolicy :exec
insert into library_policies (tenant_id, version, config, effective_from, created_by)
values ($1, $2, $3, $4, $5);

-- name: CreateTitle :one
insert into library_titles (
  tenant_id, control_number, title, subtitle, author, responsibility, additional_authors,
  publisher, publish_place, publish_year, edition, pages, illustration, dimensions,
  isbn, issn, ddc_number, call_number, classification, subjects, language, literary_form,
  target_audience, notes, abstract, material_type_id, is_opac, cover_asset_id
) values (
  sqlc.arg(tenant_id), sqlc.arg(control_number), sqlc.arg(title), sqlc.arg(subtitle), sqlc.arg(author),
  sqlc.arg(responsibility), sqlc.arg(additional_authors), sqlc.arg(publisher), sqlc.arg(publish_place),
  sqlc.narg(publish_year), sqlc.arg(edition), sqlc.arg(pages), sqlc.arg(illustration), sqlc.arg(dimensions),
  sqlc.arg(isbn), sqlc.arg(issn), sqlc.arg(ddc_number), sqlc.arg(call_number), sqlc.arg(classification),
  sqlc.arg(subjects), sqlc.arg(language), sqlc.arg(literary_form), sqlc.arg(target_audience), sqlc.arg(notes),
  sqlc.arg(abstract), sqlc.narg(material_type_id), sqlc.arg(is_opac), sqlc.narg(cover_asset_id)
)
returning *;

-- name: UpdateTitle :one
update library_titles set
  control_number = sqlc.arg(control_number), title = sqlc.arg(title), subtitle = sqlc.arg(subtitle),
  author = sqlc.arg(author), responsibility = sqlc.arg(responsibility), additional_authors = sqlc.arg(additional_authors),
  publisher = sqlc.arg(publisher), publish_place = sqlc.arg(publish_place), publish_year = sqlc.narg(publish_year),
  edition = sqlc.arg(edition), pages = sqlc.arg(pages), illustration = sqlc.arg(illustration), dimensions = sqlc.arg(dimensions),
  isbn = sqlc.arg(isbn), issn = sqlc.arg(issn), ddc_number = sqlc.arg(ddc_number), call_number = sqlc.arg(call_number),
  classification = sqlc.arg(classification), subjects = sqlc.arg(subjects), language = sqlc.arg(language),
  literary_form = sqlc.arg(literary_form), target_audience = sqlc.arg(target_audience), notes = sqlc.arg(notes),
  abstract = sqlc.arg(abstract), material_type_id = sqlc.narg(material_type_id), is_opac = sqlc.arg(is_opac),
  cover_asset_id = sqlc.narg(cover_asset_id)
where tenant_id = sqlc.arg(tenant_id) and id = sqlc.arg(id) and deleted_at is null
returning *;

-- name: GetTitle :one
select * from library_titles where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: GetTitleByISBN :one
select * from library_titles where tenant_id = $1 and isbn = $2 and isbn <> '' and deleted_at is null limit 1;

-- name: DeleteTitle :execrows
update library_titles set deleted_at = now() where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: ListTitles :many
select * from library_titles t
where t.tenant_id = $1 and t.deleted_at is null
  and (sqlc.narg(material_type_id)::uuid is null or t.material_type_id = sqlc.narg(material_type_id)::uuid)
  and (sqlc.narg(ddc_class)::text is null or t.ddc_number like sqlc.narg(ddc_class)::text || '%')
  and (
    sqlc.narg(availability_only)::bool is not true
    or exists (select 1 from library_copies c where c.tenant_id = t.tenant_id and c.title_id = t.id and c.status = 'available')
  )
  and (
    sqlc.narg(search)::text is null
    or (char_length(sqlc.narg(search)::text) >= 3 and t.search_vector @@ plainto_tsquery('simple', sqlc.narg(search)::text))
    or (char_length(sqlc.narg(search)::text) < 3 and (
      lower(t.title) like '%' || lower(sqlc.narg(search)::text) || '%'
      or lower(t.author) like '%' || lower(sqlc.narg(search)::text) || '%'
    ))
    or (sqlc.narg(search_isbn)::text is not null and t.isbn like sqlc.narg(search_isbn)::text || '%')
  )
order by
  (case when sqlc.narg(sort)::text = 'newest' then t.created_at end) desc nulls last,
  (case when sqlc.narg(sort)::text = 'newest' then null else t.title end) asc
limit $2 offset $3;

-- name: CountTitleCopies :one
select count(*)::int from library_copies where tenant_id = $1 and title_id = $2;

-- name: CountAvailableCopies :one
select count(*)::int from library_copies where tenant_id = $1 and title_id = $2 and status = 'available';

-- name: CreateCopy :one
insert into library_copies (
  tenant_id, title_id, accession_number, barcode, copy_number, call_number, category_id, location_id,
  source_id, partner_id, price, is_opac, rfid, access, condition, status, notes, acquired_on
) values (
  sqlc.arg(tenant_id), sqlc.arg(title_id), sqlc.arg(accession_number), sqlc.arg(barcode), sqlc.arg(copy_number),
  sqlc.arg(call_number), sqlc.narg(category_id), sqlc.narg(location_id), sqlc.narg(source_id), sqlc.narg(partner_id),
  sqlc.arg(price), sqlc.arg(is_opac), sqlc.arg(rfid), sqlc.arg(access), sqlc.arg(condition), sqlc.arg(status),
  sqlc.arg(notes), sqlc.narg(acquired_on)
)
returning *;

-- name: GetCopy :one
select * from library_copies where tenant_id = $1 and id = $2;

-- name: GetCopyByBarcode :one
select * from library_copies where tenant_id = $1 and barcode = $2;

-- name: FindCopyByCode :one
-- Matches barcode, accession number, or RFID tag, the same three columns
-- the old app searched (libOpsFindItemByCode).
select * from library_copies
where tenant_id = $1 and (barcode = $2 or accession_number = $2 or (rfid <> '' and rfid = $2))
limit 1;

-- name: ListCopiesForTitle :many
select * from library_copies where tenant_id = $1 and title_id = $2 order by barcode;

-- name: ListCopiesForStocktake :many
-- Every copy that could plausibly still be on the shelf: not on loan, and
-- not permanently removed from the collection (lost or donated away).
select * from library_copies
where tenant_id = $1 and status not in ('on_loan', 'lost', 'donated')
order by barcode;

-- name: ListCopiesFiltered :many
select * from library_copies c
where c.tenant_id = $1
  and (sqlc.narg(title_id)::uuid is null or c.title_id = sqlc.narg(title_id)::uuid)
  and (sqlc.narg(status)::text is null or c.status = sqlc.narg(status)::text)
  and (sqlc.narg(category_id)::uuid is null or c.category_id = sqlc.narg(category_id)::uuid)
  and (sqlc.narg(location_id)::uuid is null or c.location_id = sqlc.narg(location_id)::uuid)
  and (
    sqlc.narg(search)::text is null
    or c.barcode like '%' || sqlc.narg(search)::text || '%'
    or c.accession_number like '%' || sqlc.narg(search)::text || '%'
    or c.rfid like '%' || sqlc.narg(search)::text || '%'
    or exists (
      select 1 from library_titles t where t.id = c.title_id and lower(t.title) like '%' || lower(sqlc.narg(search)::text) || '%'
    )
  )
order by c.created_at desc
limit $2 offset $3;

-- name: UpdateCopyStatus :one
update library_copies set status = $3, condition = coalesce(sqlc.narg(condition)::text, condition)
where tenant_id = $1 and id = $2
returning *;

-- name: BulkUpdateCopyStatus :many
-- FOR UPDATE keeps a concurrent borrow from racing this bulk change; a
-- copy currently on loan is left untouched (its id just won't be part of
-- the returned set) rather than failing the whole batch.
with locked as (
  select id from library_copies
  where tenant_id = sqlc.arg(tenant_id) and id = any(sqlc.arg(ids)::uuid[]) and status != 'on_loan'
  for update
)
update library_copies c set status = sqlc.arg(status)
from locked
where c.id = locked.id and c.tenant_id = sqlc.arg(tenant_id)
returning c.*;

-- name: DeleteCopy :execrows
delete from library_copies where tenant_id = $1 and id = $2;

-- name: HasLoanHistory :one
select exists(select 1 from library_loans where tenant_id = $1 and copy_id = $2)::bool;

-- name: CreateItemEvent :exec
insert into library_item_events (tenant_id, copy_id, event_type, from_status, to_status, note, actor_user_id)
values ($1, $2, $3, $4, $5, $6, $7);

-- name: ListItemEvents :many
select * from library_item_events where tenant_id = $1 and copy_id = $2 order by created_at desc;

-- name: NextAccessionSequence :one
insert into library_accession_sequences (tenant_id, year, next_value)
values ($1, $2, 2)
on conflict (tenant_id, year) do update set next_value = library_accession_sequences.next_value + 1
returning (next_value - 1)::bigint;

-- name: NextBarcodeSequence :one
insert into library_barcode_sequences (tenant_id, next_value)
values ($1, 2)
on conflict (tenant_id) do update set next_value = library_barcode_sequences.next_value + 1
returning (next_value - 1)::bigint;

-- name: CreateLoan :one
insert into library_loans (tenant_id, copy_id, title_id, member_user_id, checked_out_by, borrowed_at, due_on, channel)
values ($1, $2, $3, $4, $5, $6, $7, $8)
returning *;

-- name: GetLoan :one
select * from library_loans where tenant_id = $1 and id = $2;

-- name: GetActiveLoanForCopy :one
select * from library_loans where tenant_id = $1 and copy_id = $2 and status = 'active';

-- name: CountActiveLoansForMember :one
select count(*)::int from library_loans where tenant_id = $1 and member_user_id = $2 and status = 'active';

-- name: ReturnLoan :one
update library_loans set status = 'returned', returned_at = $3, checked_in_by = $4, fine_amount = $5
where tenant_id = $1 and id = $2 and status = 'active'
returning *;

-- name: MarkLoanLost :one
update library_loans set status = 'lost', returned_at = $3, checked_in_by = $4, fine_amount = $5
where tenant_id = $1 and id = $2 and status = 'active'
returning *;

-- name: RenewLoan :one
update library_loans set due_on = $3, renewal_count = renewal_count + 1
where tenant_id = $1 and id = $2 and status = 'active'
returning *;

-- name: MarkLoanFinePaid :one
update library_loans set fine_paid_at = $3 where tenant_id = $1 and id = $2 returning *;

-- name: CreateCirculationEvent :one
-- Renamed from CreateItemEvent (circulation) to avoid colliding with the
-- catalogue's CreateItemEvent above: same library_item_events table, two
-- different write shapes (catalogue: status change audit; circulation:
-- borrow/return/renew/lost tied to a loan and member). Columns note and
-- actor_user_id are shared with the catalogue write path (migration 0097
-- unified the naming).
insert into library_item_events (tenant_id, copy_id, loan_id, member_user_id, event_type, note, actor_user_id)
values ($1, $2, sqlc.narg(loan_id)::uuid, sqlc.narg(member_user_id)::uuid, $3, $4, sqlc.narg(actor_user_id)::uuid)
returning *;

-- name: ListItemEventsForCopy :many
select * from library_item_events where tenant_id = $1 and copy_id = $2 order by created_at desc;

-- name: CreateLoanRenewal :one
insert into library_loan_renewals (tenant_id, loan_id, renewed_at, previous_due_on, new_due_on, renewed_by)
values ($1, $2, $3, $4, $5, $6)
returning *;

-- name: ListLoanRenewalsForLoan :many
select * from library_loan_renewals where tenant_id = $1 and loan_id = $2 order by renewed_at;

-- name: GetLoanByBarcode :one
-- Return-by-barcode (old app libraryReturnOneCode): the active loan on the
-- copy currently holding that barcode.
select l.* from library_loans l
join library_copies c on c.id = l.copy_id
where l.tenant_id = $1 and c.barcode = $2 and l.status = 'active';

-- name: ListLoansForMember :many
select * from library_loans
where tenant_id = $1 and member_user_id = $2 and (sqlc.arg(include_returned)::bool or status = 'active')
order by borrowed_at desc
limit $3 offset $4;

-- name: ListOverdueLoans :many
select * from library_loans
where tenant_id = $1 and status = 'active' and due_on < $2
order by due_on;

-- name: ListLoansInPeriod :many
select * from library_loans
where tenant_id = $1 and borrowed_at >= $2 and borrowed_at < $3
order by borrowed_at;

-- name: MostBorrowedTitles :many
select title_id, count(*)::int as loan_count
from library_loans
where tenant_id = $1 and borrowed_at >= $2 and borrowed_at < $3
group by title_id
order by loan_count desc
limit $4;

-- name: CreateReservation :one
insert into library_reservations (tenant_id, title_id, member_user_id, requested_at)
values ($1, $2, $3, $4)
returning *;

-- name: GetReservation :one
select * from library_reservations where tenant_id = $1 and id = $2;

-- name: ListReservationsForTitle :many
select * from library_reservations where tenant_id = $1 and title_id = $2 and status = 'waiting' order by requested_at;

-- name: ListReservationsForMember :many
select * from library_reservations where tenant_id = $1 and member_user_id = $2 order by requested_at desc;

-- name: MarkReservationReady :one
update library_reservations set status = 'ready', ready_at = $3, expires_at = $4, held_copy_id = $5
where tenant_id = $1 and id = $2 and status = 'waiting'
returning *;

-- name: FulfillReservation :one
update library_reservations set status = 'fulfilled', fulfilled_loan_id = $3
where tenant_id = $1 and id = $2
returning *;

-- name: CancelReservation :one
update library_reservations set status = 'cancelled', held_copy_id = null
where tenant_id = $1 and id = $2 and status in ('waiting', 'ready')
returning *;

-- name: GetReservationForHeldCopy :one
-- The ready reservation currently holding this copy, if any -- lets Borrow
-- tell whether a status='reserved' copy is being borrowed by the member it
-- was set aside for (regression fix, see migrations/0094).
select * from library_reservations where tenant_id = $1 and held_copy_id = $2 and status = 'ready';

-- name: ExpireReadyReservations :many
-- Ready holds past their expires_at, for the periodic expiry job
-- (old app: hourly job, library_circulation.go:1909-1993). copy_id lets
-- the caller release each held copy without a second lookup.
update library_reservations set status = 'expired'
where tenant_id = $1 and status = 'ready' and expires_at < $2
returning *;

-- name: CreateStocktake :one
insert into library_stocktakes (tenant_id, name, started_on, coordinator_user_id, notes)
values ($1, $2, $3, $4, $5)
returning *;

-- name: GetStocktake :one
select * from library_stocktakes where tenant_id = $1 and id = $2;

-- name: ListStocktakes :many
select * from library_stocktakes where tenant_id = $1 order by started_on desc limit $2 offset $3;

-- name: CloseStocktake :one
update library_stocktakes set
  status = 'closed', ended_on = $3, notes = $4,
  missing_count = $5, unexpected_count = $6, misplaced_count = $7, mark_missing_as = $8
where tenant_id = $1 and id = $2 and status = 'open'
returning *;

-- name: RecordStocktakeScan :one
insert into library_stocktake_scans (tenant_id, stocktake_id, copy_id, raw_code, outcome, location_id, scanned_at, scanned_by_user_id)
values (sqlc.arg(tenant_id), sqlc.arg(stocktake_id), sqlc.narg(copy_id), sqlc.arg(raw_code), sqlc.arg(outcome), sqlc.narg(location_id), sqlc.arg(scanned_at), sqlc.arg(scanned_by_user_id))
on conflict (stocktake_id, copy_id) where copy_id is not null
  do update set scanned_at = excluded.scanned_at, location_id = excluded.location_id, outcome = excluded.outcome
returning *;

-- name: ListStocktakeScans :many
select * from library_stocktake_scans where tenant_id = $1 and stocktake_id = $2 order by scanned_at;

-- name: CountStocktakeScans :one
select count(*)::int from library_stocktake_scans where tenant_id = $1 and stocktake_id = $2 and outcome = 'found';

-- name: SearchOpacTitlesShort :many
-- For a query under 3 characters: a plain LIKE over title/author, plus an
-- exact ISBN match, matching the old app's short-query fallback
-- (library_opac.go).
select * from library_titles
where tenant_id = $1 and deleted_at is null and is_opac
  and (sqlc.narg(classification_prefix)::text is null or classification like sqlc.narg(classification_prefix)::text || '%')
  and (sqlc.narg(material_type_id)::uuid is null or material_type_id = sqlc.narg(material_type_id)::uuid)
  and (
    sqlc.narg(search)::text is null
    or lower(title) like '%' || lower(sqlc.narg(search)::text) || '%'
    or lower(author) like '%' || lower(sqlc.narg(search)::text) || '%'
    or isbn = sqlc.narg(search)::text
  )
order by title
limit $2 offset $3;

-- name: SearchOpacTitlesFulltext :many
-- For a query of 3+ characters: Postgres fulltext against search_vector
-- (migrations/0094), the old app's MATCH AGAINST equivalent.
select * from library_titles
where tenant_id = $1 and deleted_at is null and is_opac
  and (sqlc.narg(classification_prefix)::text is null or classification like sqlc.narg(classification_prefix)::text || '%')
  and (sqlc.narg(material_type_id)::uuid is null or material_type_id = sqlc.narg(material_type_id)::uuid)
  and search_vector @@ plainto_tsquery('simple', sqlc.arg(search)::text)
order by ts_rank(search_vector, plainto_tsquery('simple', sqlc.arg(search)::text)) desc, title
limit $2 offset $3;

-- name: GetOpacTitle :one
select * from library_titles where tenant_id = $1 and id = $2 and deleted_at is null and is_opac;

-- name: ListOpacCopiesForTitle :many
select * from library_copies where tenant_id = $1 and title_id = $2 and is_opac order by barcode;

-- name: ListOpacNewestTitles :many
select * from library_titles where tenant_id = $1 and deleted_at is null and is_opac order by created_at desc limit $2;

-- name: ListOpacMostBorrowedTitles :many
select t.*, count(l.id)::int as loan_count
from library_titles t
join library_loans l on l.title_id = t.id
where t.tenant_id = $1 and t.deleted_at is null and t.is_opac
group by t.id
order by loan_count desc, t.title
limit $2;
