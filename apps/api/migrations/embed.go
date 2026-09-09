// Package migrations embeds the SQL migration files so cmd/migrate ships
// as a single binary with no external file dependency. go:embed cannot
// reach outside its own package directory, which is why this file lives
// here rather than under cmd/migrate.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
