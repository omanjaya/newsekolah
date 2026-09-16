package main

import "github.com/google/uuid"

// IDMap resolves a source bigint id (the live schema's users.id,
// groups.id, subjects.id, rooms.id, and so on -- every primary key in the
// live database is a bigint) to the uuid.UUID it migrated to in the target
// tenant. Every migration step that creates or reuses a target row records
// the mapping here, so a later step (or a later ETL pass covering
// attendance, discipline, permits, grading, and library) can resolve a
// foreign key by source id without re-querying the target database. A
// migration step whose result needs more than an id -- a role slug, a grade
// level, a period's sequence -- uses its own small result struct instead
// (userMigrationResult, classMigrationResult, periodMigrationResult) keyed
// the same way, rather than forcing extra fields into IDMap itself.
type IDMap map[int64]uuid.UUID
