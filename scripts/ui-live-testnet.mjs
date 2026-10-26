// Explicitly authorized live acceptance. All writes use the real UI buttons.
// This relay models the owner's SSH localhost tunnel; it never fakes an API response.
import {chromium} from 'playwright';
import {createServer,request} from 'node:http';
import {writeFile,readFile,copyFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
if(process.env.ALLOW_UI_TESTNET!=='yes')throw Error('Live UI testnet opt-in required');
const dir='/evidence',runId=process.env.RUN_ID||'ui20261026';
await writeFile(`${dir}/run.json`,JSON.stringify({runId,startedAt:new Date().toISOString(),state:'STARTED'}),{flag:'wx'});
const relay=createServer((req,res)=>{
 const upstream=request({hostname:'web',port:3157,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});
 upstream.on('error',()=>{res.writeHead(502);res.end('Demo upstream unavailable')});req.pipe(upstream);
});await new Promise(r=>relay.listen(3157,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:'/usr/bin/chromium'});
const recording=process.env.RECORD_DEMO==='yes';
const page=await browser.newPage({viewport:{width:1280,height:900},...(recording?{recordVideo:{dir:`${dir}/video`,size:{width:1280,height:900}}}:{})}),errors=[];
page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(async()=>{const r=await fetch(`/api/state?audit=${crypto.randomUUID()}`,{cache:'no-store'});if(!r.ok)throw Error(`State HTTP ${r.status}`);return r.json()});
const safe=s=>({network:s.network,identity:{status:s.identity.status,current:s.identity.current,expiresAt:s.identity.expiresAt},account:s.account,permission:s.permission,proposal:s.proposal,balances:s.balances,operations:s.operations,job:s.job,busy:s.busy});
async function save(name,s){await writeFile(`${dir}/${name}.json`,JSON.stringify(safe(s),null,2));console.log(name,JSON.stringify({job:s.job?.state,message:s.job?.message,permission:s.permission.status,spent:s.permission.spentUnits,balances:s.balances}))}
async function click(name,kind,expected='DONE'){
 const prior=await state();assert.equal(prior.busy,false);
 if(recording){const captions={sync:'Read balances directly from Stellar testnet',identity:'Didit confirms the existing verification. Identity alone grants no spending rights.',prepare:'Review exact terms: one merchant, 2 XLM per payment, 5 XLM per permission.',approve:'The demo owner signs consent; the restricted rule is installed on-chain.',pay:`Agent payment: ${await page.locator('#amount').inputValue()} XLM. Every invoice has one durable receipt.`,revoke:'The owner revokes permission on-chain. Future agent payments stop.'};await page.evaluate(text=>{let e=document.getElementById('recording-caption');if(!e){e=document.createElement('div');e.id='recording-caption';e.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:10000;max-width:1040px;width:calc(100% - 32px);padding:12px 18px;border-radius:6px;color:white;background:#173e31;font:500 16px/1.4 sans-serif;pointer-events:none';document.body.append(e)}e.textContent='REAL TESTNET RECORDING · '+text},captions[kind]);}

 const responsePromise=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/${kind}`&&r.request().method()==='POST',{timeout:30000});
 await page.getByRole('button',{name,exact:true}).click();
 const response=await responsePromise;assert.equal(response.status(),202,await response.text());const accepted=await response.json();const id=accepted.job.id;
 let s;for(let i=0;i<240;i++){s=await state();if(s.job?.id===id&&(!s.busy||s.job.state==='RECOVERY_REQUIRED'))break;await new Promise(r=>setTimeout(r,700))}
 assert.equal(s.job?.id,id);assert.equal(s.job.kind,kind);assert.equal(s.job.state,expected,`${kind}: ${s.job.message}`);assert.equal(s.busy,false);
 await page.waitForFunction(()=>!document.querySelector('#refresh').disabled,{timeout:10000});return s;
}

const balances=s=>({account:s.balances.account,merchant:s.balances.merchant,stranger:s.balances.stranger});
let baseline,grant,receipts=[];
async function pay(suffix,amount,recipient='merchant',expected='DONE'){
 const id=`demo-${runId}-${suffix}`;await page.locator('#invoice').fill(id);await page.locator('#amount').fill(amount);await page.locator('#recipient').selectOption(recipient);
 const s=await click('Pay with agent','pay',expected);const row=s.operations.find(o=>o.invoiceId===id);assert(row,'Invoice missing from real journal');
 if(expected==='DONE'){assert.equal(row.state,'CONFIRMED');assert(row.hash);receipts.push(row)}else{assert.equal(row.state,'PREPARATION_FAILED');assert.equal(row.hash,null)}
 await save(suffix,s);return s;
}
try{
 await page.goto('http://127.0.0.1:3157');assert.equal((await state()).network,'Stellar testnet');assert.equal((await state()).permission.status,'REVOKED');
 baseline=await click('Refresh network status','sync');await save('baseline',baseline);assert(BigInt(baseline.balances.account)>=40000000n);
 const identity=await click('Check verification status','identity');assert.equal(identity.identity.status,'APPROVED');assert(identity.identity.current);await save('didit',identity);
 const proposed=await click('Review new permission','prepare');assert(proposed.proposal);assert.equal(proposed.proposal.grant.perPaymentUnits,'20000000');assert.equal(proposed.proposal.grant.budgetUnits,'50000000');assert.equal(proposed.proposal.grant.recipient,proposed.merchant);
 await page.locator('#consent-review').waitFor();assert(await page.getByRole('button',{name:'Sign & grant permission',exact:true}).isDisabled());
 await page.locator('#consent-check').check();grant=await click('Sign & grant permission','approve');assert.equal(grant.permission.status,'ACTIVE');assert(grant.permission.rule>1);assert.equal(grant.permission.spentUnits,'0');await save('grant-installed',grant);
 const first=await pay('payment-001','1');assert.equal(BigInt(baseline.balances.account)-BigInt(first.balances.account),10000000n);
 const repeated=await click('Pay with agent','pay');assert.match(repeated.job.message,/Original payment receipt/);assert.deepEqual(balances(first),balances(repeated));assert.equal(repeated.operations.find(o=>o.invoiceId===`demo-${runId}-payment-001`).hash,receipts[0].hash);await save('invoice-reused',repeated);
 await pay('denied-cap','2.0000001','merchant','FAILED');const afterCap=await click('Refresh network status','sync');assert.deepEqual(balances(first),balances(afterCap));await save('cap-balances',afterCap);
 await pay('denied-recipient','1','stranger','FAILED');const afterRecipient=await click('Refresh network status','sync');assert.deepEqual(balances(first),balances(afterRecipient));await save('recipient-balances',afterRecipient);
 await pay('payment-002','2');const third=await pay('payment-003','1');assert.equal(third.permission.spentUnits,'40000000');
 const deniedBudget=await pay('denied-budget','2','merchant','FAILED');assert.match(deniedBudget.job.message,/5 XLM budget/);
 const afterBudget=await click('Refresh network status','sync');assert.deepEqual(balances(third),balances(afterBudget));await save('budget-balances',afterBudget);
 await page.locator('#amount').fill('1');assert(await page.getByRole('button',{name:'Pay with agent',exact:true}).isEnabled());
 const revoked=await click('Revoke permission','revoke');assert.equal(revoked.permission.status,'REVOKED');assert(await page.getByRole('button',{name:'Pay with agent',exact:true}).isDisabled());assert.deepEqual(balances(third),balances(revoked));await save('revoked',revoked);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#permission-badge').textContent==='Revoked');assert(await page.getByRole('button',{name:'Pay with agent',exact:true}).isDisabled());assert.equal(await page.locator('#invoice').inputValue(),`demo-${runId}-denied-budget`);
 await page.screenshot({path:`${dir}/live-desktop.png`,fullPage:true});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${dir}/live-mobile.png`,fullPage:true});
 const final=await state();assert.equal(BigInt(baseline.balances.account)-BigInt(final.balances.account),40000000n);assert.equal(BigInt(final.balances.merchant)-BigInt(baseline.balances.merchant),40000000n);assert.equal(final.balances.stranger,baseline.balances.stranger);assert.deepEqual(errors,[]);
 await writeFile(`${dir}/result.json`,JSON.stringify({runId,accepted:true,backend:'real demo service; no mock',didit:'authenticated refresh of existing approved session',grantId:grant.permission.grant.id,rule:grant.permission.rule,receipts,totalPaidUnits:'40000000',negativeChecks:['per-payment cap','recipient','cumulative budget'],revoked:true,baseline:balances(baseline),final:balances(final),javascriptErrors:errors},null,2));
 await writeFile(`${dir}/run.json`,JSON.stringify({runId,state:'COMPLETE',finishedAt:new Date().toISOString()}));console.log('PASS real browser testnet acceptance; agent permission REVOKED.');
}catch(error){
 console.error('LIVE RUN STOPPED:',error.message);
 try{await save('stopped',await state());await page.screenshot({path:`${dir}/stopped.png`,fullPage:true});const s=await state();if(!s.busy&&['ACTIVE','LOCAL_EXPIRED'].includes(s.permission.status)){const r=await click('Revoke permission','revoke');await save('cleanup-revoked',r)}}catch(e){console.error('Cleanup requires reconciliation:',e.message)}
 process.exitCode=1;
}finally{const video=page.video();const videoPath=video?await video.path():null;await page.context().close();if(videoPath)await copyFile(videoPath,`${dir}/demo-raw.webm`);await browser.close();await new Promise(r=>relay.close(r))}
