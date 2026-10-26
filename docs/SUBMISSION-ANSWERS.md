# Agent Payment Gate — submission answer bank

Copy-ready English answers. Category/track is proposed Genesis / Stellar Composed until the existing portal choice is confirmed. Exact portal field limits remain unverified; use the short or long version that fits. No public URL has been invented.

## Project name
Agent Payment Gate

## Tagline
Identity-backed permission for agents to pay within limits on Stellar.

## Short description
Agent Payment Gate connects a verified person to an explicit, signed spending permission. An agent can pay one approved merchant within per-payment and rolling budget limits enforced by an OpenZeppelin smart account on Stellar. The owner can revoke permission. The demo includes confirmed testnet payments, rejected requests and durable invoice receipts.

## Problem
As agents begin making purchases, a wallet key alone does not express the person's intent. A merchant needs to know that a person authorized the agent, the recipient and amount fit that authorization, and retries will not quietly create another payment. Giving an agent an unrestricted wallet makes that control difficult to explain and audit.

## Solution
A single-owner demo console links a server-verified Didit result to the demo owner's wallet through a signed challenge. The owner separately reviews and signs the exact account, agent, token, merchant, limits and expiry. The server installs the corresponding rule in an OpenZeppelin smart account. The agent then pays through that rule. A durable local invoice journal preserves the original transaction and receipt; uncertain outcomes reconcile by the original hash. The owner removes the rule to revoke authority.

## How Stellar is used
Soroban executes the smart account, Ed25519 verifier, rolling spending policy and custom recipient/per-payment policy. Native XLM is transferred through its Stellar Asset Contract on testnet. The Stellar SDK constructs, simulates, signs and submits transactions, verifies authorization trees and reconciles receipts. Stellar CLI builds the WASM artifacts. This is actual testnet settlement, not an unsigned envelope or an off-chain allow decision.

## Why Stellar Composed
The project combines OpenZeppelin's Stellar smart-account and policy components with Stellar's SDK, CLI and native asset contract, then adds Didit as an external identity-verification layer. This follows the track's agent-wallets-with-policy-limits example: identity establishes who is delegating, signed consent defines intent, account policies restrict execution, and Stellar supplies settlement. Formal category/track eligibility remains the organizer's decision.

## What works now
The English browser console checks an existing Didit verification, reviews and signs a new permission, pays an approved merchant, displays real transaction receipts and revokes permission. In the recorded acceptance, three payments of 1, 2 and 1 XLM settled. A repeated invoice reused the original receipt. A payment above 2 XLM, another recipient and a payment exceeding the 5 XLM cumulative budget were rejected without broadcast. The removed rule and balances were independently verified against testnet. Desktop and mobile flows were checked with Chromium sandbox enabled. Fifty-eight Node checks and sixteen existing signed Soroban host scenarios cover the supporting logic.

## Innovation
The contribution is the binding across identity, signed human intent, account policies and durable payment evidence. Verification alone cannot authorize spending. A signed permission alone cannot prove settlement. A successful transaction alone cannot make an application retry safe. The demo makes those separate boundaries visible and testable in one flow.

## Target users and value
The first target is builders of agent-operated purchasing workflows, such as paid APIs or merchant services. The human owner can review a narrow allowance, the merchant can inspect a real receipt, and the application has a stable invoice reference for uncertain outcomes. This is a working prototype and a customer-discovery hypothesis; no paying users or commercial traction are claimed.

## What was built before and during the event
Pre-event work: an initial local signed-envelope prototype on 14 October and local OpenZeppelin contract preparation on 24 October. During the 25–26 October event window: authenticated Didit session integration, wallet/credential binding, explicit signed consent, durable invoice journal and reconciliation, actual testnet deployment/settlement, English browser UI, and real-browser positive/negative/revocation acceptance. The 26 October run exposed a status-snapshot race; a failing regression was captured and fixed. Dated reports and transaction ledgers preserve this disclosure. We do not claim all code was created from scratch during the event or that preparation has automatically been accepted for scoring.

## Hardest technical challenge
Making the boundaries reliable across providers and the chain. A live RPC returned address-bound Soroban credentials V2 rather than the legacy variant used by the initial adapter. We added a regression and preserved exact signer/account/invocation checks while using the SDK's V2 preimage. Another challenge was avoiding a second payment after a timeout: the SQLite journal saves a single signed envelope and hash before submission and holds unknown results for read-only reconciliation.

## Limitations
This is a local, single-owner testnet demo using server-held demo keys. It is not a production identity or custody service, browser-wallet integration, fiat gateway, autonomous LLM purchasing agent or sanctions-compliance product. Didit document images and biometric templates are not put on-chain. Internal person IDs do not prove global biometric uniqueness. Reusable KYC was not exercised. Retry protection is scoped to the protected local invoice journal, not global on-chain invoice uniqueness. New permissions have new allowances; the UI makes that explicit. Production key custody, multi-user authentication, webhook revocation and a broader merchant/token policy need further work.

## Next steps
Connect an external wallet for owner signatures; add a credential-status/revocation service; design auditable multi-user key custody; add stablecoin and merchant API-payment integration; validate the workflow with potential agent-commerce users. These are planned, not implemented claims.

## Team
Innokenty Bodrov — solo builder. Team registration/name and captain status must be confirmed in the existing portal before final submission. AI-assisted development was used and is permitted by the official FAQ.

## Sixty-second pitch
Agents can already hold wallet keys. The harder question is what a real person allowed them to do.

Agent Payment Gate connects a Didit-verified person to a separately signed spending permission. An OpenZeppelin smart account on Stellar limits the agent to one merchant, two XLM per payment and a five-XLM budget. The owner can revoke that permission.

Our browser demo settles real testnet payments, rejects requests outside the permission, and returns the same receipt when an invoice is repeated. If a response is uncertain, we check the original transaction rather than sending a replacement.

The result is a focused prototype of identity-backed delegation with visible limits, real settlement and a human stop button.
