package main

import (
	"fmt"
	"strings"
)

type action string

const (
	actionList    action = "list"
	actionEnable  action = "enable"
	actionDisable action = "disable"
)

// invocation is one parsed command line.
type invocation struct {
	action  action
	modules []string
	tenant  string
	help    bool
}

const usage = `usage:
  modules list [--tenant <slug>]
  modules enable <module>... [--tenant <slug>]
  modules disable <module>... [--tenant <slug>]

Lists, enables or disables a school's feature modules directly in the
database. --tenant names the school by slug; it may be left out when the
database holds exactly one tenant.
`

// usageError is a command line the operator has to fix; it exits 2 with
// the usage text.
type usageError struct{ msg string }

func (e usageError) Error() string { return e.msg }

func usageErrorf(format string, args ...any) error {
	return usageError{msg: fmt.Sprintf(format, args...)}
}

// parseArgs reads the command line by hand rather than with the flag
// package, which stops at the first positional argument: an operator
// writes `disable library --tenant x` as naturally as
// `--tenant x disable library`, so --tenant is accepted anywhere, as
// `--tenant x`, `--tenant=x`, or with a single dash like Go's own flags.
func parseArgs(args []string) (invocation, error) {
	var inv invocation
	var positional []string
	tenantSet := false
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "-h" || arg == "--help" || arg == "help":
			return invocation{help: true}, nil
		case arg == "--tenant" || arg == "-tenant":
			if i+1 >= len(args) {
				return invocation{}, usageErrorf("%s needs a tenant slug", arg)
			}
			i++
			if err := setTenant(&inv, &tenantSet, args[i]); err != nil {
				return invocation{}, err
			}
		case strings.HasPrefix(arg, "--tenant=") || strings.HasPrefix(arg, "-tenant="):
			_, value, _ := strings.Cut(arg, "=")
			if err := setTenant(&inv, &tenantSet, value); err != nil {
				return invocation{}, err
			}
		case strings.HasPrefix(arg, "-"):
			return invocation{}, usageErrorf("unknown flag %q", arg)
		default:
			positional = append(positional, arg)
		}
	}
	if err := setCommand(&inv, positional); err != nil {
		return invocation{}, err
	}
	return inv, nil
}

// setCommand takes the command and its module names from the positional
// arguments.
func setCommand(inv *invocation, positional []string) error {
	if len(positional) == 0 {
		return usageErrorf("missing command")
	}
	inv.action = action(positional[0])
	inv.modules = positional[1:]
	switch inv.action {
	case actionList:
		if len(inv.modules) > 0 {
			return usageErrorf("list takes no module names")
		}
	case actionEnable, actionDisable:
		if len(inv.modules) == 0 {
			return usageErrorf("%s needs at least one module name", inv.action)
		}
	default:
		return usageErrorf("unknown command %q", positional[0])
	}
	return nil
}

func setTenant(inv *invocation, tenantSet *bool, value string) error {
	if *tenantSet {
		return usageErrorf("--tenant given more than once")
	}
	value = strings.TrimSpace(value)
	if value == "" || strings.HasPrefix(value, "-") {
		return usageErrorf("--tenant needs a tenant slug")
	}
	inv.tenant = value
	*tenantSet = true
	return nil
}
