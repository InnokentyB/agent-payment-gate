> Latest: [testnet acceptance and receipts](TESTNET-ACCEPTANCE-2026-10-25.md). Payment/limits/revoke flow PASS; permission revoked. Earlier pending-network statements below are historical. Do not reinitialize the journal or repeat deployment.

# Identity, consent and payment integration — 25 October 2026

Current scope: local CLI implementation verified in Tower Docker; live settlement and owner acceptance remain pending.

## Implemented

Authenticated Didit decision retrieval returned APPROVED for the owner pilot. A minimal protected credential references the provider session, workflow and local person ID. No document images, face templates or biometric hashes are copied into project evidence or contracts. The person ID is an internal reference, not proof of worldwide identity uniqueness. Reusable KYC and cross-session biometric deduplication have not been exercised.

Wallet challenge signatures bind that credential to the demo owner key. A separate owner-signed consent fixes the account, agent, asset, recipient, payment cap, rolling budget, exact expiry ledger and local time cutoff. Current CLI consent signing uses an existing demo key; browser wallet authentication is future work. APPROVED alone grants no spending authority. Credential snapshots expire within 24 hours; this is not continuous provider revocation monitoring.

Delegation validates the signed consent and installs its exact terms. Payment validates credential, signatures and installed consent digests. History archives credential and consent records by content digest before updating active pointers. Files are protected locally, not independently attested by Didit or tamperproof against a filesystem administrator. The on-chain expiry is the signed ledger; the timestamp is an additional local cutoff only.

A separate SQLite operation journal reserves each invoice per testnet account before preparation, stores the signed envelope and hash before submission, and prevents repeated or concurrent local calls from generating another transaction. Unknown outcomes reconcile only by the original transaction hash; NOT_FOUND does not authorize resending. Changed invoice business terms fail closed. This is local journal protection, not global on-chain invoice uniqueness. Journal activation is explicit and blocks unresolved legacy pending state.

Review fixed owner-key metadata substitution in wallet proof, missing immutable consent history, approximate expiry mapping, and installed-consent digest mismatch. Delegation writes an intent before submission and blocks an unresolved retry; operator reconciliation is required. Funding, deployment and other administrative mutations are not covered by invoice idempotency.

## Verification and current runtime

Fresh offline Docker results: 52 Node tests and 16 signed Soroban host scenarios PASS. Independent focused review ran 22 tests before the final additional regressions; final full-suite evidence supersedes that count. Evidence is in ../evidence/integration-2026-10-25/ and ../evidence/payment-journal-2026-10-25/. Real two-process contention/crash recovery uses a synthetic payment adapter. Full CLI against a live RPC, uploaded WASM settlement, balance readback and owner UAT remain unverified.

Only the approved Didit result was refreshed into the protected credential registry. No actual consent proposal approval, delegation, journal activation, testnet deployment or payment occurred in this integration step. Existing keys and runtime volumes are preserved. The source is an uncommitted working tree on the original Git baseline; source-sha256.txt identifies checked files.

## Didit pricing checked 25 October

Reusable KYC is separately listed Free, automatically available after initial verification, with facial recognition and user consent on reuse: https://docs.didit.me/core-technology/reusable-kyc/overview . This reuse path was not tested here. Separate Biometric Authentication is a different product; do not infer its pricing from reusable KYC.

Initial checks currently have eligible-feature free quotas. Announced effective 1 November 2026: the 500-check allowance becomes $10 monthly credit (about 30 full ID checks); reuse of a verified person remains Free. Source: https://didit.me/blog/new-pricing-november-2026/ . Provider documentation does not establish quota-counter behavior for our specific account; inspect actual billing for that detail.
