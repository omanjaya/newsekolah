-- Library dashboard: counts, recent activity, and a 30-day series. Member
-- and visit counts come from CountMembersTotal/CountActiveMembersTotal
-- (queries/reports_extra.sql) and TodayVisitSummary (queries/visits.sql).

-- name: CountTitlesActive :one
select count(*)::int from library_titles where tenant_id = $1 and deleted_at is null;

-- name: CountCopiesTotal :one
select count(*)::int from library_copies where tenant_id = $1;

-- name: CountCopiesByStatus :one
select count(*)::int from library_copies where tenant_id = $1 and status = $2;

-- name: CountLoansBetween :one
select count(*)::int from library_loans where tenant_id = $1 and borrowed_at >= $2 and borrowed_at < $3;

-- name: CountReturnsBetween :one
-- A lost loan also gets returned_at (the time it was closed) but the book
-- never came back, so only status 'returned' counts as a return.
select count(*)::int from library_loans where tenant_id = $1 and status = 'returned' and returned_at >= $2 and returned_at < $3;

-- name: SumUnpaidFines :one
-- Fines are tracked and settled on library_violations (migration 0091), the
-- same source as HasUnpaidFine; library_loans.fine_paid_at is never set.
select coalesce(sum(amount), 0)::int from library_violations where tenant_id = $1 and status = 'unpaid' and penalty = 'fine';

-- name: ListLatestLoans :many
select * from library_loans where tenant_id = $1 order by borrowed_at desc limit $2;

-- name: ListLongestOverdueLoans :many
select * from library_loans where tenant_id = $1 and status = 'active' and due_on < $2 order by due_on asc limit $3;

-- name: PopularTitlesAllTime :many
select title_id, count(*)::int as loan_count
from library_loans
where tenant_id = $1
group by title_id
order by loan_count desc
limit $2;

-- name: DailyLoansSeries :many
-- Days are the tenant's own calendar days (tz is its IANA zone), so a loan
-- at 07:30 in UTC+8 lands on that local day, not the previous UTC one.
select (borrowed_at at time zone sqlc.arg(tz)::text)::date as day, count(*)::int as loan_count
from library_loans
where tenant_id = sqlc.arg(tenant_id) and borrowed_at >= sqlc.arg(since)
group by day
order by day;

-- name: DailyReturnsSeries :many
-- Grouped by the tenant's calendar day, as DailyLoansSeries. Lost loans
-- are not returns (see CountReturnsBetween).
select (returned_at at time zone sqlc.arg(tz)::text)::date as day, count(*)::int as return_count
from library_loans
where tenant_id = sqlc.arg(tenant_id) and status = 'returned' and returned_at >= sqlc.arg(since)
group by day
order by day;
