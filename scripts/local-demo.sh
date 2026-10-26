#!/bin/sh
set -eu
docker compose -f compose.contracts.yaml run --rm --no-deps contracts cargo test --locked -p gate-harness -- --test-threads=1 --nocapture
docker compose -f compose.contracts.yaml run --rm --no-deps client node scripts/testnet.mjs plan
