// Owner-operated identity pilot. No wallet runtime mount, signer or payment authority.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {DiditClient} from '../src/didit-client.mjs';
const statePath='/runtime/didit-pilot.json';
const command=process.argv[2]||'check';
try {
 const config={};
 for(const line of (await readFile('/run/secrets/didit.env','utf8')).split(/\r?\n/)){const match=line.match(/^(DIDIT_API_KEY|DIDIT_WORKFLOW_ID)=(.*)$/);if(match)config[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
 const client=new DiditClient({apiKey:config.DIDIT_API_KEY,workflow:config.DIDIT_WORKFLOW_ID});
 const keyMode=config.DIDIT_API_KEY.startsWith('sk_test_')?'sandbox':config.DIDIT_API_KEY.startsWith('sk_live_')?'live':'legacy-unknown';
 const readState=async()=>JSON.parse(await readFile(statePath,'utf8'));
 const save=async(data)=>{await writeFile(`${statePath}.tmp`,JSON.stringify(data),{mode:0o600});await rename(`${statePath}.tmp`,statePath);};
 if(command==='check') {
  console.log(JSON.stringify({access:'OK',keyMode,workflow:await client.workflowSummary(),sessionCreated:false},null,2));
 } else if(command==='create') {
  const ownerRef='hackmeridian-owner-pilot-20261025';
  let state;
  try {await writeFile(statePath,JSON.stringify({phase:'CREATING',ownerRef,workflowId:client.workflow,createdAt:new Date().toISOString()}),{mode:0o600,flag:'wx'});}
  catch(error){if(error.code!=='EEXIST')throw error;state=await readState();if(state.phase!=='CREATED')throw new Error('Previous session creation is unresolved; inspect Didit console before retry');console.log(JSON.stringify({reused:true,keyMode,...state.session},null,2));process.exit(0);}
  const session=await client.create(ownerRef);
  await save({phase:'CREATED',ownerRef,workflowId:client.workflow,session,createdAt:new Date().toISOString()});
  console.log(JSON.stringify({reused:false,keyMode,...session,authorityGranted:false},null,2));
 } else if(command==='status') {
  const state=await readState();if(state.phase!=='CREATED')throw new Error('No resolved Didit session');
  const result=await client.decision(state.session);
  await save({...state,lastDecision:result,checkedAt:new Date().toISOString()});
  console.log(JSON.stringify({keyMode,...result},null,2));
 } else throw new Error('Unknown command');
} catch(error) {
 const safe=/^(Didit HTTP \d+|Invalid Didit configuration|Didit session binding mismatch|Invalid Didit (verification URL|response)|Didit request failed; outcome unknown, do not recreate session automatically|Previous session creation is unresolved; inspect Didit console before retry|No resolved Didit session|Unknown command)$/;
 console.error(safe.test(error.message)?error.message:'Didit pilot failed (details suppressed to protect credentials)');process.exitCode=1;
}
