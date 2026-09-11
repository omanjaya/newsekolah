-- name: GetLatestLibraryPolicy :one
select * from library_policies where tenant_id = $1 order by version desc limit 1;

-- name: CreateLibraryPolicy :exec
insert into library_policies (tenant_id, version, config, effective_from, created_by)
values ($1, $2, $3, $4, $5);

-- name: CreateTitle :one
insert into library_titles (tenant_id, title, subtitle, author, publisher, publish_year, isbn, classification, language, cover_asset_id)
values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
returning *;

-- name: UpdateTitle :one
update library_titles set title = $3, subtitle = $4, author = $5, publisher = $6, publish_year = $7,
  isbn = $8, classification = $9, language = $10, cover_asset_id = $11
where tenant_id = $1 and id = $2 and deleted_at is null
returning *;

-- name: GetTitle :one
select * from library_titles where tenant_id = $1 and id = $2 and deleted_at is null;

-- name: ListTitles :many
select * from library_titles
where tenant_id = $1 and deleted_at is null
  and (sqlc.narg(search)::text is null or lower(title) like '%' || lower(sqlc.narg(search)::text) || '%'
    or lower(author) like '%' || lower(sqlc.narg(search)::text) || '%' or isbn = sqlc.narg(search)::text)
order by title
limit $2 offset $3;

-- name: CountTitleCopies :one
select count(*)::int from library_copies where tenant_id = $1 and title_id = $2;

-- name: CountAvailableCopies :one
select count(*)::int from library_copies where tenant_id = $1 and title_id = $2 and status = 'available';

-- name: CreateCopy :one
insert into library_copies (tenant_id, title_id, barcode, condition, notes, acquired_on)
values ($1, $2, $3, $4, $5, $6)
returning *;

-- name: GetCopy :one
select * from library_copies where tenant_id = $1 and id = $2;

-- name: GetCopyByBarcode :one
select * from library_copies where tenant_id = $1 and barcode = $2;

-- name: ListCopiesForTitle :many
select * from library_copies where tenant_id = $1 and title_id = $2 order by barcode;

-- name: ListCopiesForStocktake :many
-- Every copy not currently on loan is expected on the shelf during a stocktake.
select * from library_copies where tenant_id = $1 and status != 'on_loan' order by barcode;

-- name: UpdateCopyStatus :one
update library_copies set status = $3, condition = coalesce(sqlc.narg(condition)::text, condition)
where tenant_id = $1 and id = $2
returning *;

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

-- name: CreateItemEvent :one
insert into library_item_events (tenant_id, copy_id, loan_id, member_user_id, event_type, notes, created_by)
values ($1, $2, sqlc.narg(loan_id)::uuid, sqlc.narg(member_user_id)::uuid, $3, $4, sqlc.narg(created_by)::uuid)
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
update library_stocktakes set status = 'closed', ended_on = $3, notes = $4
where tenant_id = $1 and id = $2 and status = 'open'
returning *;

-- name: RecordStocktakeScan :one
insert into library_stocktake_scans (tenant_id, stocktake_id, copy_id, barcode, scanned_at, scanned_by_user_id)
values ($1, $2, $3, $4, $5, $6)
on conflict (stocktake_id, copy_id) do update set scanned_at = excluded.scanned_at
returning *;

-- name: ListStocktakeScans :many
select * from library_stocktake_scans where tenant_id = $1 and stocktake_id = $2 order by scanned_at;

-- name: SearchOpacTitlesShort :many
-- For a query under 3 characters: a plain LIKE over title/author, plus an
-- exact ISBN match, matching the old app's short-query fallback
-- (library_opac.go).
select * from library_titles
where tenant_id = $1 and deleted_at is null and is_opac
  and (sqlc.narg(classification_prefix)::text is null or classification like sqlc.narg(classification_prefix)::text || '%')
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
