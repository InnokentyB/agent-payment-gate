import { Address, authorizeEntry, hash, xdr } from '@stellar/stellar-sdk';
// OpenZeppelin stellar-accounts =0.7.1; newer docs use a different digest.
export function authDigest(hostPayload, ruleIds) {
  if (hostPayload.length !== 32 || !ruleIds.length || ruleIds.some(id => !Number.isInteger(id) || id < 0 || id > 0xffffffff)) throw new Error('Invalid auth payload/rules');
  return hash(Buffer.concat([Buffer.from(hostPayload), xdr.ScVal.scvVec(ruleIds.map(id => xdr.ScVal.scvU32(id))).toXDR()]));
}
export function externalSigner(verifier, rawKey) {
  if (rawKey.length !== 32) throw new Error('Expected Ed25519 public key');
  return xdr.ScVal.scvVec([xdr.ScVal.scvSymbol('External'), new Address(verifier).toScVal(), xdr.ScVal.scvBytes(rawKey)]);
}
export function authPayload(hostPayload, ruleIds, verifier, keypair) {
  const signers = xdr.ScVal.scvMap([new xdr.ScMapEntry({key:externalSigner(verifier,keypair.rawPublicKey()),val:xdr.ScVal.scvBytes(keypair.sign(authDigest(hostPayload,ruleIds)))})]);
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol('context_rule_ids'),val:xdr.ScVal.scvVec(ruleIds.map(id=>xdr.ScVal.scvU32(id)))}),
    new xdr.ScMapEntry({key:xdr.ScVal.scvSymbol('signers'),val:signers}),
  ]);
}
// Internal assertion only, not a Didit client. Server must authenticate and bind its decision.
export function verifiedIdentity(decision, {trustedServerRead=false,sandbox=true,now=Date.now(),expiresAt}={}) {
  if (!trustedServerRead || sandbox || decision?.status !== 'Approved' || typeof decision.session_id !== 'string' || !decision.session_id || !Number.isFinite(expiresAt) || expiresAt <= now) throw new Error('Identity not verified for live delegation');
  return {provider:'didit',sessionId:decision.session_id,verifiedAt:now,expiresAt};
}
export async function signAccountEntry(entry, {account,verifier,keypair,ruleIds,expirationLedger,networkPassphrase}) {
  const credentials=entry.credentials;
  const addressCredentials=credentials.type==='sorobanCredentialsAddress'?credentials.address:credentials.type==='sorobanCredentialsAddressV2'?credentials.addressV2:null;
  if (!addressCredentials || Address.fromScAddress(addressCredentials.address).toString() !== account) throw new Error('Unexpected authorizing account');
  return authorizeEntry(entry, async (_preimage,payload)=>({signatureScVal:authPayload(payload,ruleIds,verifier,keypair),address:account}),expirationLedger,networkPassphrase,account);
}
// Refuse an RPC-provided authorization tree that differs from the user's exact call.
export function assertDirectInvocation(entry, operation) {
  const root=entry.rootInvocation;
  const expected=operation.body?.invokeHostFunctionOp?.hostFunction;
  if (root.function.type !== 'sorobanAuthorizedFunctionTypeContractFn' || expected?.type !== 'hostFunctionTypeInvokeContract' || root.subInvocations.length !== 0 || !Buffer.from(root.function.contractFn.toXDR()).equals(Buffer.from(expected.invokeContract.toXDR()))) throw new Error('Authorization tree does not match requested direct invocation');
}
