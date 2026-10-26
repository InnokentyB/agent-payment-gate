import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { externalSigner } from './oz-auth.mjs';
const symbol=s=>xdr.ScVal.scvSymbol(s);
const vec=a=>xdr.ScVal.scvVec(a);
const u32=n=>xdr.ScVal.scvU32(n);
const addr=s=>new Address(s).toScVal();
const amount=n=>nativeToScVal(BigInt(n),{type:'i128'});
const map=entries=>xdr.ScVal.scvMap(entries.sort((a,b)=>a[0].type === 'scvSymbol' && b[0].type === 'scvSymbol' ? (a[0].sym.toString() < b[0].sym.toString() ? -1 : 1) : Buffer.compare(Buffer.from(a[0].toXDR()),Buffer.from(b[0].toXDR()))).map(([key,val])=>new xdr.ScMapEntry({key,val})));
const struct=o=>map(Object.entries(o).map(([k,v])=>[symbol(k),v]));
export function ruleArgs({token,recipient,agent,verifier,spending,recipientPolicy,expires,budgetUnits='50000000',perPaymentUnits='20000000',periodLedgers=17280}) {
  return [vec([symbol('CallContract'),addr(token)]),nativeToScVal('Agent payments'),u32(expires),
    vec([externalSigner(verifier,agent.rawPublicKey())]),map([
      [addr(spending),struct({spending_limit:amount(budgetUnits),period_ledgers:u32(periodLedgers)})],
      [addr(recipientPolicy),struct({token:addr(token),recipient:addr(recipient),per_payment:amount(perPaymentUnits)})],
    ])];
}
