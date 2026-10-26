// Prepared testnet-only runner. Network execution requires explicit opt-in.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Address, Asset, Contract, Keypair, Networks, Operation, TransactionBuilder, nativeToScVal, scValToNative, rpc, xdr } from '@stellar/stellar-sdk';
import { externalSigner, signAccountEntry, assertDirectInvocation } from '../src/oz-auth.mjs';
import { ruleArgs } from '../src/oz-config.mjs';
import {activateJournal,PaymentJournal,payOperation,reconcileOperation,parsePayArgs,publicOperation} from '../src/payment-operations.mjs';
import {validatePreparedPayment,transactionLookupEvidence} from '../src/payment-cli.mjs';
const runtime='/runtime';
const symbol=s=>xdr.ScVal.scvSymbol(s);
const vec=a=>xdr.ScVal.scvVec(a);
const u32=n=>xdr.ScVal.scvU32(n);
const addr=s=>new Address(s).toScVal();
const amount=n=>nativeToScVal(BigInt(n),{type:'i128'});
const map=entries=>xdr.ScVal.scvMap(entries.sort((a,b)=>a[0].type === 'scvSymbol' && b[0].type === 'scvSymbol' ? (a[0].sym.toString() < b[0].sym.toString() ? -1 : 1) : Buffer.compare(Buffer.from(a[0].toXDR()),Buffer.from(b[0].toXDR()))).map(([key,val])=>new xdr.ScMapEntry({key,val})));
const struct=o=>map(Object.entries(o).map(([k,v])=>[symbol(k),v]));
const command=process.argv[2]||'plan';
if(command==='delegate-demo')throw new Error('Synthetic delegation retired; use signed identity consent and delegate');
const paymentArgs=['pay','probe'].includes(command)?parsePayArgs(process.argv.slice(3)):null;
const journalOptions={journalDir:'/operations',controlDir:runtime};
if(command==='plan') {
  console.log(JSON.stringify({network:'testnet',rpc:'https://soroban-testnet.stellar.org',contracts:['gate_verifier','gate_spending_policy','gate_recipient_policy','gate_account'],asset:'native XLM via SAC',budgetXlm:5,perPaymentXlm:2,windowLedgers:17280,ruleLifetimeLedgers:'exact owner-signed validUntilLedger',didit:'separate verified pilot; requires signed consent',execution:'not_submitted'},null,2));
} else if(command==='journal-init') {
  console.log(JSON.stringify(activateJournal({...journalOptions,legacyPendingPath:`${runtime}/pending.json`}),null,2));
} else if(command==='operation' && process.argv[3]==='status') {
  const state=JSON.parse(await readFile(`${runtime}/deployment.json`,'utf8'));
  const journal=new PaymentJournal(journalOptions);
  try {const row=journal.find({network:'testnet',account:state.account,invoiceId:process.argv[4]});if(!row)throw Error('Unknown invoice');console.log(JSON.stringify(publicOperation(row),null,2));}finally{journal.close();}
} else if(command==='init') {
  await mkdir(runtime,{recursive:true,mode:0o700});
  const keys=Object.fromEntries(['fee','owner','agent','merchant','stranger'].map(k=>[k,Keypair.random().secret()]));
  await writeFile(`${runtime}/keys.json`,JSON.stringify(keys),{mode:0o600,flag:'wx'});
  console.log('Fresh testnet-only keys saved privately. No network requests.');
} else {
  if(process.env.ALLOW_TESTNET!=='yes') throw new Error('Network execution disabled. Set ALLOW_TESTNET=yes only when explicitly authorized.');
  const server=new rpc.Server('https://soroban-testnet.stellar.org');
  const network=await server.getNetwork();
  if(network.passphrase!==Networks.TESTNET) throw new Error('Unexpected network');
  const keys=JSON.parse(await readFile(`${runtime}/keys.json`,'utf8'));
  const kp=Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,Keypair.fromSecret(v)]));
  const save=async(name,data)=>writeFile(`${runtime}/${name}.json`,JSON.stringify(data,null,2),{mode:0o600});
  async function build(op) {
    return new TransactionBuilder(await server.getAccount(kp.fee.publicKey()),{fee:'100000',networkPassphrase:Networks.TESTNET}).addOperation(op).setTimeout(60).build();
  }
  async function prepareTransaction(op,label,signing) {
    let tx=await build(op);
    let simulation=await server.simulateTransaction(tx,undefined,'record');
    if(rpc.Api.isSimulationError(simulation)) { const error=new Error(`${label}: simulation rejected`); error.policyDetail=simulation.error; throw error; }
    if(signing) {
      const auth=simulation.result?.auth||[];
      if(auth.length!==1) throw new Error('Expected exactly one smart account authorization');
      assertDirectInvocation(auth[0],op);
      const latest=await server.getLatestLedger();
      const signed=await signAccountEntry(auth[0],{...signing,expirationLedger:latest.sequence+30,networkPassphrase:Networks.TESTNET});
      const invocation=op.body.invokeHostFunctionOp;
      op=Operation.invokeHostFunction({func:invocation.hostFunction,auth:[signed]});
      tx=await build(op);
      simulation=await server.simulateTransaction(tx,undefined,'enforce');
      if(rpc.Api.isSimulationError(simulation)) { const error=new Error(`${label}: authorization/policy rejected`); error.policyDetail=simulation.error; throw error; }
    }
    tx=rpc.assembleTransaction(tx,simulation).build();
    tx.sign(kp.fee);
    return tx;
  }
  async function submit(op,label,signing,onPrepared) {
    const tx=await prepareTransaction(op,label,signing);
    if(onPrepared)await onPrepared(tx);
    const preparedHash=Buffer.from(tx.hash()).toString('hex');
    await save('pending',{label,hash:preparedHash,envelope:tx.toXDR(),createdAt:Date.now(),phase:'SIGNED'});
    const sent=await server.sendTransaction(tx);
    if(sent.hash!==preparedHash)throw Error('Unexpected transaction hash; reconcile original envelope');
    if(!['PENDING','DUPLICATE'].includes(sent.status)) throw new Error(`${label}: submission ${sent.status}`);
    await save('pending',{label,hash:sent.hash,envelope:tx.toXDR(),createdAt:Date.now(),phase:sent.status});
    for(let i=0;i<30;i++) {
      await new Promise(resolve=>setTimeout(resolve,1000));
      const result=await server.getTransaction(sent.hash);
      if(result.status==='SUCCESS') {
        await save('last-receipt',{label,hash:sent.hash,ledger:result.ledger,status:result.status});
        console.log(`${label}: SUCCESS ${sent.hash}`);
        return result.returnValue;
      }
      if(result.status==='FAILED') throw new Error(`${label}: failed ${sent.hash}`);
    }
    throw new Error(`Unresolved transaction ${sent.hash}; reconcile before retrying`);
  }
  if(command==='ledger') {
    console.log(JSON.stringify({sequence:(await server.getLatestLedger()).sequence}));
  } else if(command==='fund') {
    for(const name of ['fee','merchant','stranger']) {
      const url=new URL('https://friendbot.stellar.org');url.searchParams.set('addr',kp[name].publicKey());
      const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
      if(!response.ok) throw new Error(`Friendbot ${name}: ${response.status}`);
      console.log(`Funded testnet ${name}: ${kp[name].publicKey()}`);
    }
  } else if(command==='deploy') {
    // Journal each deployed component; interrupted setup must not silently redeploy accounts.
    let state;
    try { state=JSON.parse(await readFile(`${runtime}/deployment.json`,'utf8')); } catch(error) { if(error.code!=='ENOENT') throw error;state={network:'testnet'}; }
    for(const [name,wasm] of [['verifier','gate_verifier'],['spending','gate_spending_policy'],['recipientPolicy','gate_recipient_policy'],['account','gate_account']]) {
      if(state[name]) continue;
      const hashVal=await submit(Operation.uploadContractWasm({wasm:await readFile(`/artifacts/${wasm}.wasm`)}),`upload ${name}`);
      const constructorArgs=name==='account'?[vec([externalSigner(state.verifier,kp.owner.rawPublicKey())]),map([])]:[];
      state[name]=scValToNative(await submit(Operation.createCustomContract({address:new Address(kp.fee.publicKey()),wasmHash:scValToNative(hashVal),salt:randomBytes(32),constructorArgs}),`deploy ${name}`));
      await save('deployment',state);
    }
    console.log('Contracts deployed; no agent permission installed.');
  } else {
    const state=JSON.parse(await readFile(`${runtime}/deployment.json`,'utf8'));
    const token=Asset.native().contractId(Networks.TESTNET);
    const call=(contract,fn,args)=>new Contract(contract).call(fn,...args);
    const signing=(keypair,rule)=>({account:state.account,verifier:state.verifier,keypair,ruleIds:[rule]});
    if(command==='reconcile-admin') {
      const pending=JSON.parse(await readFile(`${runtime}/pending.json`,'utf8'));
      if(!['install signed consent','owner revoke'].includes(pending.label)||!pending.envelope)throw Error('No recoverable administrative transaction');
      const original=TransactionBuilder.fromXDR(pending.envelope,Networks.TESTNET);
      if(Buffer.from(original.hash()).toString('hex')!==pending.hash)throw Error('Stored transaction hash mismatch');
      const result=await server.getTransaction(pending.hash);
      if(result.status!=='SUCCESS'||Buffer.from(TransactionBuilder.fromXDR(result.envelopeXdr,Networks.TESTNET).hash()).toString('hex')!==pending.hash)throw Error('Administrative outcome still unresolved');
      const fn=original.operations[0]?.func;
      if(fn?.type!=='hostFunctionTypeInvokeContract'||Address.fromScAddress(fn.invokeContract.contractAddress).toString()!==state.account)throw Error('Administrative account mismatch');
      if(pending.label==='owner revoke'){
        if(fn.invokeContract.functionName.toString()!=='remove_context_rule'||scValToNative(fn.invokeContract.args[0])!==(state.agentRule??state.revokedRule))throw Error('Revoke terms mismatch');
        state.revokedRule=state.agentRule??state.revokedRule;delete state.agentRule;
      }else{
        const {canonicalDigest}=await import('../src/identity-grants.mjs');
        const envelope=JSON.parse(await readFile('/grants/active-grant.json','utf8'));const grant=envelope.grant;
        const intent=JSON.parse(await readFile(`${runtime}/delegation-intent.json`,'utf8'));
        if(intent.hash!==pending.hash||intent.digest!==canonicalDigest(grant))throw Error('Grant intent mismatch');
        const expected=ruleArgs({...state,token:grant.token,recipient:grant.recipient,agent:kp.agent,expires:grant.validUntilLedger,budgetUnits:grant.budgetUnits,perPaymentUnits:grant.perPaymentUnits,periodLedgers:grant.periodLedgers});
        if(fn.invokeContract.functionName.toString()!=='add_context_rule'||fn.invokeContract.args.length!==expected.length||expected.some((a,i)=>!Buffer.from(a.toXDR()).equals(Buffer.from(fn.invokeContract.args[i].toXDR()))))throw Error('Grant transaction terms mismatch');
        state.agentRule=scValToNative(result.returnValue).id;state.grantId=grant.id;state.grantDigest=canonicalDigest(grant);state.credentialDigest=grant.credentialDigest;state.consentEnvelopeDigest=canonicalDigest(envelope);
      }
      await save('deployment',state);await save('last-receipt',{label:pending.label,hash:pending.hash,ledger:result.ledger,status:'SUCCESS'});
      console.log(JSON.stringify({reconciled:true,label:pending.label,hash:pending.hash}));
    } else if(command==='reconcile-delegation-intent') {
      // Only archive a completed, revoked grant after independent network confirmation.
      if(state.agentRule!==undefined||!Number.isSafeInteger(state.revokedRule))throw Error('Delegation is not locally revoked');
      const intent=JSON.parse(await readFile(`${runtime}/delegation-intent.json`,'utf8'));
      if(intent.digest!==state.grantDigest)throw Error('Intent/grant mismatch');
      const receipt=JSON.parse(await readFile(`${runtime}/last-receipt.json`,'utf8'));
      if(receipt.label!=='owner revoke'||receipt.status!=='SUCCESS')throw Error('No confirmed revoke receipt');
      const result=await server.getTransaction(receipt.hash);
      if(result.status!=='SUCCESS'||Buffer.from(TransactionBuilder.fromXDR(result.envelopeXdr,Networks.TESTNET).hash()).toString('hex')!==receipt.hash)throw Error('Revoke not confirmed by network');
      const fn=TransactionBuilder.fromXDR(result.envelopeXdr,Networks.TESTNET).operations[0]?.func;
      if(fn?.type!=='hostFunctionTypeInvokeContract'||Address.fromScAddress(fn.invokeContract.contractAddress).toString()!==state.account||fn.invokeContract.functionName.toString()!=='remove_context_rule'||scValToNative(fn.invokeContract.args[0])!==state.revokedRule)throw Error('Revoke transaction terms mismatch');
      const sim=await server.simulateTransaction(await build(call(state.account,'get_context_rule',[u32(state.revokedRule)])));
      if(!rpc.Api.isSimulationError(sim)||!String(sim.error).includes('Error(Contract, #3000)'))throw Error('Removed rule not independently confirmed');
      await mkdir(`${runtime}/history`,{recursive:true,mode:0o700});
      await writeFile(`${runtime}/history/intent-${intent.digest}.json`,JSON.stringify({...intent,resolved:'REVOKED',revokeHash:receipt.hash}),{flag:'wx',mode:0o600});
      await rename(`${runtime}/delegation-intent.json`,`${runtime}/history/intent-original-${intent.digest}.json`);
      console.log(JSON.stringify({reconciled:true,revokedRule:state.revokedRule,revokeHash:receipt.hash}));
    } else if(command==='seed-account') {
      await submit(call(token,'transfer',[addr(kp.fee.publicKey()),addr(state.account),amount(100_000_000)]),'fund smart account');
    } else if(command==='delegate') {
      if(state.agentRule!==undefined)throw new Error('Existing delegation must be inspected or revoked');
      const {validateConsentForInstall,canonicalDigest}=await import('../src/identity-grants.mjs');
      const envelope=JSON.parse(await readFile('/grants/active-grant.json','utf8'));
      const trustedCredential=JSON.parse(await readFile('/grants/identity-credential.json','utf8'));
      const grant=validateConsentForInstall(envelope,{account:state.account,ownerPublicKey:kp.owner.publicKey(),agentPublicKey:kp.agent.publicKey(),token,trustedCredential});
      const latest=await server.getLatestLedger();
      const expires=grant.validUntilLedger;
      if(expires<=latest.sequence)throw new Error('Consent expires too soon');
      await writeFile(`${runtime}/delegation-intent.json`,JSON.stringify({grantId:grant.id,digest:canonicalDigest(grant),state:'PREPARING'}),{mode:0o600,flag:'wx'});
      const result=await submit(call(state.account,'add_context_rule',ruleArgs({...state,token,recipient:grant.recipient,agent:kp.agent,expires,budgetUnits:grant.budgetUnits,perPaymentUnits:grant.perPaymentUnits,periodLedgers:grant.periodLedgers})),'install signed consent',signing(kp.owner,0),async tx=>{await save('delegation-intent',{grantId:grant.id,digest:canonicalDigest(grant),state:'SIGNED',hash:Buffer.from(tx.hash()).toString('hex'),envelope:tx.toXDR()});});
      state.agentRule=scValToNative(result).id;state.grantId=grant.id;state.grantDigest=canonicalDigest(grant);state.credentialDigest=grant.credentialDigest;state.consentEnvelopeDigest=canonicalDigest(envelope);await save('deployment',state);
    } else if(command==='probe') {
      // Read-only RPC simulation deliberately bypasses local grant checks to test deployed policies.
      const rule=state.agentRule??state.revokedRule;
      if(rule===undefined)throw Error('No recorded rule for policy probe');
      try {
        await prepareTransaction(call(token,'transfer',[addr(state.account),addr(paymentArgs.recipient),amount(paymentArgs.amount)]),'policy probe',signing(kp.agent,rule));
        console.log(JSON.stringify({probe:paymentArgs.invoiceId,result:'ALLOWED',submitted:false,rule}));
      } catch(error) {
        if(!['policy probe: simulation rejected','policy probe: authorization/policy rejected'].includes(error.message))throw error;
        console.log(JSON.stringify({probe:paymentArgs.invoiceId,result:'DENIED',submitted:false,rule,stage:error.message,detail:String(error.policyDetail).slice(0,1600)}));
      }
    } else if(command==='pay' || command==='operation' && process.argv[3]==='reconcile') {
      const journal=new PaymentJournal(journalOptions);
      try {
        const scope={network:'testnet',account:state.account,invoiceId:paymentArgs?.invoiceId||process.argv[4]};
        const previous=journal.find(scope);
        const terms=paymentArgs?{...scope,token,recipient:paymentArgs.recipient,amount:paymentArgs.amount,ruleId:state.agentRule??null,grantId:state.grantId??null,grantDigest:state.grantDigest??null,credentialDigest:state.credentialDigest??null,consentEnvelopeDigest:state.consentEnvelopeDigest??null}:previous?JSON.parse(previous.terms):null;
        if(!terms)throw Error('Unknown invoice');
        const adapter={
          prepare:async t=>{
            if(state.agentRule===undefined)throw Error('No active delegation');
            const {validatePaymentGrant}=await import('../src/identity-grants.mjs');
            const grant=await validatePaymentGrant({state,recipient:t.recipient,units:t.amount,token:t.token,ownerPublicKey:kp.owner.publicKey(),agentPublicKey:kp.agent.publicKey()});
            const tx=await prepareTransaction(call(t.token,'transfer',[addr(t.account),addr(t.recipient),amount(t.amount)]),'agent payment',signing(kp.agent,state.agentRule));
            return {network:'testnet',hash:Buffer.from(tx.hash()).toString('hex'),envelope:tx.toXDR(),grantId:grant.id??null};
          },
          validatePrepared:validatePreparedPayment,
          send:async envelope=>server.sendTransaction(TransactionBuilder.fromXDR(envelope,Networks.TESTNET)),
          lookup:async(hash,stored)=>{
            const result=await server.getTransaction(hash);
            return transactionLookupEvidence(result,{hash,envelope:stored.envelope,network:'testnet'});
          },
        };
        const result=command==='pay'?await payOperation(journal,terms,adapter):await reconcileOperation(journal,terms,adapter);
        console.log(JSON.stringify(result,null,2));
      } finally {journal.close();}
    } else if(command==='revoke') {
      if(state.agentRule===undefined) throw new Error('No active delegation');
      await submit(call(state.account,'remove_context_rule',[u32(state.agentRule)]),'owner revoke',signing(kp.owner,0));
      state.revokedRule=state.agentRule;delete state.agentRule;await save('deployment',state);
    } else if(command==='balance') {
      for(const [name,address] of [['account',state.account],['merchant',kp.merchant.publicKey()],['stranger',kp.stranger.publicKey()]]) {
        const sim=await server.simulateTransaction(await build(call(token,'balance',[addr(address)])));
        if(rpc.Api.isSimulationError(sim)) throw new Error('Balance query failed');
        console.log(`${name}: ${scValToNative(sim.result.retval)} base units`);
      }
    } else throw new Error('Unknown command');
  }
}
