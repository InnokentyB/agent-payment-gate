import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, StrKey, xdr, hash } from '@stellar/stellar-sdk';
import { authDigest, externalSigner, authPayload, verifiedIdentity } from '../src/oz-auth.mjs';

test('OZ071: signature commits to selected rules, never just host payload', () => {
  const payload = Buffer.alloc(32, 7);
  const rules = xdr.ScVal.scvVec([xdr.ScVal.scvU32(1)]);
  assert.deepEqual(authDigest(payload, [1]), hash(Buffer.concat([payload, rules.toXDR()])));
  assert.notDeepEqual(authDigest(payload, [1]), authDigest(payload, [0]));
});
test('OZ071: payload uses External verifier/key and a signature verifiable by the agent public key', () => {
  const key = Keypair.random();
  const verifier = StrKey.encodeContract(Buffer.alloc(32, 3));
  const payload = authPayload(Buffer.alloc(32, 7), [1], verifier, key);
  const fields = new Map(payload.map.map(e => [e.key.sym.toString(), e.val]));
  assert.equal(fields.get('context_rule_ids').vec[0].u32, 1);
  const entry = fields.get('signers').map[0];
  assert.deepEqual(entry.key.toXDR(), externalSigner(verifier,key.rawPublicKey()).toXDR());
  assert(key.verify(authDigest(Buffer.alloc(32,7),[1]),entry.val.bytes.toBytes()));
});
test('identity gate rejects sandbox, pending, expired and client-provided approval', () => {
  const now=1000;
  for(const status of ['Not Started','In Progress','In Review','Declined']) {
    assert.throws(()=>verifiedIdentity({status,session_id:'s'}, {trustedServerRead:true, sandbox:false, now, expiresAt:2000}));
  }
  assert.throws(()=>verifiedIdentity({status:'Approved',session_id:'s'}, {trustedServerRead:false,sandbox:false,now,expiresAt:2000}));
  assert.throws(()=>verifiedIdentity({status:'Approved',session_id:'s'}, {trustedServerRead:true,sandbox:true,now,expiresAt:2000}));
  assert.throws(()=>verifiedIdentity({status:'Approved',session_id:'s'}, {trustedServerRead:true,sandbox:false,now,expiresAt:999}));
});
test('identity gate retains minimal provenance, no documents or biometrics', () => {
  const result=verifiedIdentity({status:'Approved',session_id:'s',id_verifications:[{document_number:'private'}]}, {trustedServerRead:true,sandbox:false,now:1000,expiresAt:2000});
  assert.deepEqual(result,{provider:'didit',sessionId:'s',verifiedAt:1000,expiresAt:2000});
});
test('OZ071 signed host entry uses contract credentials and correct expiration', async()=>{
  const {Address, Networks, authorizeEntry} = await import('@stellar/stellar-sdk');
  const {signAccountEntry}=await import('../src/oz-auth.mjs');
  const account=StrKey.encodeContract(Buffer.alloc(32,4));
  const verifier=StrKey.encodeContract(Buffer.alloc(32,3));
  const agent=Keypair.fromRawEd25519Seed(Buffer.alloc(32,2));
  const invocation=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({contractAddress:new Address(verifier).toScAddress(),functionName:'transfer',args:[]})),subInvocations:[]});
  const entry=new xdr.SorobanAuthorizationEntry({credentials:xdr.SorobanCredentials.sorobanCredentialsAddress(new xdr.SorobanAddressCredentials({address:new Address(account).toScAddress(),nonce:1n,signatureExpirationLedger:0,signature:xdr.ScVal.scvVoid()})),rootInvocation:invocation});
  const signed=await signAccountEntry(entry,{account,verifier,keypair:agent,ruleIds:[1],expirationLedger:123,networkPassphrase:Networks.TESTNET});
  assert.equal(signed.credentials.address.signatureExpirationLedger,123);
  assert.equal(entry.credentials.address.signatureExpirationLedger,0);
  const expected=await authorizeEntry(entry,async(_preimage,payload)=>({signatureScVal:authPayload(payload,[1],verifier,agent),address:account}),123,Networks.TESTNET,account);
  assert.deepEqual(signed.toXDR(),expected.toXDR());
  await assert.rejects(signAccountEntry(entry,{account:verifier,verifier,keypair:agent,ruleIds:[1],expirationLedger:123,networkPassphrase:Networks.TESTNET}));
});
test('testnet setup scopes rule to one token and encodes exact limits in canonical structs', async()=>{
  const {ruleArgs}=await import('../src/oz-config.mjs');
  const {scValToNative}=await import('@stellar/stellar-sdk');
  const contract=n=>StrKey.encodeContract(Buffer.alloc(32,n));
  const merchant=Keypair.random().publicKey();
  const args=ruleArgs({token:contract(4),recipient:merchant,agent:Keypair.random(),verifier:contract(3),spending:contract(5),recipientPolicy:contract(6),expires:1000});
  assert.equal(scValToNative(args[0])[0],'CallContract');
  assert.equal(scValToNative(args[0])[1],contract(4));
  assert.equal(scValToNative(args[2]),1000);
  const policies=scValToNative(args[4]);
  const spend=policies[contract(5)];
  assert.equal(spend.spending_limit,50_000_000n);
  const recipient=policies[contract(6)];
  assert.equal(recipient.per_payment,20_000_000n);
  assert.equal(recipient.recipient,merchant);
});
test('RPC cannot trick signer into approving a different call or additional child calls',async()=>{
  const {Address,Contract,Operation}=await import('@stellar/stellar-sdk');
  const {assertDirectInvocation}=await import('../src/oz-auth.mjs');
  const target=StrKey.encodeContract(Buffer.alloc(32,9));
  const op=new Contract(target).call('transfer',xdr.ScVal.scvU32(1));
  const fn=xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(op.body.invokeHostFunctionOp.hostFunction.invokeContract);
  const root=new xdr.SorobanAuthorizedInvocation({function:fn,subInvocations:[]});
  assert.doesNotThrow(()=>assertDirectInvocation({rootInvocation:root},op));
  assert.throws(()=>assertDirectInvocation({rootInvocation:root},new Contract(target).call('transfer',xdr.ScVal.scvU32(2))));
  assert.throws(()=>assertDirectInvocation({rootInvocation:new xdr.SorobanAuthorizedInvocation({function:fn,subInvocations:[root]})},op));
});
test('RPC V2 credentials preserve address-bound preimage and reject wrong account/source credentials',async()=>{
 const {Address,Networks,authorizeEntry}=await import('@stellar/stellar-sdk');
 const {signAccountEntry}=await import('../src/oz-auth.mjs');
 const account=StrKey.encodeContract(Buffer.alloc(32,4)),verifier=StrKey.encodeContract(Buffer.alloc(32,3));
 const keypair=Keypair.fromRawEd25519Seed(Buffer.alloc(32,2));
 const root=new xdr.SorobanAuthorizedInvocation({function:xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({contractAddress:new Address(account).toScAddress(),functionName:'add_context_rule',args:[]})),subInvocations:[]});
 const entry=new xdr.SorobanAuthorizationEntry({rootInvocation:root,credentials:xdr.SorobanCredentials.sorobanCredentialsAddressV2(new xdr.SorobanAddressCredentials({address:new Address(account).toScAddress(),nonce:2n,signatureExpirationLedger:0,signature:xdr.ScVal.scvVoid()}))});
 const opts={account,verifier,keypair,ruleIds:[0],expirationLedger:123,networkPassphrase:Networks.TESTNET};
 const signed=await signAccountEntry(entry,opts);
 let preimageType;const expected=await authorizeEntry(entry,async(preimage,payload)=>{preimageType=preimage.type;return{signatureScVal:authPayload(payload,[0],verifier,keypair),address:account}},123,Networks.TESTNET,account);
 assert.equal(preimageType,'envelopeTypeSorobanAuthorizationWithAddress');
 assert.equal(signed.credentials.type,'sorobanCredentialsAddressV2');assert.equal(signed.credentials.addressV2.signatureExpirationLedger,123);assert.equal(entry.credentials.addressV2.signatureExpirationLedger,0);assert.deepEqual(signed.toXDR(),expected.toXDR());
 await assert.rejects(signAccountEntry(entry,{...opts,account:verifier}));
 await assert.rejects(signAccountEntry(new xdr.SorobanAuthorizationEntry({rootInvocation:root,credentials:xdr.SorobanCredentials.sorobanCredentialsSourceAccount()}),opts));
});
