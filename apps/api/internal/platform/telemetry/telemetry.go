// Package telemetry sets up structured logging and (optionally) OpenTelemetry
// tracing. Every other package receives a *slog.Logger through its
// constructor; nothing but this package touches slog.SetDefault or the
// otel global providers.
package telemetry

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.34.0"
	"go.opentelemetry.io/otel/trace"
)

// NewLogger returns the process-wide JSON slog logger.
func NewLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(os.Stdout, nil))
}

// TracerProvider wraps an OpenTelemetry tracer provider so callers do not
// need to know whether tracing is active; Shutdown is always safe to call.
type TracerProvider struct {
	provider *sdktrace.TracerProvider // nil when tracing is disabled
}

// NewTracerProvider returns a no-op provider when otlpEndpoint is empty
// (the default for self-hosted schools that run no observability stack),
// or a real OTLP/HTTP exporter otherwise.
func NewTracerProvider(ctx context.Context, otlpEndpoint, serviceName, serviceVersion string) (*TracerProvider, error) {
	if otlpEndpoint == "" {
		return &TracerProvider{}, nil
	}

	exporter, err := otlptracehttp.New(ctx, otlptracehttp.WithEndpointURL(otlpEndpoint))
	if err != nil {
		return nil, fmt.Errorf("create otlp exporter: %w", err)
	}

	res, err := resource.New(ctx, resource.WithAttributes(
		semconv.ServiceName(serviceName),
		semconv.ServiceVersion(serviceVersion),
	))
	if err != nil {
		return nil, fmt.Errorf("build otel resource: %w", err)
	}

	provider := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(provider)

	return &TracerProvider{provider: provider}, nil
}

func (t *TracerProvider) Tracer(name string) trace.Tracer {
	if t.provider == nil {
		return otel.Tracer(name) // the global no-op tracer
	}
	return t.provider.Tracer(name)
}

func (t *TracerProvider) Shutdown(ctx context.Context) error {
	if t.provider == nil {
		return nil
	}
	return t.provider.Shutdown(ctx)
}
