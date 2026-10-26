const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses=new Set(['NOT_STARTED','IN_PROGRESS','IN_REVIEW','APPROVED','DECLINED','EXPIRED','ABANDONED','RESUBMITTED']);
export class DiditClient {
 constructor({apiKey,workflow,fetcher=fetch}) {
  if(typeof apiKey!=='string'||!apiKey||!uuid.test(workflow))throw new Error('Invalid Didit configuration');
  this.apiKey=apiKey;this.workflow=workflow;this.fetcher=fetcher;
 }
 async request(path,body) {
  let response;
  try {response=await this.fetcher(`https://verification.didit.me${path}`,{method:body?'POST':'GET',headers:{'x-api-key':this.apiKey,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});}
  catch {throw new Error('Didit request failed; outcome unknown, do not recreate session automatically');}
  if(!response.ok)throw new Error(`Didit HTTP ${response.status}`);
  try{return await response.json();}catch{throw new Error('Invalid Didit response');}
 }
 validate(data,{ownerRef,sessionId},withUrl=false) {
  if(!uuid.test(data.session_id)||data.workflow_id!==this.workflow||data.vendor_data!==ownerRef||(sessionId&&data.session_id!==sessionId))throw new Error('Didit session binding mismatch');
  const normalized=typeof data.status==='string'?data.status.trim().toUpperCase().replaceAll(' ','_'):'UNKNOWN';
  const result={sessionId:data.session_id,workflowId:this.workflow,ownerRef,status:statuses.has(normalized)?normalized:'UNKNOWN'};
  if(withUrl){let url;try{url=new URL(data.url);}catch{throw new Error('Invalid Didit verification URL');}if(url.protocol!=='https:'||url.hostname!=='verify.didit.me'||url.port||url.username||url.password)throw new Error('Invalid Didit verification URL');result.url=url.href;}
  return result;
 }
 async create(ownerRef){if(typeof ownerRef!=='string'||!ownerRef)throw new Error('Missing owner binding');return this.validate(await this.request('/v3/session/',{workflow_id:this.workflow,vendor_data:ownerRef}),{ownerRef},true);}
 async decision({sessionId,ownerRef}){if(!uuid.test(sessionId))throw new Error('Invalid session ID');const data=this.validate(await this.request(`/v3/session/${sessionId}/decision/`),{ownerRef,sessionId});return {...data,approved:data.status==='APPROVED',authorityGranted:false};}
 async workflowSummary(){const w=await this.request(`/v3/workflows/${this.workflow}/`);return {workflowId:w.workflow_id,features:w.features,minPrice:w.min_price,maxPrice:w.max_price,active:w.is_archived===false};}
}
