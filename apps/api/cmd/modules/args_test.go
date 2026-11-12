package main

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseArgs(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want invocation
	}{
		{"list", []string{"list"}, invocation{action: actionList, modules: []string{}}},
		{"list with tenant after", []string{"list", "--tenant", "sion"}, invocation{action: actionList, modules: []string{}, tenant: "sion"}},
		{"tenant before command", []string{"--tenant", "sion", "list"}, invocation{action: actionList, modules: []string{}, tenant: "sion"}},
		{"tenant with equals", []string{"list", "--tenant=sion"}, invocation{action: actionList, modules: []string{}, tenant: "sion"}},
		{"single dash tenant", []string{"-tenant", "sion", "list"}, invocation{action: actionList, modules: []string{}, tenant: "sion"}},
		{"single dash tenant with equals", []string{"-tenant=sion", "list"}, invocation{action: actionList, modules: []string{}, tenant: "sion"}},
		{"enable one", []string{"enable", "library"}, invocation{action: actionEnable, modules: []string{"library"}}},
		{
			"disable several with tenant in between",
			[]string{"disable", "library", "--tenant", "sion", "grading"},
			invocation{action: actionDisable, modules: []string{"library", "grading"}, tenant: "sion"},
		},
		{"help flag", []string{"--help"}, invocation{help: true}},
		{"short help flag", []string{"-h"}, invocation{help: true}},
		{"help command", []string{"help"}, invocation{help: true}},
		{"help wins over a bad command", []string{"bogus", "-h"}, invocation{help: true}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseArgs(tt.args)
			require.NoError(t, err)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestParseArgsRejects(t *testing.T) {
	tests := []struct {
		name    string
		args    []string
		message string
	}{
		{"nothing", nil, "missing command"},
		{"only a tenant", []string{"--tenant", "sion"}, "missing command"},
		{"unknown command", []string{"toggle", "library"}, `unknown command "toggle"`},
		{"enable without modules", []string{"enable"}, "enable needs at least one module name"},
		{"disable without modules", []string{"disable", "--tenant", "sion"}, "disable needs at least one module name"},
		{"list with modules", []string{"list", "library"}, "list takes no module names"},
		{"unknown flag", []string{"list", "--force"}, `unknown flag "--force"`},
		{"tenant without value", []string{"list", "--tenant"}, "--tenant needs a tenant slug"},
		{"tenant followed by a flag", []string{"list", "--tenant", "--help"}, "--tenant needs a tenant slug"},
		{"empty tenant with equals", []string{"list", "--tenant="}, "--tenant needs a tenant slug"},
		{"blank tenant", []string{"list", "--tenant", "  "}, "--tenant needs a tenant slug"},
		{"tenant twice", []string{"list", "--tenant", "a", "--tenant=b"}, "--tenant given more than once"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := parseArgs(tt.args)
			var usageErr usageError
			require.True(t, errors.As(err, &usageErr), "want a usageError, got %v", err)
			require.Equal(t, tt.message, usageErr.msg)
		})
	}
}

// TestExecuteRejectsBeforeConnecting covers the invocations execute refuses
// without loading config or opening a pool: no DATABASE_URL is set, so
// reaching run() would fail with exit status 1 instead of 2.
func TestExecuteRejectsBeforeConnecting(t *testing.T) {
	t.Setenv("DATABASE_URL", "")

	tests := []struct {
		name       string
		args       []string
		wantStderr []string
	}{
		{"bad command line", []string{"enable"}, []string{"enable needs at least one module name", "usage:"}},
		{
			"unknown module",
			[]string{"disable", "library", "nope", "--tenant", "sion"},
			[]string{"unknown module(s): nope", "valid modules: library, discipline, grading,"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			code := execute(context.Background(), tt.args, &stdout, &stderr, slog.New(slog.DiscardHandler))
			require.Equal(t, exitUsage, code)
			require.Empty(t, stdout.String())
			for _, want := range tt.wantStderr {
				require.Contains(t, stderr.String(), want)
			}
		})
	}
}

func TestExecuteHelp(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := execute(context.Background(), []string{"--help"}, &stdout, &stderr, slog.New(slog.DiscardHandler))
	require.Equal(t, exitOK, code)
	require.Equal(t, usage, stdout.String())
	require.Empty(t, stderr.String())
}
