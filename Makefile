.PHONY: build test clean fmt lint check all install dev

# ============ COMBINED ============
all: contracts-check frontend-lint

install: contracts-install frontend-install

dev:
	pnpm dev

# ============ CONTRACTS ============
contracts-build:
	cd contracts && cargo build --release

contracts-build-wasm:
	cd contracts && cargo build --release --target wasm32-unknown-unknown

contracts-test:
	cd contracts && cargo test

contracts-test-odra:
	cd contracts && cargo odra test

contracts-fmt:
	cd contracts && cargo fmt

contracts-fmt-check:
	cd contracts && cargo fmt -- --check

contracts-lint:
	cd contracts && cargo clippy -- -D warnings

contracts-check:
	cd contracts && cargo check

contracts-clean:
	cd contracts && cargo clean
	rm -rf contracts/wasm/
	rm -rf contracts/.odra/

contracts-install:
	cargo install odra-cli

contracts-odra-build:
	cd contracts && cargo odra build

contracts-deploy-testnet:
	cd contracts && cargo odra deploy --network casper-test

# ============ FRONTEND ============
frontend-install:
	pnpm install

frontend-dev:
	pnpm dev

frontend-build:
	pnpm --filter frontend build

frontend-lint:
	pnpm --filter frontend lint

frontend-clean:
	rm -rf frontend/.next
	rm -rf frontend/node_modules

# ============ CLEANUP ============
clean: contracts-clean frontend-clean
	rm -rf node_modules
