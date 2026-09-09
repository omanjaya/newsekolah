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
insert into library_loans (tenant_id, copy_id, title_id, member_user_id, checked_out_by, borrowed_at, due_on)
values ($1, $2, $3, $4, $5, $6, $7)
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
update library_reservations set status = 'ready', ready_at = $3, expires_at = $4
where tenant_id = $1 and id = $2 and status = 'waiting'
returning *;

-- name: FulfillReservation :one
update library_reservations set status = 'fulfilled', fulfilled_loan_id = $3
where tenant_id = $1 and id = $2
returning *;

-- name: CancelReservation :one
update library_reservations set status = 'cancelled'
where tenant_id = $1 and id = $2 and status in ('waiting', 'ready')
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
