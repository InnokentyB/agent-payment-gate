import {readFile,writeFile,rename,mkdir,unlink} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {Keypair} from '@stellar/stellar-sdk';
import {canonicalDigest} from './identity-grants.mjs';
import {PaymentJournal,publicOperation} from './payment-operations.mjs';
const exec=promisify(execFile);
const read=async p=>{try{return JSON.parse(await readFile(p,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}};
const save=async(p,v)=>{const t=`${p}.${randomUUID()}.tmp`;await writeFile(t,JSON.stringify(v),{mode:0o600,flag:'wx',flush:true});await rename(t,p)};
export function friendlyError(text){
 if(/Payment exceeds grant/.test(text))return 'This payment exceeds the 2 XLM limit. Reduce the amount.';
 if(/Payment outside grant scope/.test(text))return 'This recipient is outside the signed permission. Choose the approved merchant.';
 if(/No active delegation/.test(text))return 'The agent has no active permission. Review a new permission first.';
 if(/#3221/.test(text))return 'The payment would exceed the 5 XLM budget. No payment was sent.';
 if(/authorization\/policy rejected|simulation rejected/.test(text))return 'The contract rejected this payment. No payment was sent.';
 if(/CONFLICT/.test(text))return 'This invoice already has different payment details. Keep the original details or create a new invoice.';
 if(/Didit HTTP/.test(text))return 'Didit could not confirm your identity. Check access and try the status check again.';
 return 'The action did not complete. Check the transaction status before trying another action.';
}
const publicGrant=g=>g?{id:g.id,account:g.account,owner:g.ownerPublicKey,agent:g.agentPublicKey,recipient:g.recipient,perPaymentUnits:g.perPaymentUnits,budgetUnits:g.budgetUnits,expiresAt:g.expiresAt,validUntilLedger:g.validUntilLedger}:null;
export async function createDemoBackend({base='/ui-state',run,paths={wallet:'/runtime',grants:'/grants',identity:'/identity',operations:'/operations'}}={}){
 const {wallet,grants,identity,operations}=paths;
 await mkdir(base,{recursive:true,mode:0o700});
 run??=async(script,args)=>{try{const r=await exec(process.execPath,[`scripts/${script}.mjs`,...args],{timeout:120000,maxBuffer:262144,env:{...process.env,ALLOW_TESTNET:'yes',GRANT_RUNTIME:grants,WALLET_RUNTIME:wallet,DIDIT_RUNTIME:identity}});return r.stdout.trim()}catch(e){throw Error(friendlyError(String(e.stderr||e.message)))}};
 const storedLock=await read(`${base}/lock.json`);
 let job=await read(`${base}/job.json`),locked=!!storedLock,balances=await read(`${base}/balances.json`);
 if(locked){job={...job,...storedLock,state:'RECOVERY_REQUIRED',message:'An interrupted action needs reconciliation. No automatic retry was made.'};await save(`${base}/job.json`,job)}
 const journal=()=>new PaymentJournal({journalDir:operations,controlDir:wallet});
 async function snapshot(){
  const observedJob=job?structuredClone(job):null;const observedBusy=locked;
  const [state,credential,pilot,active,proposal,keys,display]=await Promise.all([`${wallet}/deployment.json`,`${grants}/identity-credential.json`,`${identity}/didit-pilot.json`,`${grants}/active-grant.json`,`${grants}/consent-proposal.json`,`${wallet}/keys.json`,`${grants}/identity-display.json`].map(read));
  const pubs=keys?Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,Keypair.fromSecret(v).publicKey()])):{};
  const j=journal();let rows;try{rows=j.sql.prepare('SELECT * FROM operations ORDER BY created_at DESC').all()}finally{j.close()}
  const spent=rows.filter(r=>r.state==='CONFIRMED'&&JSON.parse(r.terms).grantId===state?.grantId).reduce((sum,r)=>sum+BigInt(JSON.parse(r.terms).amount),0n);
  let verificationUrl=null;try{const u=new URL(pilot?.session?.url);if(u.protocol==='https:'&&u.hostname==='verify.didit.me'&&!u.username&&!u.password)verificationUrl=u.href}catch{}
  const displayValid=credential?.status==='APPROVED'&&credential.expiresAt>Date.now()&&display?.provider==='didit'&&display.credentialDigest===canonicalDigest(credential)&&typeof display.maskedName==='string'&&/^[\p{L}]{0,2}\*{3} [\p{L}]{0,1}\*{3}$/u.test(display.maskedName);
  return {network:'Stellar testnet',demoWallet:true,identity:{status:credential?.status||'NOT_CHECKED',current:credential?.expiresAt>Date.now(),expiresAt:credential?.expiresAt||null,verificationUrl,verifiedAt:credential?.verifiedAt||null,maskedName:displayValid?display.maskedName:null,checkedAt:displayValid?display.checkedAt:null,checks:displayValid?{document:display.checks?.document===true,liveness:display.checks?.liveness===true,faceMatch:display.checks?.faceMatch===true}:null},account:state?.account||null,owner:pubs.owner,agent:pubs.agent,merchant:pubs.merchant,stranger:pubs.stranger,permission:{status:state?.agentRule!==undefined?(active?.grant?.expiresAt>Date.now()?'ACTIVE':'LOCAL_EXPIRED'):state?.revokedRule!==undefined?'REVOKED':'NONE',rule:state?.agentRule??null,grant:publicGrant(active?.grant),spentUnits:spent.toString()},proposal:proposal&&credential?.status==='APPROVED'&&proposal.grant?.credentialDigest===canonicalDigest(credential)?{grant:publicGrant(proposal.grant),digest:canonicalDigest(proposal.grant)}:null,balances,operations:rows.filter((r,i)=>i<30||['UNKNOWN','PENDING','PREPARED','SUBMITTING'].includes(r.state)).map(r=>({...publicOperation(r),amount:JSON.parse(r.terms).amount,recipient:JSON.parse(r.terms).recipient})),job:observedJob,busy:observedBusy};
 }
 async function refreshBalances(){const out=await run('testnet',['balance']);const values={};for(const line of out.split('\n')){const m=line.match(/^(account|merchant|stranger): ([0-9]+) base units$/);if(m)values[m[1]]=m[2]}if(Object.keys(values).length!==3)throw Error('Balances unavailable. Refresh the network status.');balances={...values,checkedAt:Date.now()};await save(`${base}/balances.json`,balances)}
 async function action(kind,input={}){
  if(!['identity','prepare','approve','pay','reconcile','revoke','sync'].includes(kind))throw Error('Unknown action');
  const recovery=locked&&job?.state==='RECOVERY_REQUIRED'&&kind==='reconcile';
  const interrupted=job;
  if(locked&&!recovery)throw Error('Another action or an interrupted action is still pending. Reconcile it first.');
  if(kind==='pay'&&(!/^demo-[a-zA-Z0-9-]{1,80}$/.test(input.invoiceId||'')||!/^\d+(\.\d{1,7})?$/.test(input.amount||'')||!['merchant','stranger'].includes(input.recipient)))throw Error('Enter a valid invoice, amount and recipient.');
  if(kind==='approve'&&!/^[a-f0-9]{64}$/.test(input.digest||''))throw Error('Review the exact permission before signing.');
  const lock={id:randomUUID(),kind,createdAt:Date.now()};
  if(!recovery)await writeFile(`${base}/lock.json`,JSON.stringify(lock),{flag:'wx',mode:0o600,flush:true});locked=true;
  job={...lock,state:'RUNNING',message:'Waiting for the network…'};await save(`${base}/job.json`,job);
  void (async()=>{let unresolved=false;try{
   let s=await snapshot();
   if(kind==='identity'){
    if(['ACTIVE','LOCAL_EXPIRED'].includes(s.permission.status))throw Error('Revoke the current permission before refreshing the identity credential.');
    await run('identity-consent',['refresh']);job.message='Didit confirmed the existing identity. No new verification session was created.';
   }else if(kind==='prepare'){
    if(!s.identity.current||s.identity.status!=='APPROVED')throw Error('Check Didit status before reviewing permission.');
    if(['ACTIVE','LOCAL_EXPIRED'].includes(s.permission.status))throw Error('Revoke the existing permission first.');
    if(await read(`${wallet}/delegation-intent.json`))await run('testnet',['reconcile-delegation-intent']);
    const ledger=JSON.parse(await run('testnet',['ledger'])).sequence;
    await run('identity-consent',['propose',String(ledger+720)]);job.message='Review the recipient, limits and expiry below. Nothing has been signed yet.';
   }else if(kind==='approve'){
    if(['ACTIVE','LOCAL_EXPIRED'].includes(s.permission.status)||s.proposal?.grant?.id===s.permission.grant?.id)throw Error('Review a new permission before signing.');
    if(input.digest!==s.proposal?.digest)throw Error('The proposal changed. Review it again before signing.');
    await run('identity-consent',['approve',input.digest]);
    await run('testnet',['delegate']);job.message='Owner consent is signed and permission is installed on testnet.';
    await refreshBalances();
   }else if(kind==='pay'){
    const [whole,fraction='']=input.amount.split('.');const units=(BigInt(whole)*10000000n+BigInt(fraction.padEnd(7,'0'))).toString();
    if(BigInt(units)<=0n)throw Error('Enter an amount greater than zero.');
    let result=JSON.parse(await run('testnet',['pay','--invoice-id',input.invoiceId,'--amount-units',units,'--recipient',input.recipient==='merchant'?s.merchant:s.stranger]));
    for(let i=0;i<12&&['UNKNOWN','PENDING'].includes(result.state);i++){await new Promise(r=>setTimeout(r,1200));result=JSON.parse(await run('testnet',['operation','reconcile',input.invoiceId]))}
    job.message=result.state==='CONFIRMED'?(result.reused?'Original payment receipt returned. No new payment was sent.':'Payment confirmed on Stellar testnet.'):result.state==='PREPARATION_FAILED'?'This invoice was rejected earlier. Create a new invoice to change the terms.':`Payment status: ${result.state}. Check status using the same invoice.`;
    job.invoiceId=input.invoiceId;
    await refreshBalances();
   }else if(kind==='reconcile'){
    if(recovery&&['approve','revoke'].includes(interrupted.kind)){
      const admin=await read(`${wallet}/pending.json`);
      if(admin?.createdAt>=interrupted.createdAt)await run('testnet',['reconcile-admin']);
      else if(interrupted.kind==='approve'){
        const intent=await read(`${wallet}/delegation-intent.json`);
        if(intent?.hash)throw Error('Installation outcome remains unresolved.');
        if(intent?.state==='PREPARING'){await mkdir(`${wallet}/history`,{recursive:true,mode:0o700});await rename(`${wallet}/delegation-intent.json`,`${wallet}/history/preparation-${interrupted.id}.json`)}
      }
    }
    const pending=s.operations.filter(o=>['PENDING','UNKNOWN','SUBMITTING','PREPARED'].includes(o.state));
    for(const op of pending)await run('testnet',['operation','reconcile',op.invoiceId]);
    await refreshBalances();job.message='Transaction statuses and balances checked against testnet.';
   }else if(kind==='revoke'){
    await run('testnet',['revoke']);await refreshBalances();job.message='Permission revoked on testnet. The agent can no longer pay.';
   }else{await refreshBalances();job.message='Balances checked against Stellar testnet.'}
   job.state='DONE';
  }catch(e){
   job.state='FAILED';job.message=e.message;
   if(recovery){unresolved=true;job.state='RECOVERY_REQUIRED';job.kind=interrupted.kind;job.createdAt=interrupted.createdAt;job.message='The original transaction is still unresolved. Keep checking its status; no replacement was sent.'}
   if(kind==='approve'){const state=await read(`${wallet}/deployment.json`),intent=await read(`${wallet}/delegation-intent.json`);if(intent&&state?.agentRule===undefined){unresolved=true;job.state='RECOVERY_REQUIRED';job.message='Permission installation needs reconciliation. Writes are paused to prevent a duplicate grant.'}}
   if(kind==='revoke'){unresolved=true;job.state='RECOVERY_REQUIRED';job.message='Revocation outcome needs reconciliation. Writes are paused; inspect the original transaction.'}
  }finally{job.finishedAt=Date.now();await save(`${base}/job.json`,job);if(!unresolved){await unlink(`${base}/lock.json`);locked=false}}
  })();
  return {...job};
 }
 return {snapshot,action};
}
