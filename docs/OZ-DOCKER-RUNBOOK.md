> Latest: [testnet acceptance and receipts](TESTNET-ACCEPTANCE-2026-10-25.md). Payment/limits/revoke flow PASS; permission revoked. Earlier pending-network statements below are historical. Do not reinitialize the journal or repeat deployment.

# Agent Payment Gate: OpenZeppelin local/testnet runbook

Run from `/home/innokenty/projects/hackathons/hackmeridian-agent-gate` on Tower. All project commands below execute in Linux amd64 Docker. This is a CLI/contract preparation package, not a deployed service or complete identity product. Read `OZ-LOCAL-SPEC.md` for scenarios and source baseline.

## Build and verify offline

```sh
docker compose -f compose.contracts.yaml build fetch contracts client
docker compose -f compose.contracts.yaml run --rm --no-deps fetch cargo fetch --locked
docker compose -f compose.contracts.yaml run --rm --no-deps contracts cargo test --locked -- --test-threads=1
docker compose -f compose.contracts.yaml run --rm --no-deps contracts stellar contract build --locked
docker compose -f compose.contracts.yaml run --rm --no-deps client npm test
docker compose -f compose.contracts.yaml run --rm --no-deps client node scripts/testnet.mjs plan
```

`fetch` alone has download access; `contracts` and `client` have network disabled. First fetch produces Cargo.lock only when intentionally updating the lock. Keep the checked-in lock: newer dalek3 resolves under an upstream broad bound but is incompatible with the host's rand_core. The lock selects dalek2.2.0.

WASM files: `contracts/target/wasm32v1-none/release/gate_{account,recipient_policy,spending_policy,verifier}.wasm`. These are compiled artifacts, not live contract addresses. Normal tests execute the actual Rust contracts in Soroban host Env with real Ed25519 auth and synthetic token balances. They do not exercise uploaded WASM in a network RPC.

Resources: 2 CPUs/6GiB/256 PIDs for Rust, 1 CPU/512MiB/128 PIDs for Node, non-root uid1000, dropped capabilities, no privilege escalation, bounded logs, no ports published. Egress network `hackmeridian-contracts_default`, subnet `10.231.123.0/28`. Cache and testnet runtime use project-specific named volumes. Preserve them.

## Runtime health / lifecycle

There is no persistent server: no `up -d` is needed. Health is a passing contract suite plus `node scripts/testnet.mjs plan`. Inspect `docker compose -f compose.contracts.yaml ps -a`; logs while a job is running: `docker compose -f compose.contracts.yaml logs --tail=50`. Stop an interrupted job: `docker compose -f compose.contracts.yaml stop`; remove stopped task containers/network: `docker compose -f compose.contracts.yaml down`. Never use `down -v` or volume prune. All normal jobs use `run --rm`.

## Identity, consent and testnet release

Current implementation and acceptance limits: [integration report](INTEGRATION-2026-10-25.md). Didit pilot is APPROVED. Consent approval, journal activation, delegation and payment have not been executed. Preserve existing keys and all runtime volumes; back up private runtime before any release. Never commit backups or print secrets.

Offline identity status:

```sh
docker compose -f compose.contracts.yaml -f compose.identity.yaml run --rm --no-deps consent
```

The identity-refresh service in that overlay reads the existing session using its private provider key; it makes a provider request. Credentials expire within 24 hours. Normal tests need no provider key.

After backup and reconciliation of any legacy pending.json, explicit offline journal activation:

```sh
docker compose -f compose.contracts.yaml --profile setup run --rm --no-deps journal-admin node scripts/testnet.mjs journal-init
```

Legacy pending state blocks activation. Preserve operation-state and demo-state together. Never delete a hold to force retry.

Future network commands require ALLOW_TESTNET=yes and the live profile. Existing keys are testnet-only. Run fund, deploy and seed-account individually only for a reviewed release. These administrative operations are not invoice-idempotent: inspect pending.json, deployment state and transaction hash after uncertainty; never blindly retry.

After deployment, offline consent proposal requires an explicit future ledger:

```sh
docker compose -f compose.contracts.yaml -f compose.identity.yaml run --rm --no-deps consent node scripts/identity-consent.mjs propose VALID_UNTIL_LEDGER
```

Review account, owner, agent, recipient, asset, cap, budget and expiry. Signing uses the existing demo owner key, not a browser wallet. After owner reviews those exact terms:

```sh
docker compose -f compose.contracts.yaml -f compose.identity.yaml run --rm --no-deps consent node scripts/identity-consent.mjs approve REVIEWED_DIGEST
```

Install with testnet delegate. Old delegate-demo is retired. An unresolved delegation intent blocks subsequent attempts and requires operator reconciliation; replacing a completed grant also requires inspecting that intent and revocation. No automatic replacement is provided. On-chain expiry is the exact signed ledger; timestamp expiry is an additional local cutoff.

After journal activation and successful delegation, payment syntax is:

```sh
ALLOW_TESTNET=yes docker compose -f compose.contracts.yaml --profile live run --rm --no-deps testnet node scripts/testnet.mjs pay --invoice-id demo-invoice-001 --amount-units 10000000 --recipient MERCHANT_PUBLIC_ADDRESS
```

Use a stable business invoice ID. Integer10000000=1XLM; default cap2XLM and rolling budget5XLM. Budget is per account/rule/token; owner administration remains unrestricted. Do not reset allowances with duplicate rules.

Receipt inspection and read-only reconciliation:

```sh
docker compose -f compose.contracts.yaml --profile setup run --rm --no-deps journal-admin node scripts/testnet.mjs operation status demo-invoice-001
ALLOW_TESTNET=yes docker compose -f compose.contracts.yaml --profile live run --rm --no-deps testnet node scripts/testnet.mjs operation reconcile demo-invoice-001
```

UNKNOWN/NOT_FOUND retains the hold, never permission to build another transaction. Verify network SUCCESS and independent balances before claiming settlement. Live positive/negative paths, revoke and owner UAT remain pending. No biometric data goes on-chain and the internal person ID does not prove global identity uniqueness.
