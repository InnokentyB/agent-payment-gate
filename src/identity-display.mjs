// Display-only projection of a trusted provider decision. Never an authorization credential.
export const approved=status=>typeof status==='string'&&status.trim().toUpperCase().replaceAll(' ','_')==='APPROVED';
function maskedPart(value,keep){
 if(typeof value!=='string'||value.length>120||/[\p{Cc}\p{Cf}]/u.test(value))return null;
 const letters=Array.from(value.normalize('NFC')).filter(c=>/\p{L}/u.test(c));if(!letters.length)return null;
 const prefix=letters.slice(0,Math.min(keep,Math.max(0,letters.length-1))).join('');
 return (prefix?prefix[0].toUpperCase()+prefix.slice(1).toLowerCase():'')+'***';
}
export function identityDisplayFromDecision(raw){
 if(!approved(raw?.status))return null;
 const id=Array.isArray(raw.id_verifications)?raw.id_verifications.find(v=>approved(v.status)&&maskedPart(v.first_name,2)&&maskedPart(v.last_name,1)):null;
 if(!id)return null;
 return {maskedName:`${maskedPart(id.first_name,2)} ${maskedPart(id.last_name,1)}`,checks:{document:true,liveness:Array.isArray(raw.liveness_checks)&&raw.liveness_checks.some(v=>approved(v.status)),faceMatch:Array.isArray(raw.face_matches)&&raw.face_matches.some(v=>approved(v.status))}};
}
