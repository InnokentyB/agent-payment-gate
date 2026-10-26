import { Keypair } from '@stellar/stellar-sdk';
export function fixture(now = Date.now()) {
  // Ephemeral demo keys never leave memory; no funded wallet secrets are used.
  const agent = Keypair.random(), wallet = Keypair.random(), merchant = Keypair.random();
  const request = { id: 'invoice-001', agent: 'procurement-agent', destination: merchant.publicKey(), amount: '1.2500000', asset: 'XLM', network: 'testnet', expiresAt: new Date(now + 120000).toISOString() };
  const policy = { version: 'demo-2026-10-14', maxPayment: '5', allowedDestinations: [merchant.publicKey()], agents: { 'procurement-agent': { publicKey: agent.publicKey(), verified: true, attestationExpiresAt: now + 300000 } } };
  return { agent, wallet, merchant, request, policy };
}
