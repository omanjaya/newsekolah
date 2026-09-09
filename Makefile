COMPOSE=docker compose -f infra/docker/docker-compose.dev.yml
PROD_COMPOSE=docker compose -f infra/docker/docker-compose.prod.yml

.PHONY: infra-up infra-down api-run api-test api-lint api-migrate api-gen web-dev mobile-dev seed \
	prod-up prod-down prod-logs prod-backup prod-restore prod-update ci-emoji-check ci-migrations-check

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

# --- Self-host production stack (infra/README.md) ---

prod-up:
	$(PROD_COMPOSE) up -d --wait

prod-down:
	$(PROD_COMPOSE) down

prod-logs:
	$(PROD_COMPOSE) logs -f

prod-backup:
	$(PROD_COMPOSE) exec backup /usr/local/bin/backup.sh

prod-restore:
	bash infra/scripts/restore.sh $(ARGS)

prod-update:
	bash infra/scripts/update.sh

# --- Local mirrors of CI checks that need no toolchain beyond bash ---

ci-emoji-check:
	bash infra/scripts/check-no-emoji.sh

ci-migrations-check:
	bash infra/scripts/check-migrations.sh apps/api/migrations
