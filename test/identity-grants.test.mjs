import test from 'node:test';
import assert from 'node:assert/strict';
import {Keypair,StrKey} from '@stellar/stellar-sdk';
import {credentialFromDecision,makeChallenge,bindWallet,proposeGrant,approveGrant,validateGrantEnvelope,canonicalDigest} from '../src/identity-grants.mjs';
const now=1000000;
const owner=Keypair.fromRawEd25519Seed(Buffer.alloc(32,21));
const agent=Keypair.fromRawEd25519Seed(Buffer.alloc(32,22));
const merchant=StrKey.encodeEd25519PublicKey(Buffer.alloc(32,23));
const contract=n=>StrKey.encodeContract(Buffer.alloc(32,n));
const signed=(key,data)=>Buffer.from(key.sign(Buffer.from(canonicalDigest(data),'hex'))).toString('base64');
const context={personId:'person-test',ownerRef:'pilot-owner',sessionId:'11111111-2222-4333-8444-555555555555',workflowId:'3d2c5f1e-04db-487f-92f5-f2955abc42ad',now,expiresAt:now+100000};
const decision={status:'APPROVED',approved:true,sessionId:context.sessionId,workflowId:context.workflowId,ownerRef:context.ownerRef};
const terms={id:'grant-test',account:contract(24),agentPublicKey:agent.publicKey(),token:contract(25),recipient:merchant,perPaymentUnits:'20000000',budgetUnits:'50000000',periodLedgers:17280,validUntilLedger:5000,expiresAt:now+50000};
function fixture(){const credential=credentialFromDecision(decision,context);const challenge=makeChallenge(credential,{ownerPublicKey:owner.publicKey(),nonce:'nonce-test',now});const proof=bindWallet(credential,challenge,signed(owner,challenge),{now});const grant=proposeGrant(credential,proof,terms,{now});const envelope=approveGrant(credential,proof,grant,signed(owner,grant),{now});return{credential,proof,grant,envelope};}
const request=f=>({state:{account:terms.account,agentRule:1,grantId:f.grant.id,grantDigest:canonicalDigest(f.grant),credentialDigest:canonicalDigest(f.credential),consentEnvelopeDigest:canonicalDigest(f.envelope)},ownerPublicKey:owner.publicKey(),agentPublicKey:agent.publicKey(),recipient:merchant,units:'10000000',token:terms.token,now,trustedCredential:f.credential});
test('identity+wallet+consent binds verified provider result to exact agent payment terms',()=>{const f=fixture();const valid=validateGrantEnvelope(f.envelope,request(f));assert.equal(valid.id,'grant-test');assert(!JSON.stringify(f).includes('biometric'));});
test('unapproved, mismatched or expired provider decisions do not produce credentials',()=>{for(const patch of [{status:'DECLINED',approved:false},{ownerRef:'other'},{sessionId:'other'},{workflowId:'other'}])assert.throws(()=>credentialFromDecision({...decision,...patch},context));assert.throws(()=>credentialFromDecision(decision,{...context,expiresAt:now}));});
test('wallet challenge cannot be swapped between identities, wallets or expired sessions',()=>{const f=fixture();assert.throws(()=>bindWallet({...f.credential,personId:'other'},f.proof.challenge,f.proof.signature,{now}));assert.throws(()=>bindWallet(f.credential,f.proof.challenge,signed(agent,f.proof.challenge),{now}));assert.throws(()=>bindWallet(f.credential,f.proof.challenge,f.proof.signature,{now:now+300001}));});
test('tampered consent and authority expansion are rejected',()=>{const f=fixture();for(const patch of [{recipient:agent.publicKey()},{budgetUnits:'99999999'},{account:contract(26)},{agentPublicKey:owner.publicKey()}])assert.throws(()=>validateGrantEnvelope({...f.envelope,grant:{...f.grant,...patch}},request(f)));});
test('grant rejects wrong agent/owner/account/token/recipient, limits and expiry',()=>{const f=fixture();for(const patch of [{ownerPublicKey:agent.publicKey()},{agentPublicKey:owner.publicKey()},{token:contract(26)},{recipient:owner.publicKey()},{units:'20000001'},{units:'0'},{units:'-1'},{now:terms.expiresAt}])assert.throws(()=>validateGrantEnvelope(f.envelope,{...request(f),...patch}));for(const state of [{account:terms.account,grantId:f.grant.id},{account:terms.account,agentRule:1,grantId:'other'},{account:contract(26),agentRule:1,grantId:f.grant.id,grantDigest:canonicalDigest(f.grant),credentialDigest:canonicalDigest(f.credential),consentEnvelopeDigest:canonicalDigest(f.envelope)}])assert.throws(()=>validateGrantEnvelope(f.envelope,{...request(f),state}));});
test('untrusted or stale credential snapshot cannot be replaced by caller assertion',()=>{const f=fixture();assert.throws(()=>validateGrantEnvelope(f.envelope,{...request(f),trustedCredential:undefined}));assert.throws(()=>validateGrantEnvelope(f.envelope,{...request(f),trustedCredential:{...f.credential,status:'DECLINED'}}));});
test('installation requires exact signed consent and its terms encode into OZ policies',async()=>{
 const {validateConsentForInstall}=await import('../src/identity-grants.mjs');
 const {ruleArgs}=await import('../src/oz-config.mjs');const {scValToNative}=await import('@stellar/stellar-sdk');
 const f=fixture();assert.equal(validateConsentForInstall(f.envelope,{account:terms.account,ownerPublicKey:owner.publicKey(),agentPublicKey:agent.publicKey(),token:terms.token,trustedCredential:f.credential,now}).id,terms.id);
 assert.throws(()=>validateConsentForInstall(f.envelope,{account:contract(27),ownerPublicKey:owner.publicKey(),agentPublicKey:agent.publicKey(),token:terms.token,trustedCredential:f.credential,now}));
 const args=ruleArgs({token:terms.token,recipient:merchant,agent,verifier:contract(27),spending:contract(28),recipientPolicy:contract(29),expires:500,budgetUnits:'30000000',perPaymentUnits:'10000000',periodLedgers:500});const policies=scValToNative(args[4]);assert.equal(policies[contract(28)].spending_limit,30000000n);assert.equal(policies[contract(29)].per_payment,10000000n);assert.equal(policies[contract(28)].period_ledgers,500);
});
test('verified wallet owner cannot be replaced by an untrusted proof metadata field',()=>{
 const f=fixture();const forged={...f.proof,ownerPublicKey:agent.publicKey()};
 assert.throws(()=>proposeGrant(f.credential,forged,terms,{now}));
 const forgedGrant={...f.grant,ownerPublicKey:agent.publicKey()};
 assert.throws(()=>approveGrant(f.credential,forged,forgedGrant,signed(agent,forgedGrant),{now}));
});
test('same grant ID with newly signed terms cannot masquerade as installed consent evidence',()=>{
 const f=fixture();const changed={...f.grant,expiresAt:f.grant.expiresAt-1};
 const replacement=approveGrant(f.credential,f.proof,changed,signed(owner,changed),{now});
 assert.throws(()=>validateGrantEnvelope(replacement,request(f)),/Installed grant evidence mismatch/);
});
