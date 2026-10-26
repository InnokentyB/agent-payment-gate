# Testnet acceptance — 25 October 2026

PASS for the requested CLI/contract flow. **Agent permission is now revoked.** All application work ran in bounded Tower Docker. Only free Stellar testnet funds were used.

Account: `CBVSDZ7SP7FHB4FFXVX57WYNYFUG6GSENPBKDTDAZ2MJM2N6CPR3QG3N`.
Merchant: `GD65MLT2TBIDOWBDNQ4QBLF4N7FGPT777EL27T4AGXZAJLZYBY3VMXRZ`.

Existing demo owner key signed consent referencing the APPROVED Didit credential: native XLM, one merchant, 2 XLM per payment, 5 XLM per rolling 17280-ledger window, exact expiry ledger5389973 and additional local one-hour cutoff. This was demo-key signing, not an interactive browser wallet.

| Scenario | Observed |
|---|---|
| Owner-signed delegation | SUCCESS on ledger |
| First payment | 1 XLM SUCCESS, ledger5389287 |
| Same invoice repeated | Original receipt reused; no second transfer |
| Boundary payment | 2 XLM SUCCESS, ledger5389298 |
| Third payment | 1 XLM SUCCESS, ledger5389303 |
| Above single-payment cap | Client refusal; signed enforce-mode RPC simulation rejects contract code3905 |
| Other recipient | Client refusal; signed RPC simulation rejects code3904 |
| Budget: after spending4, attempt2 | Client contract preflight rejects; signed RPC simulation code3221 |
| Control before revoke | 1 XLM still ALLOWED in signed simulation |
| Owner revoke | SUCCESS on ledger |
| Same1 XLM after revoke | Client refuses; signed RPC simulation rejects removed rule, code3000 |

Negative transactions were not broadcast. They exercised deployed WASM through signed RPC enforcement simulations, not failed on-ledger transactions. Client denial records are PREPARATION_FAILED with no hash. The before/after revoke control isolates revocation from balance/budget exhaustion.

Independent token balance queries: account10→6 XLM; merchant10000→10004 XLM; stranger10000→10000 XLM. Denied attempts left balances unchanged. Fees were paid separately by the fee payer.

## Receipts

- Delegation: `9388f4591e2d7a84cc225030d808aa065056e42e14edbffa113b845710c19f8e`
- Payment1: `af2a44e60d11a7087371fc1a2766c0dedbff264201244f5811f84db3f705e790`
- Payment2: `5ff8adfa7b8195578da493d8dce6c335503ff39329c1d0fb85341ea93b0e51e8`
- Payment3: `5020cbcb176563bc37df5f61c0ce97c67b9e2f404980c0c6510c3dcd31627363`
- Revoke: `719fbba5578ecfb359bd306764e983051121bc48de1072deeaa85233dad37ad7`

Read-only acceptance audit re-fetched all14 upload/deploy/funding/delegation/payment/revoke transactions, verified SUCCESS and envelope hashes, checked payment ledgers, journal records, negative codes and balance arithmetic. PASS: `../evidence/testnet-2026-10-25/acceptance-audit.json`. Script: `../scripts/testnet-audit.mjs`, input directory `/evidence` mounted read-only into the testnet service.

## Fix and retained state

Live RPC returned address credentialsV2; the adapter initially rejected them before sending. Added a RED regression, support for both explicit address credential variants, preserved exact account checks and SDK address-bound preimage signing. Full Docker suite now53/53PASS. Rust source unchanged (previous16 signed host tests PASS). Original failed delegation intent was backed up privately with FAILED_BEFORE_SEND resolution before retry. Current original delegation marker remains retained as an operator hold; deployment state and confirmed revoke receipt establish current revocation. Do not blindly repeat delegate or remove the hold to create another grant.

Initial payment reads were UNKNOWN while RPC indexed results. Read-only reconciliation confirmed each original hash, with no resend. Journal activated on empty operation-state; pre-run private key backup, journal records, signed consent history and all volumes preserved. No persistent service started. Source remains an uncommitted working tree; source and WASM hash manifests identify this run.

Reusable KYC, global biometric uniqueness, browser-wallet UX, production readiness, submission and visual owner UAT remain outside this acceptance. No biometric templates or document images were stored on-chain or in evidence. No mainnet or new paid Didit check. Disk filled while saving the report; previously authorized unused build cache cleanup reclaimed2394940029 bytes without deleting runtime volumes, images or containers.
