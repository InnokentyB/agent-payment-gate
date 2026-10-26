// Synthetic subprocess adapter for actual payment lifecycle module; no keys or RPC.
if(process.argv[2]){
 const {PaymentJournal,payOperation,reconcileOperation}=await import('../../src/payment-operations.mjs');
 const {appendFile,readFile}=await import('node:fs/promises');const {join}=await import('node:path');
 const root=process.argv[2],mode=process.argv[3];const journal=new PaymentJournal({journalDir:join(root,'journal'),controlDir:join(root,'control')});
 const terms={network:'testnet',account:'synthetic-account',invoiceId:'inv-1',token:'synthetic-token',recipient:'synthetic-merchant',amount:'10000000'};
 const event=async e=>appendFile(join(root,'events.txt'),`${e}\n`);
 const a={prepare:async()=>{await event('PREPARE');await new Promise(r=>setTimeout(r,50));return {hash:'a'.repeat(64),envelope:'synthetic-envelope',network:'testnet'};},validatePrepared:()=>true,beforeSend:async()=>{if(mode==='crash-before-send')process.exit(72);},send:async()=>{await event('SEND');return {status:'PENDING'};},lookup:async()=>{const events=await readFile(join(root,'events.txt'),'utf8');if(!events.split('\n').includes('SEND'))return {status:'NOT_FOUND',hash:'a'.repeat(64),network:'testnet'};await event('LOOKUP_SUCCESS');if(mode==='crash-after-success')process.exit(72);return {status:'SUCCESS',hash:'a'.repeat(64),network:'testnet',verifiedEnvelope:true,ledger:1};}};
 try{const result=mode==='reconcile'?await reconcileOperation(journal,terms,a):await payOperation(journal,terms,a);console.log(JSON.stringify(result));}finally{journal.close();}
}
