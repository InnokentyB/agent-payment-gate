// Owner-operated pilot. Refresh only reads Didit. Consent uses demo wallet only after digest confirmation.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Asset,Keypair,Networks} from '@stellar/stellar-sdk';
import {DiditClient} from '../src/didit-client.mjs';
import {archiveGrantRecord} from '../src/grant-history.mjs';
import {credentialFromDecision,makeChallenge,bindWallet,proposeGrant,approveGrant,canonicalDigest} from '../src/identity-grants.mjs';
const command=process.argv[2]||'status';
const grantRuntime=process.env.GRANT_RUNTIME||'/runtime';
const walletRuntime=process.env.WALLET_RUNTIME||'/wallet';
const identityRuntime=process.env.DIDIT_RUNTIME||'/identity';
const read=async name=>JSON.parse(await readFile(`${grantRuntime}/${name}.json`,'utf8'));
const save=async(name,value)=>{const tmp=`${grantRuntime}/${name}.${randomUUID()}.tmp`;await writeFile(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(tmp,`${grantRuntime}/${name}.json`);};
try {
 if(command==='refresh'){
  const config={};for(const line of(await readFile('/run/secrets/didit.env','utf8')).split(/\r?\n/)){const m=line.match(/^(DIDIT_API_KEY|DIDIT_WORKFLOW_ID)=(.*)$/);if(m)config[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
  const pilot=JSON.parse(await readFile(`${identityRuntime}/didit-pilot.json`,'utf8'));if(pilot.phase!=='CREATED')throw new Error('Identity pilot is not resolved');
  const client=new DiditClient({apiKey:config.DIDIT_API_KEY,workflow:config.DIDIT_WORKFLOW_ID});const decision=await client.decision(pilot.session);
  if(decision.status!=='APPROVED'||!decision.approved){await save('identity-credential',{version:1,provider:'didit',status:decision.status,authorityGranted:false});throw new Error('Identity is not approved; existing local authority blocked');}
  let person;try{person=await read('person');}catch(e){if(e.code!=='ENOENT')throw e;person={personId:randomUUID(),ownerRef:decision.ownerRef};await save('person',person);}
  if(person.ownerRef!==decision.ownerRef)throw new Error('Identity owner mismatch');
  const now=Date.now();const credential=credentialFromDecision(decision,{...person,sessionId:decision.sessionId,workflowId:decision.workflowId,now,expiresAt:now+86400000});await archiveGrantRecord(grantRuntime,'credentials',credential);await save('identity-credential',credential);await save('identity-display',{version:1,provider:'didit',credentialDigest:canonicalDigest(credential),checkedAt:now,...(decision.display||{})});
  console.log(JSON.stringify({status:'APPROVED',personReferenceSaved:true,credentialDigest:canonicalDigest(credential),expiresAt:credential.expiresAt,authorityGranted:false}));
 }else if(command==='propose'){
  const credential=await read('identity-credential');
  const deployment=JSON.parse(await readFile(`${walletRuntime}/deployment.json`,'utf8'));
  if(!deployment.account)throw new Error('No deployed testnet account; proposal cannot be finalized');
  if(deployment.agentRule!==undefined)throw new Error('Existing delegation must be inspected/revoked before replacement');
  const seeds=JSON.parse(await readFile(`${walletRuntime}/keys.json`,'utf8'));const owner=Keypair.fromSecret(seeds.owner),agent=Keypair.fromSecret(seeds.agent),merchant=Keypair.fromSecret(seeds.merchant);
  const validUntilLedger=Number(process.argv[3]);if(!Number.isSafeInteger(validUntilLedger)||validUntilLedger<=0)throw new Error('Explicit valid-until ledger required');const now=Date.now();const challenge=makeChallenge(credential,{ownerPublicKey:owner.publicKey(),nonce:randomUUID(),now});
  const proofSignature=Buffer.from(owner.sign(Buffer.from(canonicalDigest(challenge),'hex'))).toString('base64');
  const walletProof=bindWallet(credential,challenge,proofSignature,{now});
  const grant=proposeGrant(credential,walletProof,{id:randomUUID(),account:deployment.account,agentPublicKey:agent.publicKey(),token:Asset.native().contractId(Networks.TESTNET),recipient:merchant.publicKey(),perPaymentUnits:'20000000',budgetUnits:'50000000',periodLedgers:17280,validUntilLedger,expiresAt:Math.min(now+3600000,credential.expiresAt)},{now});
  await save('consent-proposal',{credential,walletProof,grant});
  console.log(JSON.stringify({demoWallet:true,onChainExpiry:'Exact signed ledger; expiresAt is local cutoff only',grant,consentDigest:canonicalDigest(grant),authorityGranted:false},null,2));
 }else if(command==='approve'){
  const digest=process.argv[3];if(!/^[a-f0-9]{64}$/.test(digest||''))throw new Error('Explicit reviewed consent digest required');
  const proposal=await read('consent-proposal');const credential=await read('identity-credential');if(canonicalDigest(credential)!==canonicalDigest(proposal.credential)||canonicalDigest(proposal.grant)!==digest)throw new Error('Consent proposal changed');
  const seeds=JSON.parse(await readFile(`${walletRuntime}/keys.json`,'utf8'));const owner=Keypair.fromSecret(seeds.owner);
  const signature=Buffer.from(owner.sign(Buffer.from(digest,'hex'))).toString('base64');
  const envelope=approveGrant(credential,proposal.walletProof,proposal.grant,signature);await archiveGrantRecord(grantRuntime,'consents',envelope);await save('active-grant',envelope);
  console.log(JSON.stringify({consentSigned:true,grantId:envelope.grant.id,onChainInstalled:false,paymentSubmitted:false}));
 }else if(command==='status'){
  let credential;try{credential=await read('identity-credential');}catch(e){if(e.code!=='ENOENT')throw e;}
  let grant;try{grant=await read('active-grant');}catch(e){if(e.code!=='ENOENT')throw e;}
  console.log(JSON.stringify({identityStatus:credential?.status||'NOT_REFRESHED',identityCurrent:credential?.expiresAt>Date.now(),signedConsentPresent:!!grant,grantCurrent:grant?.grant?.expiresAt>Date.now(),onChainInstalled:'UNKNOWN',paymentSubmitted:false}));
 }else throw new Error('Unknown identity command');
}catch(error){const messages=['Identity pilot is not resolved','Identity is not approved; existing local authority blocked','Identity owner mismatch','No deployed testnet account; proposal cannot be finalized','Existing delegation must be inspected/revoked before replacement','Explicit reviewed consent digest required','Consent proposal changed','Unknown identity command','Explicit valid-until ledger required'];console.error(messages.includes(error.message)||/^Didit HTTP \d+$/.test(error.message)?error.message:'Identity/consent step failed closed; details suppressed');process.exitCode=1;}
