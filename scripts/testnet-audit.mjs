// Read-only acceptance audit of the recorded testnet run. No secret or signer required.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {rpc,Networks,TransactionBuilder} from '@stellar/stellar-sdk';
const dir=process.env.EVIDENCE_DIR||'/evidence';
const text=async n=>readFile(`${dir}/${n}`,'utf8');
const json=async n=>JSON.parse(await text(n));
const publicState=await json('public-deployment.json');
const journal=await json('final-journal.json');
assert.equal(journal.deployment.account,publicState.deployment.account);
assert.equal(journal.deployment.agentRule,undefined);assert.equal(journal.deployment.revokedRule,1);
for(const [name,code]of[['probe-cap.txt',3905],['probe-recipient.txt',3904],['probe-budget.txt',3221],['probe-after-revoke.txt',3000]]){
 const p=await json(name);assert.equal(p.result,'DENIED');assert.equal(p.submitted,false);assert(p.detail.includes(`Error(Contract, #${code})`));
}
assert.equal((await json('probe-before-revoke.txt')).result,'ALLOWED');
const repeat=await json('payment-001-repeated.txt');assert.equal(repeat.reused,true);assert.equal(repeat.state,'CONFIRMED');
for(const id of ['denied-client-cap','denied-client-recipient','denied-budget','denied-revoked']){
 const r=journal.operations.find(o=>o.invoiceId===id);assert.equal(r.state,'PREPARATION_FAILED');assert.equal(r.hash,null);
}
const balances=async n=>Object.fromEntries((await text(n)).trim().split('\n').map(line=>{const m=line.match(/^(account|merchant|stranger): ([0-9]+) base units$/);assert(m);return[m[1],BigInt(m[2])]}));
const before=await balances('balance-before.txt'),first=await balances('balance-after-001.txt'),last=await balances('balance-final.txt');
assert.equal(before.account-first.account,10000000n);assert.equal(first.merchant-before.merchant,10000000n);
assert.equal(before.account-last.account,40000000n);assert.equal(last.merchant-before.merchant,40000000n);assert.equal(before.stranger,last.stranger);
assert.deepEqual(await balances('balance-before-budget.txt'),last);assert.deepEqual(await balances('balance-after-budget-denial.txt'),last);
const server=new rpc.Server('https://soroban-testnet.stellar.org');assert.equal((await server.getNetwork()).passphrase,Networks.TESTNET);
const hashes=[];
for(const n of ['deploy.txt','seed-account.txt','delegate-v2.txt','revoke.txt'])for(const m of (await text(n)).matchAll(/^(.*): SUCCESS ([0-9a-f]{64})$/gm))hashes.push({label:m[1],hash:m[2]});
for(let i=1;i<=3;i++){
 const row=await json(`payment-00${i}-reconciled.txt`);assert.equal(row.state,'CONFIRMED');assert.equal(journal.operations.find(o=>o.invoiceId===row.invoiceId).hash,row.hash);hashes.push({label:row.invoiceId,hash:row.hash,expectedLedger:row.ledger});
}
assert.equal(hashes.length,14);assert.equal(new Set(hashes.map(r=>r.hash)).size,14);
const receipts=[];
for(const r of hashes){const result=await server.getTransaction(r.hash);assert.equal(result.status,'SUCCESS');assert.equal(Buffer.from(TransactionBuilder.fromXDR(result.envelopeXdr,Networks.TESTNET).hash()).toString('hex'),r.hash);if(r.expectedLedger)assert.equal(result.ledger,r.expectedLedger);receipts.push({...r,status:result.status,ledger:result.ledger});}
const summary={network:'Stellar testnet',account:publicState.deployment.account,accepted:true,confirmedTransactions:receipts,successfulPayments:3,totalTransferredXlm:4,remainingAccountXlm:6,perPaymentLimitXlm:2,budgetXlm:5,recipientUnchanged:true,negativeChecks:'client PREPARATION_FAILED plus signed RPC enforcement simulation; no negative transaction broadcast',repeatedInvoice:'original receipt reused',agentPermission:'REVOKED',finalBalances:Object.fromEntries(Object.entries(last).map(([k,v])=>[k,v.toString()]))};
console.log(JSON.stringify(summary,null,2));
