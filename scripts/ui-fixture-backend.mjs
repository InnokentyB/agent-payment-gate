// Synthetic browser fixture only. Never loaded by the real server entry point.
import {randomUUID} from 'node:crypto';
export function fixtureBackend(){
 const addr='C'+'A'.repeat(55),pub='G'+'B'.repeat(55);let sent=0;
 const s={network:'Stellar testnet',demoWallet:true,identity:{status:'NOT_CHECKED',current:false,verificationUrl:'https://verify.didit.me/session/synthetic'},account:addr,owner:pub,agent:pub,merchant:pub,stranger:'G'+'D'.repeat(55),permission:{status:'NONE',rule:null,grant:null,spentUnits:'0'},proposal:null,balances:{account:'100000000',merchant:'100000000000',stranger:'100000000000',checkedAt:Date.now()},operations:[],busy:false,job:null};
 return {snapshot:async()=>structuredClone(s),sent:()=>sent,action:async(kind,input)=>{
  if(s.busy)throw Error('Another action is running');
  s.busy=true;s.job={id:randomUUID(),kind,state:'RUNNING',message:'Synthetic network response…'};
  setTimeout(()=>{s.busy=false;s.job.state='DONE';
   if(kind==='identity'){s.identity={...s.identity,status:'APPROVED',current:true,expiresAt:Date.now()+86400000};s.job.message='Didit confirmed the existing identity.'}
   if(kind==='prepare'){s.proposal={digest:'a'.repeat(64),grant:{id:randomUUID(),owner:pub,agent:pub,recipient:pub,expiresAt:Date.now()+3600000,validUntilLedger:6000000}};s.job.message='Review your permission.'}
   if(kind==='approve'){s.permission={...s.permission,status:'ACTIVE',rule:1,grant:s.proposal.grant};s.job.message='Permission installed.'}
   if(kind==='pay'){
    const old=s.operations.find(o=>o.invoiceId===input.invoiceId);if(old){s.job.message='Original payment receipt returned. No new payment was sent.';return}
    const units=String(Math.round(Number(input.amount)*1e7));let reject=Number(input.amount)>2||input.recipient==='stranger'||BigInt(s.permission.spentUnits)+BigInt(units)>50000000n;
    s.operations.unshift({invoiceId:input.invoiceId,amount:units,state:reject?'PREPARATION_FAILED':'CONFIRMED',hash:reject?null:'b'.repeat(64),recipient:pub});
    if(reject){s.job.state='FAILED';s.job.message='The contract rejected this payment. No payment was sent.'}else{sent++;s.permission.spentUnits=String(BigInt(s.permission.spentUnits)+BigInt(units));s.balances.account=String(BigInt(s.balances.account)-BigInt(units));s.balances.merchant=String(BigInt(s.balances.merchant)+BigInt(units));s.job.message='Payment confirmed on Stellar testnet.'}
   }
   if(kind==='revoke'){s.permission.status='REVOKED';s.permission.rule=null;s.job.message='Permission revoked on testnet.'}
  },90);return structuredClone(s.job);
 }};
}
