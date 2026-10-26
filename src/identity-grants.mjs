import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Keypair,Networks,StrKey} from '@stellar/stellar-sdk';
const domain='agent-payment-gate:v1';
function must(condition,message='Invalid identity or grant'){if(!condition)throw new Error(message);}
function canonical(value){if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;must(value!==undefined);return JSON.stringify(value);}
export function canonicalDigest(value){return createHash('sha256').update(canonical(value)).digest('hex');}
const positive=s=>typeof s==='string'&&/^[1-9][0-9]*$/.test(s)&&BigInt(s)<(1n<<127n);
function liveCredential(c,now){must(c?.version===1&&c.provider==='didit'&&c.status==='APPROVED'&&typeof c.personId==='string'&&c.personId&&typeof c.ownerRef==='string'&&c.ownerRef&&typeof c.sessionId==='string'&&c.sessionId&&typeof c.workflowId==='string'&&c.workflowId&&Number.isSafeInteger(c.verifiedAt)&&c.verifiedAt<=now&&Number.isSafeInteger(c.expiresAt)&&c.expiresAt>now);}
function verify(publicKey,payload,signature){must(StrKey.isValidEd25519PublicKey(publicKey));must(typeof signature==='string');const raw=Buffer.from(signature,'base64');must(raw.length===64&&Keypair.fromPublicKey(publicKey).verify(Buffer.from(canonicalDigest(payload),'hex'),raw),'Invalid wallet signature');}
// Internal trusted-server adapter boundary: callers must obtain decision via authenticated DiditClient.
export function credentialFromDecision(d,{personId,ownerRef,sessionId,workflowId,now=Date.now(),expiresAt}){
 must(d?.status==='APPROVED'&&d.approved===true&&d.sessionId===sessionId&&d.workflowId===workflowId&&d.ownerRef===ownerRef,'Identity not approved or not bound');
 const c={version:1,provider:'didit',personId,ownerRef,sessionId,workflowId,status:'APPROVED',verifiedAt:now,expiresAt};liveCredential(c,now);must(expiresAt<=now+86400000,'Credential lifetime too long');return c;
}
export function makeChallenge(credential,{ownerPublicKey,nonce,now=Date.now()}){
 liveCredential(credential,now);must(StrKey.isValidEd25519PublicKey(ownerPublicKey)&&typeof nonce==='string'&&nonce.length>0);
 return {domain,purpose:'bind-wallet',network:Networks.TESTNET,personId:credential.personId,credentialDigest:canonicalDigest(credential),ownerPublicKey,nonce,issuedAt:now,expiresAt:Math.min(now+300000,credential.expiresAt)};
}
export function bindWallet(credential,challenge,signature,{now=Date.now()}={}){
 liveCredential(credential,now);must(challenge?.domain===domain&&challenge.purpose==='bind-wallet'&&challenge.network===Networks.TESTNET&&challenge.personId===credential.personId&&challenge.credentialDigest===canonicalDigest(credential)&&challenge.issuedAt<=now&&challenge.expiresAt>now&&challenge.expiresAt<=challenge.issuedAt+300000,'Wallet challenge mismatch or expired');
 verify(challenge.ownerPublicKey,challenge,signature);return {challenge,signature,ownerPublicKey:challenge.ownerPublicKey};
}
function checkTerms(t,now,credential){must(typeof t.id==='string'&&t.id.length>0&&t.id.length<=128);must(StrKey.isValidContract(t.account)&&StrKey.isValidContract(t.token)&&StrKey.isValidEd25519PublicKey(t.agentPublicKey)&&(StrKey.isValidEd25519PublicKey(t.recipient)||StrKey.isValidContract(t.recipient)));must(positive(t.perPaymentUnits)&&positive(t.budgetUnits)&&BigInt(t.perPaymentUnits)<=BigInt(t.budgetUnits));must(Number.isSafeInteger(t.validUntilLedger)&&t.validUntilLedger>0&&t.validUntilLedger<=0xffffffff&&Number.isSafeInteger(t.periodLedgers)&&t.periodLedgers>0&&Number.isSafeInteger(t.expiresAt)&&t.expiresAt>now&&t.expiresAt<=credential.expiresAt,'Invalid grant limits or expiry');}
export function proposeGrant(credential,walletProof,terms,{now=Date.now()}={}){
 liveCredential(credential,now);const verifiedProof=bindWallet(credential,walletProof.challenge,walletProof.signature,{now});must(walletProof.ownerPublicKey===verifiedProof.ownerPublicKey,'Wallet owner metadata mismatch');checkTerms(terms,now,credential);
 must(Object.keys(terms).every(k=>['id','account','agentPublicKey','token','recipient','perPaymentUnits','budgetUnits','periodLedgers','validUntilLedger','expiresAt'].includes(k)),'Unknown grant field');
 return {domain,purpose:'authorize-agent',network:Networks.TESTNET,personId:credential.personId,credentialDigest:canonicalDigest(credential),ownerPublicKey:verifiedProof.ownerPublicKey,expiryMode:'exact-ledger-with-local-cutoff',actions:['stellar.transfer'],issuedAt:now,...terms};
}
export function approveGrant(credential,walletProof,grant,signature,{now=Date.now()}={}){
 const expected=proposeGrant(credential,walletProof,Object.fromEntries(['id','account','agentPublicKey','token','recipient','perPaymentUnits','budgetUnits','periodLedgers','validUntilLedger','expiresAt'].map(k=>[k,grant[k]])),{now:grant.issuedAt});
 must(canonicalDigest(expected)===canonicalDigest(grant)&&grant.issuedAt<=now,'Consent fields changed');verify(grant.ownerPublicKey,grant,signature);liveCredential(credential,now);checkTerms(grant,now,credential);return {credential,walletProof,grant,signature};
}
export function validateGrantEnvelope(envelope,{state,ownerPublicKey,agentPublicKey,recipient,units,token,now=Date.now(),trustedCredential}){
 must(trustedCredential&&canonicalDigest(envelope.credential)===canonicalDigest(trustedCredential),'Untrusted credential snapshot');
 const {credential,walletProof,grant,signature}=envelope;approveGrant(credential,walletProof,grant,signature,{now});
 must(state.grantDigest===canonicalDigest(grant)&&state.credentialDigest===canonicalDigest(credential)&&state.consentEnvelopeDigest===canonicalDigest(envelope),'Installed grant evidence mismatch');
 must(state.account===grant.account&&state.grantId===grant.id&&Number.isSafeInteger(state.agentRule)&&state.agentRule>0,'Grant not materialized on this account');
 must(ownerPublicKey===grant.ownerPublicKey&&agentPublicKey===grant.agentPublicKey&&recipient===grant.recipient&&token===grant.token,'Payment outside grant scope');
 must(positive(units)&&BigInt(units)<=BigInt(grant.perPaymentUnits),'Payment exceeds grant');return grant;
}
export async function validatePaymentGrant(options){
 const path=options.grantPath||'/grants/active-grant.json';const trustedPath=options.credentialPath||'/grants/identity-credential.json';
 let envelope,trustedCredential;try{envelope=JSON.parse(await readFile(path,'utf8'));trustedCredential=JSON.parse(await readFile(trustedPath,'utf8'));}catch{throw new Error('Missing or invalid approved identity grant');}
 return validateGrantEnvelope(envelope,{...options,trustedCredential});
}
export function validateConsentForInstall(envelope,{account,ownerPublicKey,agentPublicKey,token,trustedCredential,now=Date.now()}){
 must(trustedCredential&&canonicalDigest(trustedCredential)===canonicalDigest(envelope.credential),'Untrusted credential snapshot');
 const {credential,walletProof,grant,signature}=envelope;approveGrant(credential,walletProof,grant,signature,{now});
 must(grant.account===account&&grant.ownerPublicKey===ownerPublicKey&&grant.agentPublicKey===agentPublicKey&&grant.token===token,'Consent does not match installation account');return grant;
}
