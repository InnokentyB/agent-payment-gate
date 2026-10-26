import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {canonicalDigest} from './identity-grants.mjs';
export async function archiveGrantRecord(base,kind,value){
 if(!['credentials','consents'].includes(kind))throw new Error('Invalid archive kind');
 const digest=canonicalDigest(value);const dir=join(base,'history',kind);await mkdir(dir,{recursive:true,mode:0o700});const path=join(dir,`${digest}.json`);
 try{await writeFile(path,JSON.stringify(value),{flag:'wx',mode:0o600,flush:true});}catch(error){if(error.code!=='EEXIST')throw error;const existing=JSON.parse(await readFile(path,'utf8'));if(canonicalDigest(existing)!==digest)throw new Error('Immutable grant archive integrity failure');}
 return digest;
}
