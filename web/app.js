const $=id=>document.getElementById(id);
let state=null,csrf='',posting=false,lastJob=null;
const xlm=units=>`${Number(BigInt(units||0))/1e7}`;
const short=s=>s?`${s.slice(0,7)}…${s.slice(-6)}`:'—';
const newInvoice=()=>{const id=`demo-${crypto.randomUUID()}`;$('invoice').value=id;sessionStorage.setItem('invoice',id)};
$('invoice').value=sessionStorage.getItem('invoice')||'';if(!$('invoice').value)newInvoice();
function message(title,text,kind=''){$('activity').hidden=false;$('activity-title').textContent=title;$('activity-message').textContent=text;$('activity').className=`activity ${kind}`}
function badge(id,text,good=false){$(id).textContent=text;$(id).className=`badge ${good?'good':''}`}
function step(id,done,text){$(id).textContent=text;$(id).closest('li').classList.toggle('step-complete',done)}
function render(s){
 state=s;const active=s.permission.status==='ACTIVE',installed=['ACTIVE','LOCAL_EXPIRED'].includes(s.permission.status),busy=s.busy||posting,identity=s.identity.status==='APPROVED'&&s.identity.current;
 badge('identity-badge',identity?'Verified':s.identity.status==='APPROVED'?'Check again':s.identity.status.replaceAll('_',' '),identity);
 badge('permission-badge',s.permission.status==='ACTIVE'?'Active':s.permission.status==='REVOKED'?'Revoked':s.permission.status==='LOCAL_EXPIRED'?'Expired locally':'Not granted',active);
 $('identity-detail').textContent=identity?`Existing verification confirmed. Valid locally until ${new Date(s.identity.expiresAt).toLocaleString()}.`:'Open the existing Didit session, then check its status. A new verification is not created automatically.';
 $('verify-link').hidden=!s.identity.verificationUrl;if(s.identity.verificationUrl)$('verify-link').href=s.identity.verificationUrl;
 $('identity-check').disabled=busy||installed;
 $('account-link').textContent=short(s.account);if(s.account)$('account-link').href=`https://stellar.expert/explorer/testnet/contract/${s.account}`;
 $('review-permission').disabled=busy||installed||!identity;
 const proposal=s.proposal;const showProposal=identity&&!!proposal&&!installed&&proposal.grant.expiresAt>Date.now()&&proposal.grant.id!==s.permission.grant?.id;
 $('consent-review').hidden=!showProposal;if(showProposal){$('review-owner').textContent=proposal.grant.owner;$('review-agent').textContent=proposal.grant.agent;$('review-recipient').textContent=proposal.grant.recipient;$('review-ledger').textContent=proposal.grant.validUntilLedger}
 $('sign-permission').disabled=busy||!showProposal||!$('consent-check').checked;
 const g=installed?s.permission.grant:showProposal?proposal.grant:null;
 $('grant-expiry').textContent=g?new Date(g.expiresAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'1 hour after review';
 $('spent').textContent=`${installed?'':'Previous grant: '}${xlm(s.permission.spentUnits)} / 5 XLM spent`;
 $('pay').disabled=busy||!active||!identity;$('revoke-button').disabled=busy||!installed;
 for(const id of ['refresh','check-payment','new-invoice'])$(id).disabled=busy;
 $('check-payment').disabled=posting||(s.busy&&s.job?.state!=='RECOVERY_REQUIRED');
 const pending=s.operations.some(o=>['UNKNOWN','PENDING','SUBMITTING','PREPARED'].includes(o.state));if(pending){$('pay').disabled=true;$('new-invoice').disabled=true;}
 $('amount').disabled=busy;$('recipient').disabled=busy;$('invoice').disabled=busy;
 $('payment-hint').textContent=active?'Try 1 XLM. To show rejection, enter 2.0000001 XLM or choose another recipient. Keep the same invoice to check a repeated payment.':s.permission.status==='REVOKED'?'Permission revoked. Review a new permission to begin another demo.':'Grant permission before making a payment.';
 $('revoke-detail').textContent=s.permission.status==='REVOKED'?'The rule has been removed. The agent can no longer pay.':'Revoke the rule on-chain to stop future agent payments.';
 if(s.balances){$('account-balance').textContent=`${xlm(s.balances.account)} XLM`;$('merchant-balance').textContent=`${xlm(s.balances.merchant)} XLM`;$('balance-time').textContent=`Last read from testnet ${new Date(s.balances.checkedAt).toLocaleTimeString()}.`}
 const confirmed=s.operations.filter(o=>o.state==='CONFIRMED');step('step-identity',identity,identity?'Verified':'Check');step('step-permission',active,active?'Active':'');step('step-payment',confirmed.length>0,String(confirmed.length));step('step-revoke',s.permission.status==='REVOKED',s.permission.status==='REVOKED'?'Revoked':'');
 const tbody=$('receipts');tbody.replaceChildren();
 if(!s.operations.length){const row=tbody.insertRow();const td=row.insertCell();td.colSpan=4;td.className='empty';td.textContent='No payments yet. Your first receipt will appear here.'}
 for(const op of s.operations){const row=tbody.insertRow();row.insertCell().textContent=op.invoiceId;row.insertCell().textContent=`${xlm(op.amount)} XLM`;const td=row.insertCell(),tag=document.createElement('span');tag.className=`badge ${op.state==='CONFIRMED'?'good':op.state==='UNKNOWN'?'warning':''}`;tag.textContent=op.state==='CONFIRMED'?'Confirmed':op.state==='PREPARATION_FAILED'?'Rejected · not sent':op.state==='UNKNOWN'?'Awaiting confirmation':op.state.replaceAll('_',' ');td.append(tag);const hash=row.insertCell();if(op.hash){const a=document.createElement('a');a.href=`https://stellar.expert/explorer/testnet/tx/${op.hash}`;a.target='_blank';a.rel='noreferrer';a.textContent=short(op.hash);a.setAttribute('aria-label',`View transaction for ${op.invoiceId}`);hash.append(a)}else hash.textContent='Not submitted'}
 if(s.job){const signature=`${s.job.id}:${s.job.state}:${s.job.message}`;if(signature!==lastJob){lastJob=signature;message(s.job.state==='RUNNING'?'Working on testnet…':s.job.state==='DONE'?'Complete':s.job.state==='RECOVERY_REQUIRED'?'Reconciliation required':'Action stopped',s.job.message,s.job.state==='RUNNING'?'running':s.job.state==='DONE'?'':'failed')}}
}
async function load(){try{const res=await fetch('/api/state',{cache:'no-store'});if(!res.ok)throw Error('Status unavailable');const s=await res.json();csrf=s.csrf;$('connection').hidden=true;render(s)}catch{$('connection').hidden=false;$('connection').textContent='Cannot reach the demo server. No action was retried. Check the connection, then refresh this page.';for(const id of ['pay','sign-permission','revoke-button','review-permission','identity-check'])$(id).disabled=true}}
async function action(kind,input={}){if(posting||(state?.busy&&!(kind==='reconcile'&&state.job?.state==='RECOVERY_REQUIRED')))return;posting=true;if(state)render(state);try{const res=await fetch(`/api/${kind}`,{method:'POST',headers:{'Content-Type':'application/json','X-Demo-CSRF':csrf},body:JSON.stringify(input)});const data=await res.json();if(!res.ok)throw Error(data.error);message('Working on testnet…','The action is running. Please keep this invoice.','running')}catch(e){message('Action stopped',e.message,'failed')}finally{posting=false;await load()}}
$('identity-check').onclick=()=>action('identity');$('refresh').onclick=()=>action('sync');$('review-permission').onclick=()=>{$('consent-check').checked=false;action('prepare')};$('consent-check').onchange=()=>state&&render(state);$('sign-permission').onclick=()=>{if($('consent-check').checked)action('approve',{digest:state.proposal.digest})};$('new-invoice').onclick=newInvoice;$('invoice').oninput=()=>sessionStorage.setItem('invoice',$('invoice').value);$('payment-form').onsubmit=e=>{e.preventDefault();action('pay',{invoiceId:$('invoice').value,amount:$('amount').value,recipient:$('recipient').value})};$('check-payment').onclick=()=>action('reconcile');$('revoke-button').onclick=()=>action('revoke');
await load();setInterval(load,1800);
