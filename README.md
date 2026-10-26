# Agent Payment Gate

Identity-backed permission for agents to pay within limits on Stellar.

This single-owner prototype connects an existing Didit verification to separately signed owner consent, an OpenZeppelin smart-account rule, actual Stellar testnet payments and revocation. The English UI makes limits and receipts visible without a terminal.

## Review in two minutes

1. Open [the recorded demo page](docs/demo/index.html) from a static web server, or watch [demo.mp4](docs/demo/demo.mp4).
2. Read the [eight-slide PDF deck](docs/demo/pitch.pdf).
3. Verify the [recorded testnet proof](evidence/public/recorded-testnet-proof.json) and its transaction hashes on Stellar testnet.
4. Inspect `src/identity-grants.mjs`, `src/payment-operations.mjs`, `scripts/testnet.mjs`, and the Rust contracts under `contracts/`.

The static demo has no keys or write API. It clearly labels recorded evidence. The operational owner console is separate and must stay on localhost/SSH.

## Proven behavior

A real sandboxed browser checks Didit, reviews and signs a permission, pays1+2+1XLM, repeats an invoice without another transfer, rejects more than2XLM/another merchant/a payment beyond the5XLM budget, and revokes. Network receipts, transfer terms, balances and removed rule were independently re-read. Negative requests are refused before broadcast. Sixty-one Node checks and sixteen signed Soroban host scenarios pass. Browser wallet-extension signing and Reusable KYC are not claimed.

## Visible identity verification

The owner dashboard displays a masked document name derived from the bound APPROVED Didit API response, the actual document/liveness/face-match flags and the time of the last status read. It links to the existing verification session and the owner-only Didit console. Full names, document numbers, media URLs and session tokens are not returned by the dashboard API. Display metadata is stored separately from the consent credential and cannot grant payment authority. The static judge page contains a dated masked snapshot; private provider sessions are not published.

## Architecture and specification

- **Identity:** authenticated Didit decision, exact session/workflow/owner binding; minimal protected credential,24-hour local validity. No document images or biometric templates in the contracts or public evidence.
- **Owner intent:** signed wallet challenge and a separate signed consent binding account, agent, token, merchant, per-payment cap, rolling budget, exact expiry ledger and local time cutoff.
- **On-chain enforcement:** OpenZeppelin stellar-accounts0.7.1, smart account and Ed25519 verifier; rolling spending policy; custom recipient/per-payment policy; native XLM through its Stellar Asset Contract. Soroban SDK25.3.0; Cargo.lock required.
- **Payment operations:** mandatory invoice ID and SQLite reservation, one saved signed envelope/hash before send. Unknown results reconcile only by original hash; no blind replacement. This is local sender idempotency, not global on-chain invoice uniqueness.
- **Control:** owner removes the context rule; subsequent agent authorization fails. New permissions have new allowances and require a new explicit review/signature.

Proposed category fit is Genesis / Stellar Composed. The integration follows the official agent-wallet / OpenZeppelin-policy example. Didit is an external identity layer. Formal portal selection and event/prework eligibility remain organizer-owned facts.

## Run offline checks — Docker only

From this checkout on Linux amd64:

```sh
docker compose -f compose.contracts.yaml build client
docker compose -f compose.contracts.yaml run --rm --no-deps client npm test
```

The build downloads pinned npm dependencies; the test service itself has network disabled and needs no secret. Do not invoke live acceptance scripts as a routine test: they submit real testnet transactions and require explicit opt-in.

Rust integration and WASM build:

```sh
docker compose -f compose.contracts.yaml build fetch contracts
docker compose -f compose.contracts.yaml run --rm --no-deps fetch cargo fetch --locked
docker compose -f compose.contracts.yaml run --rm --no-deps contracts cargo test --locked -p gate-harness -- --test-threads=1
docker compose -f compose.contracts.yaml run --rm --no-deps contracts stellar contract build --locked
```

These commands use non-root bounded containers and project-specific caches. The reviewed scripts target only Stellar testnet, validate its passphrase, and refuse automatic resend. Keep all credentials outside source/images. Do not import mainnet keys, remove volumes or blindly rerun uncertain writes.

For the existing owner-run UI see [the runbook](docs/DEMO-UI-RUNBOOK.md). A new operator must supply their own Didit key/workflow and test-only runtime; private state is deliberately not included in this repository. Browser/media checks additionally require the reviewed artifact/browser images documented there; they are not needed for the Node/Rust checks above.

## Prework and event progress

14October2026: local signed-envelope prototype.24October: local OpenZeppelin preparation. During25–26October: Didit, wallet binding, explicit consent, durable invoice journal, testnet deployment/settlement, English UI and real-browser acceptance. The original pre-event baseline was commit `a816631920c093d8471d4e7a659937d00d8d360e`; this release is a clean source snapshot with dated evidence, not a claim that all code was built from scratch at the event. AI-assisted development was used.

## Scope

Single-owner demo using server-held test keys, not production custody or browser-wallet signing. No mainnet, fiat gateway, autonomous LLM purchasing agent, global biometric uniqueness or compliance certification. Customer use cases and stablecoin/merchant API integration are hypotheses or next steps, not traction or shipped capabilities. See [submission answers](docs/SUBMISSION-ANSWERS.md) for details.

## License

Original project code: [MIT](LICENSE), copyright2026InnokentyBodrov. OpenZeppelin-derived wrappers retain [their full MIT notice](contracts/LICENSE-OpenZeppelin) and [third-party attribution](contracts/THIRD-PARTY-NOTICES.md). Dependencies retain their own licenses.
