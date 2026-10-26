import {Address,Contract,Networks,TransactionBuilder,nativeToScVal} from '@stellar/stellar-sdk';
export function validatePreparedPayment(prepared,terms){
 try{
  const tx=TransactionBuilder.fromXDR(prepared.envelope,Networks.TESTNET);
  const expected=new Contract(terms.token).call('transfer',new Address(terms.account).toScVal(),new Address(terms.recipient).toScVal(),nativeToScVal(BigInt(terms.amount),{type:'i128'})).body.invokeHostFunctionOp.hostFunction;
  return prepared.network==='testnet' && Buffer.from(tx.hash()).toString('hex')===prepared.hash && tx.operations.length===1 && tx.operations[0].type==='invokeHostFunction' && Buffer.from(tx.operations[0].func.toXDR()).equals(Buffer.from(expected.toXDR()));
 }catch{return false;}
}
export function transactionLookupEvidence(result,{hash,envelope,network='testnet'}){
 let verifiedEnvelope=false;
 if(network==='testnet'&&['SUCCESS','FAILED'].includes(result.status)&&result.envelopeXdr){
  try{const encoded=typeof result.envelopeXdr==='string'?result.envelopeXdr:result.envelopeXdr.toXDR('base64');
   const tx=TransactionBuilder.fromXDR(encoded,Networks.TESTNET);
   const original=TransactionBuilder.fromXDR(envelope,Networks.TESTNET);
   verifiedEnvelope=Buffer.from(tx.hash()).toString('hex')===hash&&Buffer.from(original.hash()).toString('hex')===hash;
  }catch{}
 }
 return {status:result.status,hash,network,verifiedEnvelope,ledger:result.ledger};
}
