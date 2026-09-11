-- Copy helpers that don't belong in the base library_copies CRUD in
-- library.sql: bulk lookup for stocktake reconciliation, and dedupe
-- lookups used by catalogue search and import.

-- name: GetCopiesByIDs :many
select * from library_copies where tenant_id = $1 and id = any(sqlc.arg(ids)::uuid[]);

-- name: FindTitleForDedupe :many
-- Import/lookup dedupe: an ISBN match first, falling back to an exact
-- title+author match (old app: normalize ISBN, then LOWER(title)= and
-- LOWER(main_author)=).
select * from library_titles
where tenant_id = $1 and deleted_at is null
  and (
    (sqlc.narg(isbn)::text is not null and isbn = sqlc.narg(isbn)::text and isbn <> '')
    or (lower(title) = lower(sqlc.arg(title)) and lower(author) = lower(sqlc.arg(author)))
  )
limit 5;
