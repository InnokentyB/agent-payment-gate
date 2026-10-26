# Real browser testnet acceptance — 26 October 2026

PASS. Sandboxed Chromium clicked the actual English UI connected to the existing Docker demo server, with real Didit reads, owner demo signatures and Stellar testnet transactions. The local browser relay forwards unmodified HTTP to web:3157, modeling the SSH tunnel; no mock backend/response was used. Browser had no key or provider-secret mounts.

| Step | Result |
|---|---|
| Check Didit status | Authenticated refresh of the existing APPROVED session; no new biometric session created |
| Review and sign consent | Explicit checkbox, exact recipient,2XLM cap,5XLM budget, new grant/rule2 installed |
| Pay1XLM | SUCCESS ledger5396410 |
| Repeat same invoice | Same original receipt; no extra transfer |
| Pay2XLM boundary | SUCCESS ledger5396415 |
| Pay1XLM | SUCCESS ledger5396419 |
| Attempt2.0000001XLM | Client consent check rejects before send; journal PREPARATION_FAILED, no hash |
| Other recipient | Client consent check rejects before send; journal PREPARATION_FAILED, no hash |
| Spend4 then attempt2XLM | Deployed budget policy rejects in signed network preflight; no broadcast |
| Revoke | SUCCESS ledger5396424; payment disabled; reload still revoked |
| Next demo | UI Review new permission reconciles confirmed revoke, archives intent and prepares fresh UNSIGNED proposal; consent unchecked |

Independent read-only audit re-fetched all5 core transaction envelopes, verified hashes/network SUCCESS/ledgers, transfer terms, journal uniqueness, fresh token balances and missing removed rule (contract error3000). Audit: `../evidence/ui-testnet-2026-10-26/network-audit.json`.

Balances at acceptance: smart account6→2XLM; merchant10004→10008XLM; stranger unchanged10000XLM. Then a separate test-setup transfer added10 testXLM from existing fee wallet, confirmed hash `0e925788cb839ce07239911c49401af3dee41ec9413ce6f36dce2e44d7c95988`. UI readback now12XLM on account, rule remains revoked. Enough funds remain for another full demonstration.

Core hashes:
- Install: `e43aa746e5c947d6ae9722b5ff193ca6f7e04bad026089be073ef5d233d2d448`
- Pay1: `d746720695fe579aad3b5707a0c1c6f4ae173ef7166fdc7b9b3b5220165408c0`
- Pay2: `39b1dfa3175545639b43b923ac92fbfa2768e59c3151b06cfe3b3ec3d976b04b`
- Pay3: `aba92f152a348c762566863c77e7b172739f92079e0a2074481bf0e789d814dc`
- Revoke: `1dc41c7b02119a9504aea01f6c5c35f804e58a67f085f1e7204776331917e684`

Initial attempt stopped before grant/payment when a snapshot begun during a job returned its newly completed job label alongside older files. Captured regression RED, fixed by copying job/lock at snapshot start. Browser also waits on the exact job ID from the real POST response. Fresh58 Node checks PASS. Retained first attempt under evidence/attempt-1; it did not install a grant or pay. Completed run has zero JavaScript errors, desktop/mobile screenshots and no horizontal overflow.

Private consistent pre-run backup retained at `/runtime/backups/ui-live-20261026` inside the existing Docker volume; private grant/operation histories preserved. No mainnet, new paid KYC, external publication or submission. Real server still uses server-held test keys, not a browser wallet. Status refresh, consent expiry and fresh-permission budget must be explained honestly. Before presenting, check Didit status and review a fresh one-hour permission; never sign an expired proposal.

Live scripts have an explicit opt-in and an exclusive run.json checkpoint. Do not blindly rerun: they send real testnet payments. Standard npm test and synthetic browser suite do not invoke them. This report establishes automated real-browser acceptance, not owner visual UAT or competition eligibility.
