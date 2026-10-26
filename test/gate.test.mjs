import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { Gate, prepareEnvelope, signRequest } from '../src/gate.mjs';
import { fixture } from '../src/fixture.mjs';
const now = Date.parse('2026-10-14T12:00:00Z');
function setup() { const f = fixture(now); return { ...f, gate: new Gate(f.policy, { now: () => now }) }; }
test('approved signed request creates the exact testnet payment and bound memo', () => {
  const f = setup(), receipt = f.gate.evaluate(f.request, signRequest(f.request, f.agent));
  assert.equal(receipt.decision, 'allow'); assert.equal(receipt.execution, 'not_submitted');
  const xdr = prepareEnvelope(f.request, receipt, { sourcePublicKey: f.wallet.publicKey(), sequence: '123', now });
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
  assert.equal(tx.sequence, '124'); assert.equal(tx.operations.length, 1);
  assert.equal(tx.operations[0].destination, f.request.destination);
  assert.equal(tx.operations[0].amount, f.request.amount);
  assert.equal(Buffer.from(tx.memo.value).toString('hex'), receipt.requestHash);
  assert.equal(tx.signatures.length, 0);
});
test('repeated signed invoice is blocked', () => {
  const f = setup(), sig = signRequest(f.request, f.agent);
  assert.equal(f.gate.evaluate(f.request, sig).decision, 'allow');
  assert.equal(f.gate.evaluate(f.request, sig).reason, 'replay');
});
test('tampering and impersonation are blocked', () => {
  const f = setup();
  assert.equal(f.gate.evaluate({ ...f.request, amount: '2' }, signRequest(f.request, f.agent)).reason, 'invalid_signature');
  assert.equal(f.gate.evaluate(f.request, signRequest(f.request, Keypair.random())).reason, 'invalid_signature');
});
for (const [name, patch, reason] of [
  ['excess payment', { amount: '5.0000001' }, 'amount_limit'],
  ['zero', { amount: '0' }, 'amount_limit'],
  ['negative', { amount: '-1' }, 'malformed_request'],
  ['precision', { amount: '1.00000001' }, 'malformed_request'],
  ['exponent', { amount: '1e2' }, 'malformed_request'],
  ['expired', { expiresAt: new Date(now - 1).toISOString() }, 'invalid_expiry'],
  ['too distant', { expiresAt: new Date(now + 600000).toISOString() }, 'invalid_expiry'],
  ['mainnet', { network: 'mainnet' }, 'unsupported_network_or_asset'],
  ['unapproved asset', { asset: 'USDC' }, 'unsupported_network_or_asset'],
  ['unknown identity', { agent: 'unknown' }, 'unknown_agent'],
  ['unapproved destination', { destination: Keypair.random().publicKey() }, 'destination_not_allowed'],
]) test(name, () => {
  const f = setup(), r = { ...f.request, ...patch };
  assert.equal(f.gate.evaluate(r, signRequest(r, f.agent)).reason, reason);
});
test('revoked or expired attestation fails closed', () => {
  for (const patch of [{ verified: false }, { attestationExpiresAt: now - 1 }]) {
    const f = setup(); Object.assign(f.policy.agents[f.request.agent], patch);
    assert.equal(f.gate.evaluate(f.request, signRequest(f.request, f.agent)).reason, 'identity_not_verified');
  }
});
test('malformed input and unsigned extra fields fail closed', () => {
  const f = setup();
  for (const r of [null, {}, { ...f.request, amount: 1 }, { ...f.request, extra: 'unbound' }]) assert.equal(f.gate.evaluate(r, '').decision, 'block');
});
test('blocked, altered, or expired requests cannot prepare an envelope', () => {
  const f = setup(), receipt = f.gate.evaluate(f.request, signRequest(f.request, f.agent));
  const args = { sourcePublicKey: f.wallet.publicKey(), sequence: '0', now };
  assert.throws(() => prepareEnvelope(f.request, { ...receipt, decision: 'block' }, args));
  assert.throws(() => prepareEnvelope({ ...f.request, amount: '2' }, receipt, args));
  assert.throws(() => prepareEnvelope(f.request, receipt, { ...args, now: now + 180000 }));
});
