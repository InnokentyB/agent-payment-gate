import { createHash } from 'node:crypto';
import { Account, Asset, Keypair, Memo, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

// Fixed field order; unknown fields are rejected so nothing is unsigned.
const fields = ['id', 'agent', 'destination', 'amount', 'asset', 'network', 'expiresAt'];
export function payload(request) {
  if (!request || Object.keys(request).sort().join() !== [...fields].sort().join()) throw new Error('invalid schema');
  if (fields.some(k => typeof request[k] !== 'string')) throw new Error('invalid types');
  return Buffer.from(JSON.stringify(fields.map(k => [k, request[k]])));
}
export function signRequest(request, key) { return Buffer.from(key.sign(payload(request))).toString('base64'); }
export function digest(request) { return createHash('sha256').update(payload(request)).digest('hex'); }
export function stroops(amount) {
  if (typeof amount !== 'string' || !/^(0|[1-9]\d{0,9})(\.\d{1,7})?$/.test(amount)) throw new Error('invalid amount');
  const [whole, fractional = ''] = amount.split('.');
  return BigInt(whole) * 10000000n + BigInt(fractional.padEnd(7, '0'));
}

// One local process owns this prototype journal. Production needs atomic durable
// reservations and a wallet/contract that enforces the same policy.
export class Gate {
  constructor(policy, { now = () => Date.now(), journal = new Map() } = {}) {
    this.policy = policy; this.now = now; this.journal = journal;
  }
  evaluate(request, signature) {
    let hash;
    const block = reason => ({ decision: 'block', reason, execution: 'not_submitted', requestHash: hash ?? null, policyVersion: this.policy.version });
    try {
      hash = digest(request);
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(request.id)) return block('invalid_id');
      const identity = this.policy.agents[request.agent];
      if (!identity) return block('unknown_agent');
      if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature) || !Keypair.fromPublicKey(identity.publicKey).verify(payload(request), Buffer.from(signature, 'base64'))) return block('invalid_signature');
      if (request.network !== 'testnet' || request.asset !== 'XLM') return block('unsupported_network_or_asset');
      const expiry = Date.parse(request.expiresAt);
      if (!Number.isFinite(expiry) || expiry <= this.now() || expiry > this.now() + 300000) return block('invalid_expiry');
      const amount = stroops(request.amount);
      if (amount <= 0n || amount > stroops(this.policy.maxPayment)) return block('amount_limit');
      Keypair.fromPublicKey(request.destination);
      if (!this.policy.allowedDestinations.includes(request.destination)) return block('destination_not_allowed');
      // This is a local demo attestation, not real KYC or sanctions screening.
      if (!identity.verified || identity.attestationExpiresAt <= this.now()) return block('identity_not_verified');
      const nonce = `${request.agent}:${request.id}`;
      if (this.journal.has(nonce)) return block('replay');
      const receipt = { decision: 'allow', reason: 'policy_passed', execution: 'not_submitted', requestHash: hash, policyVersion: this.policy.version, network: 'testnet', id: request.id };
      this.journal.set(nonce, receipt);
      return receipt;
    } catch { return block('malformed_request'); }
  }
}

export function prepareEnvelope(request, receipt, { sourcePublicKey, sequence, now = Date.now() }) {
  if (receipt.decision !== 'allow' || receipt.requestHash !== digest(request)) throw new Error('request is not authorized');
  if (request.network !== 'testnet' || request.asset !== 'XLM' || Date.parse(request.expiresAt) <= now) throw new Error('invalid network or expired request');
  // Unsigned envelope only. A policy receipt is not a ledger payment receipt.
  return new TransactionBuilder(new Account(sourcePublicKey, sequence), { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: request.destination, asset: Asset.native(), amount: request.amount }))
    .addMemo(Memo.hash(Buffer.from(receipt.requestHash, 'hex')))
    .setTimebounds(Math.floor(now / 1000), Math.floor(Date.parse(request.expiresAt) / 1000))
    .build().toXDR();
}
