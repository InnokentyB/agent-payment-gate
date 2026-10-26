> 26 October update: real browser testnet acceptance PASS; see [report](UI-TESTNET-ACCEPTANCE-2026-10-26.md). Current account12XLM, agent revoked,58 Node checks PASS. Earlier synthetic-only acceptance below is historical.

# Demo screen — Tower, 25 October 2026

English demo UI is running at http://127.0.0.1:3157 on Tower. The UI serves the existing approved Didit pilot and deployed Stellar testnet account. It never creates a paid/new identity session automatically. Signing uses existing **server-held demo keys**, not a browser-wallet extension. No keys, document images or biometric templates are sent to the browser.

## Open from Mac

One-time connection, keep it open during the demo:

```sh
ssh -N -L 3157:127.0.0.1:3157 tower
```

Then open http://localhost:3157 . Keep local port3157: Host/Origin checks intentionally reject other hostnames and ports. No public endpoint was enabled. The presentation itself needs only the browser.

## Present the flow

1. **Check verification status** reads the existing Didit decision and renews the local credential for24hours. **Open Didit verification** opens the existing session, which may already show completion. A different participant/new KYC flow is outside this screen.
2. **Review new permission** prepares fresh exact terms. If the previous grant was revoked, the server first verifies its revoke receipt and missing rule against the network, then archives the old intent. It does not blindly remove a pending hold. Read recipient, keys,2XLM per payment,5XLM total, expiry ledger and one-hour local cutoff. Check consent and **Sign & grant permission**.
3. Enter1XLM, approved merchant, **Pay with agent**. Wait for Confirmed and transaction link. Amount2XLM is the boundary. Keep the same invoice and repeat to demonstrate receipt reuse without another payment. Click **New invoice** before testing different terms. Try2.0000001XLM and another recipient to show rejections. For budget rejection, spend1+2+1XLM under one grant, then attempt2XLM. There must be enough balance for the successful tests; currently account6XLM remains from the earlier acceptance run.
4. **Revoke permission** removes the rule on-chain. The payment button becomes unavailable. A later demo requires explicitly reviewing and signing a new permission, with its own5XLM allowance; this is shown on screen.

After creating a permission, identity refresh is disabled until revoke, since a new credential digest would invalidate the existing consent. Expired local credentials can be refreshed after revoke. Do not reuse an expired proposal: review a fresh one. Local time cutoff and exact on-chain ledger expiry are displayed separately during review.

**Check transaction status** performs read-only hash reconciliation, never a replacement send. The invoice stays in browser session storage across refresh. Pending outcomes disable new-payment/new-invoice controls. An interrupted mutation keeps a durable hold; the status button can reconcile the original administrative/payment outcome. Unresolved NOT_FOUND stays held. Unexpected administrative errors may still require operator investigation; do not delete state or create a replacement transaction.

## Operations — Docker only

From `/home/innokenty/projects/hackathons/hackmeridian-agent-gate`:

```sh
docker compose -f compose.contracts.yaml -f compose.web.yaml build web
docker compose -f compose.contracts.yaml -f compose.web.yaml up -d --no-build --wait web
docker compose -f compose.contracts.yaml -f compose.web.yaml ps
docker compose -f compose.contracts.yaml -f compose.web.yaml logs --tail=50 web
docker compose -f compose.contracts.yaml -f compose.web.yaml stop web
```

Health: http://127.0.0.1:3157/health . Stop only web; preserve other project services and every volume. No down-v or prune. Restore the reviewed previous image/source and restart web for code rollback; never roll transaction journals backwards to force a resend. A private pre-testnet key backup and immutable grant/receipt history already exist in runtime.

Web Dockerfile inherits the existing reviewed client image, installs no new packages, copies current src/scripts/web, creates a non-root writable UI-state directory. Compose restricts CPU1/memory512MiB/PIDs128, dropped capabilities, no-new-privileges, read-only root, bounded logs, loopback port. Only this demo workload mounts the required testnet keys, Didit secret and private state; no Docker socket or host-root mount. Child commands are fixed server-side, serialized with a persistent exclusive lock. HTTP mutations require same-origin CSRF token+HttpOnly SameSite cookie; DNS rebinding hostnames, arbitrary shell commands and static secret paths are rejected. This local owner console is not a publicly authenticated multi-user application.

Base `hackmeridian-contracts-client:latest` must already exist; its Dockerfile/build commands are in OZ-DOCKER-RUNBOOK.md. Browser checks reuse the existing reviewed `rolemorrow-browser-checks-browser:latest` image from the saved career project; source Dockerfile is `/home/innokenty/projects/nebius-career-search/Dockerfile.browser`. They use non-root Chromium with sandbox enabled and the copied browser-seccomp profile. No runtime credentials are mounted into browser tests.

## Verification and limits

- 57 Node checks PASS, including HTTP Origin/CSRF/Host checks, private data projection, persistent double-click/restart holds and unresolved recovery.
- Sandboxed Chromium synthetic journey PASS: Didit→reviewed consent→payment→same invoice reuse→cap/recipient rejection→revoke; desktop/mobile screenshots, no horizontal overflow or JS errors. Browser fixture is only imported by the check script; real server entry point cannot select it.
- Real API smoke: existing approved identity, revoked permission, actual7 journal records; fresh network balance read6XLM; old revoke independently reconciled and fresh **unsigned** proposal prepared. No extra payment or grant installation during UI acceptance.
- The real on-ledger payment/limits/revoke acceptance precedes this UI and is documented in TESTNET-ACCEPTANCE-2026-10-25.md. A full live browser signing/payment walkthrough still awaits the owner; browser regression uses synthetic funds/state, never overwrites private runtime.

Evidence: `evidence/ui-2026-10-25/`. Impeccable detector ran in degraded regex mode because optional parser packages are absent; its single font warning was addressed. Visual checks were desktop/mobile inspection plus one confirmation pass. No new provider identity session, public deployment, mainnet or submission occurred. Service intentionally remains running for the demo; no payment/background executor loop exists.
