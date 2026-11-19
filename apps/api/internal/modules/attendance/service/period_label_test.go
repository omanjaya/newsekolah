package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPeriodLabel(t *testing.T) {
	t.Parallel()

	assert.Equal(t, "Jam 1 – Jam 11", periodLabel("Jam 1", "Jam 11"), "a span joins its ends with a spaced en dash")
	assert.Equal(t, "Jam 3", periodLabel("Jam 3", "Jam 3"), "one period reads once")
	assert.Equal(t, "Jam 3", periodLabel("Jam 3", ""), "a missing end reads as the start alone")
}
