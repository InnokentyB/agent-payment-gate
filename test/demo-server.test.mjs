import {request} from 'node:http';
import test from 'node:test';import assert from 'node:assert/strict';
import {createDemoServer} from '../src/demo-server.mjs';
import {createDemoBackend} from '../src/demo-backend.mjs';
import {activateJournal} from '../src/payment-operations.mjs';
import {mkdtemp,mkdir,writeFile,rm,readFile}from'node:fs/promises';import{tmpdir}from'node:os';
const wait=async fn=>{for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,10))}throw Error('timeout')};
test('HTTP rejects cross-origin/DNS-rebinding, missing CSRF and arbitrary commands; serves CSP and safe state',async()=>{
 let calls=0;const server=createDemoServer({port:0,backend:{snapshot:async()=>({network:'testnet'}),action:async k=>{assert.equal(k,'identity');calls++;return{state:'DONE'}}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 try{
 let r=await fetch(`${origin}/api/state`);const cookie=r.headers.get('set-cookie').split(';')[0],s=await r.json();assert(s.csrf);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 const post=(headers={},body='{}')=>fetch(`${origin}/api/identity`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
 assert.equal((await post()).status,403);
 assert.equal((await post({Origin:'https://evil.example',Cookie:cookie,'X-Demo-CSRF':s.csrf})).status,403);
 assert.equal(await new Promise((resolve,reject)=>{const req=request(`${origin}/api/state`,{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject);req.end()}),403);
 const headers={Origin:origin,Cookie:cookie,'X-Demo-CSRF':s.csrf};assert.equal((await post(headers)).status,202);assert.equal(calls,1);
 assert.equal((await fetch(`${origin}/.env`)).status,404);assert.equal((await fetch(`${origin}/api/state`,{method:'DELETE'})).status,404);
 assert.equal((await post(headers,'{')).status,400);
 }finally{await new Promise(r=>server.close(r))}
});
test('persistent mutation lock prevents double clicks and restart never replays an external action',async()=>{
 const root=await mkdtemp(`${tmpdir()}/gate-web-`),paths={wallet:`${root}/wallet`,grants:`${root}/grants`,identity:`${root}/identity`,operations:`${root}/operations`};for(const d of Object.values(paths))await mkdir(d);
 activateJournal({journalDir:paths.operations,controlDir:paths.wallet});
 let release,calls=0;const run=async()=>{calls++;await new Promise(r=>release=r);return'{}'};
 try{
 const backend=await createDemoBackend({base:`${root}/ui`,paths,run});await backend.action('identity');await wait(()=>release);await assert.rejects(backend.action('identity'),/Another action/);assert.equal(calls,1);
 const restarted=await createDemoBackend({base:`${root}/ui`,paths,run});assert.equal((await restarted.snapshot()).job.state,'RECOVERY_REQUIRED');assert.equal(calls,1);await assert.rejects(restarted.action('pay',{invoiceId:'demo-1',amount:'1',recipient:'merchant'}),/Another action/);
 release();await wait(async()=>!(await backend.snapshot()).busy);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('invoice and consent input fail before any external action',async()=>{
 const root=await mkdtemp(`${tmpdir()}/gate-input-`);let calls=0;
 try{const backend=await createDemoBackend({base:root,run:async()=>{calls++}});await assert.rejects(backend.action('pay',{invoiceId:'../../keys',amount:'1',recipient:'merchant'}));await assert.rejects(backend.action('pay',{invoiceId:'demo-1',amount:'1e7',recipient:'merchant'}));await assert.rejects(backend.action('approve',{digest:'changed'}));await assert.rejects(backend.action('fund'));assert.equal(calls,0)}finally{await rm(root,{recursive:true,force:true})}
});
test('public state omits private seeds/provider payloads; failed interrupted admin recovery stays locked',async()=>{
 const {Keypair}=await import('@stellar/stellar-sdk');const root=await mkdtemp(`${tmpdir()}/gate-private-`);const paths={wallet:`${root}/wallet`,grants:`${root}/grants`,identity:`${root}/identity`,operations:`${root}/operations`};for(const d of Object.values(paths))await mkdir(d);const base=`${root}/ui`;await mkdir(base);
 const key=Keypair.random();let calls=0;
 try{
 activateJournal({journalDir:paths.operations,controlDir:paths.wallet});
 await writeFile(`${paths.wallet}/keys.json`,JSON.stringify({owner:key.secret()}));
 await writeFile(`${paths.grants}/identity-credential.json`,JSON.stringify({status:'APPROVED',personId:'private-person',sessionId:'private-session',document:'private-document',expiresAt:Date.now()+10000}));
 await writeFile(`${base}/lock.json`,JSON.stringify({id:'interrupted',kind:'approve',createdAt:1}));
 await writeFile(`${paths.wallet}/pending.json`,JSON.stringify({createdAt:2,hash:'a'.repeat(64)}));
 const backend=await createDemoBackend({base,paths,run:async()=>{calls++;throw Error('Unresolved')}});
 const snapshot=await backend.snapshot(),serialized=JSON.stringify(snapshot);assert.equal(snapshot.owner,key.publicKey());for(const secret of[key.secret(),'private-document','private-person','private-session'])assert(!serialized.includes(secret));assert.equal(snapshot.job.kind,'approve');
 await backend.action('reconcile');await wait(async()=>(await backend.snapshot()).job.state==='RECOVERY_REQUIRED');assert.equal(calls,1);assert((await backend.snapshot()).busy);await assert.rejects(backend.action('approve',{digest:'a'.repeat(64)}),/Another action/);assert(JSON.parse(await readFile(`${base}/lock.json`,'utf8')));
 }finally{await rm(root,{recursive:true,force:true})}
});
test('a snapshot started during a running action cannot claim completion using older files',async()=>{
 const root=await mkdtemp(`${tmpdir()}/gate-snapshot-`),paths={wallet:`${root}/wallet`,grants:`${root}/grants`,identity:`${root}/identity`,operations:`${root}/operations`};for(const d of Object.values(paths))await mkdir(d);activateJournal({journalDir:paths.operations,controlDir:paths.wallet});
 let release;const backend=await createDemoBackend({base:`${root}/ui`,paths,run:async()=>{await new Promise(r=>release=r);return'{}'}});
 try{await backend.action('identity');await wait(()=>release);const inFlight=backend.snapshot();release();const observed=await inFlight;assert.equal(observed.job.state,'RUNNING');assert.equal(observed.busy,true);await wait(async()=>!(await backend.snapshot()).busy)}finally{await rm(root,{recursive:true,force:true})}
});
