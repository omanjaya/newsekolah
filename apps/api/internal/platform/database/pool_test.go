package database

import (
	"testing"
	"time"
)

const testDSN = "postgres://u:p@localhost:5432/db"

func TestPoolConfigDefaults(t *testing.T) {
	cfg, err := poolConfig(testDSN)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.MaxConns != defaultMaxConns {
		t.Fatalf("MaxConns = %d, want %d", cfg.MaxConns, defaultMaxConns)
	}
	if cfg.MaxConnLifetime != defaultMaxConnLifetime || cfg.MaxConnIdleTime != defaultMaxConnIdleTime {
		t.Fatalf("lifetime/idle = %v/%v", cfg.MaxConnLifetime, cfg.MaxConnIdleTime)
	}
	if _, ok := cfg.ConnConfig.RuntimeParams["statement_timeout"]; ok {
		t.Fatal("statement_timeout must not be set unless requested")
	}
}

func TestPoolConfigDSNWinsOverDefaults(t *testing.T) {
	cfg, err := poolConfig(testDSN + "?pool_max_conns=7&pool_max_conn_idle_time=1m&statement_timeout=5000")
	if err != nil {
		t.Fatal(err)
	}
	if cfg.MaxConns != 7 || cfg.MaxConnIdleTime != time.Minute {
		t.Fatalf("DSN pool settings overridden: MaxConns=%d idle=%v", cfg.MaxConns, cfg.MaxConnIdleTime)
	}
	WithStatementTimeout(60 * time.Second)(cfg)
	if got := cfg.ConnConfig.RuntimeParams["statement_timeout"]; got != "5000" {
		t.Fatalf("statement_timeout = %q, want the DSN value 5000", got)
	}
}

func TestWithStatementTimeout(t *testing.T) {
	cfg, err := poolConfig(testDSN, WithStatementTimeout(60*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if got := cfg.ConnConfig.RuntimeParams["statement_timeout"]; got != "60000" {
		t.Fatalf("statement_timeout = %q, want 60000", got)
	}
}
