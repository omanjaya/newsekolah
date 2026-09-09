COMPOSE=docker compose -f infra/docker/docker-compose.dev.yml

.PHONY: infra-up infra-down api-run api-test api-lint api-migrate api-gen web-dev mobile-dev seed

infra-up:
	$(COMPOSE) up -d --wait

infra-down:
	$(COMPOSE) down

api-run:
	cd apps/api && go run ./cmd/api

api-migrate:
	cd apps/api && go run ./cmd/migrate up

api-test:
	cd apps/api && go test ./...

api-lint:
	cd apps/api && golangci-lint run ./...

api-gen:
	cd apps/api && sqlc generate && go generate ./...

seed:
	cd apps/api && go run ./cmd/seed

web-dev:
	pnpm --filter @newsekolah/web dev

mobile-dev:
	pnpm --filter @newsekolah/mobile start
