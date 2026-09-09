# syntax=docker/dockerfile:1

FROM golang:1.26-alpine AS build
WORKDIR /src

RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY . .

ARG VERSION=dev
ENV CGO_ENABLED=0

RUN go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/api ./cmd/api
RUN go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/migrate ./cmd/migrate
RUN go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/worker ./cmd/worker
RUN go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/seed ./cmd/seed
RUN go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/bootstrap ./cmd/bootstrap
RUN go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/keygen ./cmd/keygen

FROM gcr.io/distroless/static-debian12:nonroot AS api
COPY --from=build /out/api /app/api
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app/api"]

FROM gcr.io/distroless/static-debian12:nonroot AS migrate
COPY --from=build /out/migrate /app/migrate
USER nonroot:nonroot
ENTRYPOINT ["/app/migrate"]

FROM gcr.io/distroless/static-debian12:nonroot AS worker
COPY --from=build /out/worker /app/worker
USER nonroot:nonroot
ENTRYPOINT ["/app/worker"]

FROM gcr.io/distroless/static-debian12:nonroot AS seed
COPY --from=build /out/seed /app/seed
USER nonroot:nonroot
ENTRYPOINT ["/app/seed"]

FROM gcr.io/distroless/static-debian12:nonroot AS bootstrap
COPY --from=build /out/bootstrap /app/bootstrap
USER nonroot:nonroot
ENTRYPOINT ["/app/bootstrap"]

FROM gcr.io/distroless/static-debian12:nonroot AS keygen
COPY --from=build /out/keygen /app/keygen
USER nonroot:nonroot
ENTRYPOINT ["/app/keygen"]
