import test from 'node:test';
import assert from 'node:assert/strict';
import {DiditClient} from '../src/didit-client.mjs';
const workflow='3d2c5f1e-04db-487f-92f5-f2955abc42ad';
const session='11111111-2222-4333-8444-555555555555';
const ok=data=>({ok:true,status:200,json:async()=>data});
test('Didit session creation uses owner binding and fixed HTTPS origin, returns minimal result',async()=>{
 let request;
 const client=new DiditClient({apiKey:'synthetic',workflow,fetcher:async(url,opts)=>{request={url,opts};return ok({session_id:session,workflow_id:workflow,vendor_data:'owner-pilot',status:'Not Started',url:'https://verify.didit.me/session/test',session_token:'private',passport:'private'});}});
 assert.deepEqual(await client.create('owner-pilot'),{sessionId:session,workflowId:workflow,ownerRef:'owner-pilot',status:'NOT_STARTED',url:'https://verify.didit.me/session/test'});
 assert.equal(request.url,'https://verification.didit.me/v3/session/');
 assert.equal(request.opts.redirect,'error');
 assert.deepEqual(JSON.parse(request.opts.body),{workflow_id:workflow,vendor_data:'owner-pilot'});
});
test('Didit HTTP errors never expose API key or provider payload',async()=>{
 const client=new DiditClient({apiKey:'synthetic-secret',workflow,fetcher:async()=>({ok:false,status:403,json:async()=>({detail:'synthetic-secret'})})});
 await assert.rejects(client.create('owner-pilot'),e=>e.message==='Didit HTTP 403');
});
test('Didit rejects untrusted link and mismatched owner/workflow/session',async()=>{
 const base={session_id:session,workflow_id:workflow,vendor_data:'owner-pilot',status:'Approved',url:'https://verify.didit.me/session/test'};
 for(const patch of [{url:'https://evil.invalid/session'},{vendor_data:'other'},{workflow_id:session},{session_id:'bad'}]) {
  const client=new DiditClient({apiKey:'synthetic',workflow,fetcher:async()=>ok({...base,...patch})});
  await assert.rejects(client.create('owner-pilot'));
 }
 const client=new DiditClient({apiKey:'synthetic',workflow,fetcher:async()=>ok({...base,session_id:workflow})});
 await assert.rejects(client.decision({sessionId:session,ownerRef:'owner-pilot'}));
});
test('Didit decision preserves only bound minimal status and never grants payment authority',async()=>{
 for(const raw of ['Not Started','In Progress','In Review','Declined','Approved','APPROVED','Expired','unexpected']) {
  const client=new DiditClient({apiKey:'synthetic',workflow,fetcher:async()=>ok({session_id:session,workflow_id:workflow,vendor_data:'owner-pilot',status:raw,id_verifications:[{full_name:'private'}]})});
  const decision=await client.decision({sessionId:session,ownerRef:'owner-pilot'});
  assert.equal(decision.authorityGranted,false);
  assert.equal(decision.approved,['Approved','APPROVED'].includes(raw));
  assert(!JSON.stringify(decision).includes('private'));
 }
});
